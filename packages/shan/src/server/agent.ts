import { createOpenAI } from "@ai-sdk/openai";
import {
  generateText,
  isStepCount,
  type LanguageModel,
  type ModelMessage,
} from "ai";
import { DEFAULT_SHAN_MODEL_ID } from "../models";
import type { ShanConversationMessage, ShanPromptContext } from "../types";
import { promptWithContext } from "./context";
import {
  applyForPreview,
  assertNoActivePreview,
  extendActivePreview,
} from "./proposals";
import type { ActivityUpdate } from "./sessions";
import { createAgentTools } from "./tools";
import { WorkspaceDraft } from "./workspace";

export type AgentOptions = {
  root: string;
  prompt: string;
  context?: ShanPromptContext;
  apiKey?: string;
  model?: LanguageModel;
  modelId?: string;
  instructions?: string;
  maxSteps?: number;
  history?: ShanConversationMessage[];
  onActivity?: (activity: ActivityUpdate) => void | Promise<void>;
  sessionId?: string;
  extendPreview?: boolean;
};

function conversationHistory(
  messages: ShanConversationMessage[],
): ModelMessage[] {
  return messages
    .filter((message) => message.text.trim())
    .map((message) => ({ role: message.role, content: message.text }));
}

export async function runCodingAgent(options: AgentOptions) {
  const workspace = await WorkspaceDraft.create(options.root);
  if (!options.extendPreview) await assertNoActivePreview(workspace.root);
  const apiKey = options.apiKey ?? process.env.NEBIUS_API_KEY;
  if (!options.model && !apiKey) {
    throw new Error("Set NEBIUS_API_KEY in your Next.js server environment.");
  }
  const model =
    options.model ??
    createOpenAI({
      baseURL: "https://api.tokenfactory.nebius.com/v1/",
      apiKey,
    }).chat(options.modelId ?? DEFAULT_SHAN_MODEL_ID);

  const result = await generateText({
    model,
    system: `You are a careful coding agent working in a Next.js project.
Inspect the relevant files before editing. Make a focused, complete implementation of the user's request.
The write, edit, and remove tools build a draft. After you finish, the draft is automatically applied so the user can try it in their running app, then keep or discard it.
Never try to access secrets, generated output, dependencies, or paths outside the project. Do not add secrets to code.
You cannot run commands, so do not claim that tests or builds passed. End with a concise summary of what your draft changes.
${options.instructions ?? ""}`,
    messages: [
      ...conversationHistory(options.history ?? []),
      {
        role: "user",
        content: promptWithContext(options.prompt, options.context),
      },
    ],
    tools: createAgentTools(workspace, options.onActivity),
    stopWhen: isStepCount(Math.min(Math.max(options.maxSteps ?? 24, 1), 40)),
  });

  return options.extendPreview && options.sessionId
    ? extendActivePreview(
        workspace.root,
        result.text,
        workspace.getChanges(),
        options.sessionId,
      )
    : applyForPreview(
        workspace.root,
        result.text,
        workspace.getChanges(),
        options.sessionId,
      );
}
