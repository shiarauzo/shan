import type { LanguageModel } from "ai";
import {
  DEFAULT_SHAN_MODEL_ID,
  SHAN_MODELS,
  type ShanModelOption,
} from "./models";
import { createMotionRouteHandlers } from "./motion-next";
import { runCodingAgent } from "./server/agent";
import { normalizePromptContext } from "./server/context";
import {
  discardProposal,
  getActiveProposal,
  keepProposal,
} from "./server/proposals";
import {
  beginTurn,
  completeTurn,
  failTurn,
  getSession,
  listSessions,
  recordActivity,
  setProposalStatus,
  startNewSession,
} from "./server/sessions";
import { WorkspaceDraft } from "./server/workspace";

export type ShanRouteOptions = {
  /** Project directory the agent may inspect. Defaults to process.cwd(). */
  root?: string;
  /** Disabled by default when NODE_ENV is production. */
  enabled?: boolean;
  apiKey?: string;
  model?: LanguageModel;
  /** Default model ID. Add `models` with one entry to disable model switching. */
  modelId?: string;
  /** Models exposed by the editor and accepted by this route. */
  models?: readonly ShanModelOption[];
  instructions?: string;
  maxSteps?: number;
  /** Additional accepted request origins, for proxied local development. */
  allowedOrigins?: string[];
};

function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

function sameOrigin(request: Request, allowed: string[]) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  if (allowed.includes(origin)) return true;
  try {
    const requestHost =
      request.headers.get("x-forwarded-host") ??
      request.headers.get("host") ??
      new URL(request.url).host;
    return new URL(origin).host === requestHost;
  } catch {
    return false;
  }
}

export function createShanRouteHandler(options: ShanRouteOptions = {}) {
  const enabled = options.enabled ?? process.env.NODE_ENV !== "production";
  const rootPromise = WorkspaceDraft.create(options.root ?? process.cwd()).then(
    (workspace) => workspace.root,
  );
  const models: ShanModelOption[] = options.model
    ? []
    : [...(options.models ?? SHAN_MODELS)];
  if (
    options.modelId &&
    !models.some((model) => model.id === options.modelId)
  ) {
    models.unshift({
      id: options.modelId,
      label: options.modelId.split("/").at(-1) ?? options.modelId,
      description: "Custom configured model.",
    });
  }
  const defaultModelId =
    options.modelId ?? models[0]?.id ?? DEFAULT_SHAN_MODEL_ID;
  const modelCatalog = { models, defaultModelId };
  const acceptedModelIds = new Set(models.map((model) => model.id));

  function selectedModel(body: Record<string, unknown>) {
    return typeof body.modelId === "string" ? body.modelId : defaultModelId;
  }

  function invalidModel(body: Record<string, unknown>) {
    return (
      body.modelId !== undefined &&
      (typeof body.modelId !== "string" || !acceptedModelIds.has(body.modelId))
    );
  }

  function requestedSessionId(body: Record<string, unknown>) {
    return typeof body.sessionId === "string" &&
      /^[a-zA-Z0-9-]{1,100}$/.test(body.sessionId)
      ? body.sessionId
      : undefined;
  }

  return async function POST(request: Request): Promise<Response> {
    if (!enabled) return json({ status: "error", error: "Not found." }, 404);
    if (!sameOrigin(request, options.allowedOrigins ?? [])) {
      return json(
        { status: "error", error: "Cross-origin requests are not allowed." },
        403,
      );
    }
    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (contentLength > 20_000)
      return json({ status: "error", error: "Request is too large." }, 413);

    try {
      const body = (await request.json()) as Record<string, unknown>;
      const root = await rootPromise;
      if (body.action === "status") {
        const sessionId = requestedSessionId(body);
        const proposal = await getActiveProposal(root);
        const session = sessionId
          ? await getSession(root, sessionId)
          : await startNewSession(root);
        const sessionList = await listSessions(root);
        const ownedProposal =
          proposal && (!proposal.sessionId || proposal.sessionId === session.id)
            ? proposal
            : undefined;
        return ownedProposal
          ? json({
              status: "previewing",
              proposal: ownedProposal,
              session,
              sessions: sessionList,
              ...modelCatalog,
            })
          : json({
              status: "idle",
              session,
              sessions: sessionList,
              ...modelCatalog,
            });
      }
      if (body.action === "prompt") {
        if (typeof body.prompt !== "string" || !body.prompt.trim()) {
          return json({ status: "error", error: "A prompt is required." }, 400);
        }
        if (body.prompt.length > 10_000) {
          return json(
            {
              status: "error",
              error: "The prompt cannot exceed 10,000 characters.",
            },
            400,
          );
        }
        if (invalidModel(body)) {
          return json(
            { status: "error", error: "The selected model is not available." },
            400,
          );
        }
        const requestedId = requestedSessionId(body);
        const currentSession = requestedId
          ? await getSession(root, requestedId)
          : await startNewSession(root);
        const sessionId = currentSession.id;
        const activeProposal = await getActiveProposal(root);
        if (
          activeProposal?.sessionId &&
          activeProposal.sessionId !== sessionId
        ) {
          return json(
            {
              status: "error",
              error:
                "Another session has live changes. Keep or discard them before continuing here.",
            },
            409,
          );
        }
        const turn = await beginTurn(root, body.prompt.trim(), sessionId);
        try {
          const proposal = await runCodingAgent({
            root,
            prompt: body.prompt.trim(),
            context: normalizePromptContext(body.context),
            apiKey: options.apiKey,
            model: options.model,
            modelId: selectedModel(body),
            instructions: options.instructions,
            maxSteps: options.maxSteps,
            history: turn.history,
            onActivity: async (activity) => {
              await recordActivity(root, turn.turnId, activity, sessionId);
            },
            sessionId,
            extendPreview: !!activeProposal,
          });
          const session = await completeTurn(
            root,
            turn.turnId,
            proposal.summary,
            proposal.id,
            sessionId,
          );
          return json({ status: "previewing", proposal, session });
        } catch (error) {
          await failTurn(
            root,
            turn.turnId,
            error instanceof Error
              ? error.message
              : "The agent could not complete this turn.",
            sessionId,
          );
          throw error;
        }
      }

      if (body.action === "newSession") {
        const currentSessionId = requestedSessionId(body);
        const activeProposal = await getActiveProposal(root);
        if (activeProposal && activeProposal.sessionId === currentSessionId) {
          if (body.discardPreview !== true) {
            return json(
              {
                status: "error",
                error:
                  "Confirm discarding the current live changes before starting fresh.",
              },
              409,
            );
          }
          await discardProposal(activeProposal.id, root);
          await setProposalStatus(
            root,
            activeProposal.id,
            "discarded",
            currentSessionId,
          );
        }
        const session = await startNewSession(root);
        return json({
          status: "session_started",
          session,
          sessions: await listSessions(root),
        });
      }

      if (body.action === "motion") {
        if (invalidModel(body)) {
          return json(
            { status: "error", error: "The selected model is not available." },
            400,
          );
        }
        const motionHandlers = createMotionRouteHandlers({
          apiKey: options.apiKey,
          modelId: selectedModel(body),
        });
        return motionHandlers.POST(
          new Request(request.url, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ points: body.points }),
          }),
        );
      }

      if (body.action === "keep" || body.action === "discard") {
        if (typeof body.proposalId !== "string" || !body.proposalId) {
          return json(
            { status: "error", error: "A proposal ID is required." },
            400,
          );
        }
        const activeProposal = await getActiveProposal(root);
        const requestedId = requestedSessionId(body);
        if (
          activeProposal?.sessionId &&
          activeProposal.sessionId !== requestedId
        ) {
          return json(
            {
              status: "error",
              error: "This live preview belongs to another session.",
            },
            403,
          );
        }
        const ownerSessionId =
          activeProposal?.sessionId ?? requestedId ?? "default";
        if (body.action === "keep") {
          const files = await keepProposal(body.proposalId, root);
          const ownerSession = await setProposalStatus(
            root,
            body.proposalId,
            "kept",
            ownerSessionId,
          );
          const session =
            requestedId && requestedId !== ownerSessionId
              ? await getSession(root, requestedId)
              : ownerSession;
          return json({ status: "kept", files, session });
        }
        const files = await discardProposal(body.proposalId, root);
        const ownerSession = await setProposalStatus(
          root,
          body.proposalId,
          "discarded",
          ownerSessionId,
        );
        const session =
          requestedId && requestedId !== ownerSessionId
            ? await getSession(root, requestedId)
            : ownerSession;
        return json({ status: "discarded", files, session });
      }

      return json({ status: "error", error: "Unknown action." }, 400);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Shan request failed.";
      return json({ status: "error", error: message }, 500);
    }
  };
}
