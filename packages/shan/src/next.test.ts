import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_SHAN_MODEL_ID, SHAN_MODELS } from "./models";
import { createShanRouteHandler } from "./next";
import { applyForPreview, getActiveProposal } from "./server/proposals";
import { WorkspaceDraft } from "./server/workspace";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

async function makeHandler(
  options: Parameters<typeof createShanRouteHandler>[0] = {},
) {
  return (await makeHandlerWithRoot(options)).handler;
}

async function makeHandlerWithRoot(
  options: Parameters<typeof createShanRouteHandler>[0] = {},
) {
  const root = await mkdtemp(join(tmpdir(), "shan-route-test-"));
  roots.push(root);
  return {
    root,
    handler: createShanRouteHandler({ root, enabled: true, ...options }),
  };
}

function request(body: unknown) {
  return new Request("http://localhost/api/shan", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("Shan route model selection", () => {
  test("returns the curated catalog and default model", async () => {
    const handler = await makeHandler();
    const response = await handler(request({ action: "status" }));
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(body.status).toBe("idle");
    expect(body.defaultModelId).toBe(DEFAULT_SHAN_MODEL_ID);
    expect(body.models).toEqual(SHAN_MODELS);
  });

  test("rejects model IDs that the route did not expose", async () => {
    const handler = await makeHandler();
    const response = await handler(
      request({
        action: "prompt",
        prompt: "Change the page",
        modelId: "unknown/model",
      }),
    );
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(400);
    expect(body).toEqual({
      status: "error",
      error: "The selected model is not available.",
    });
  });

  test("supports restricting the selector to configured models", async () => {
    const models = [SHAN_MODELS[2]];
    const handler = await makeHandler({ models, modelId: models[0].id });
    const response = await handler(request({ action: "status" }));
    const body = (await response.json()) as Record<string, unknown>;

    expect(body.models).toEqual(models);
    expect(body.defaultModelId).toBe(models[0].id);
  });

  test("rejects unavailable models for motion readings too", async () => {
    const handler = await makeHandler();
    const response = await handler(
      request({
        action: "motion",
        points: [
          { x: 0, y: 0, t: 0 },
          { x: 1, y: 1, t: 100 },
        ],
        modelId: "unknown/model",
      }),
    );

    expect(response.status).toBe(400);
  });
});

describe("Shan route conversations", () => {
  test("returns the current session and can start a fresh one", async () => {
    const handler = await makeHandler();
    const statusResponse = await handler(request({ action: "status" }));
    const status = (await statusResponse.json()) as {
      session: { id: string; messages: unknown[] };
      sessions: Array<{ id: string }>;
    };

    expect(status.session.messages).toEqual([]);
    expect(status.sessions.map((session) => session.id)).toContain(
      status.session.id,
    );

    const newSessionResponse = await handler(request({ action: "newSession" }));
    const next = (await newSessionResponse.json()) as {
      status: string;
      session: { id: string; messages: unknown[] };
    };

    expect(next.status).toBe("session_started");
    expect(next.session.id).not.toBe(status.session.id);
    expect(next.session.messages).toEqual([]);
  });

  test("hides and protects a live preview from other sessions", async () => {
    const { root, handler } = await makeHandlerWithRoot();
    await writeFile(join(root, "page.tsx"), "before\n");
    const draft = await WorkspaceDraft.create(root);
    await draft.write("page.tsx", "after\n");
    const proposal = await applyForPreview(
      draft.root,
      "Update",
      draft.getChanges(),
      "owner-session",
    );

    const statusResponse = await handler(
      request({ action: "status", sessionId: "other-session" }),
    );
    const status = (await statusResponse.json()) as {
      status: string;
      proposal?: unknown;
    };
    expect(status.status).toBe("idle");
    expect(status.proposal).toBeUndefined();

    const decision = await handler(
      request({
        action: "keep",
        proposalId: proposal.id,
        sessionId: "other-session",
      }),
    );
    expect(decision.status).toBe(403);
    expect(await getActiveProposal(draft.root)).toBeDefined();
  });

  test("starts fresh by explicitly discarding the current session preview", async () => {
    const { root, handler } = await makeHandlerWithRoot();
    await writeFile(join(root, "page.tsx"), "before\n");
    const draft = await WorkspaceDraft.create(root);
    await draft.write("page.tsx", "after\n");
    await applyForPreview(
      draft.root,
      "Update",
      draft.getChanges(),
      "owner-session",
    );

    const response = await handler(
      request({
        action: "newSession",
        sessionId: "owner-session",
        discardPreview: true,
      }),
    );

    expect(response.status).toBe(200);
    expect(await readFile(join(root, "page.tsx"), "utf8")).toBe("before\n");
    expect(await getActiveProposal(draft.root)).toBeUndefined();
  });
});
