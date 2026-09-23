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

// Adapted from Emil Kowalski's MIT-licensed animation skills.
const ANIMATION_CRAFT_GUIDANCE = `When the request involves animation or motion, act as a senior design engineer and apply this rubric:
- Start with restraint. Name the motion's purpose: feedback, spatial consistency, state indication, preventing a jarring change, explanation, or rare delight. Skip motion that has no clear purpose. Never animate keyboard-driven or extremely frequent actions; keep frequently seen motion nearly imperceptible.
- Reuse the project's existing motion library and easing/duration tokens. Choose the cheapest capable tool: CSS transitions for state changes, CSS @starting-style or animation for predetermined entrances, WAAPI for programmatic control without a dependency, and a motion library for springs, gestures, layout, or exit animation. Do not add a library for a simple fade or transform.
- Prefer transform and opacity so motion stays composited. clip-path is appropriate for reveals; height is an acceptable exception for accordions. Name transitioned properties explicitly—never use transition: all. When using Motion under load, prefer a complete transform string over x/y/scale shorthands.
- Use ease-out for entrances, exits, and direct feedback; ease-in-out for elements already moving on screen; ease for hover/color; linear only for constant motion or progress. Never use ease-in for UI. Reuse existing curves first; otherwise use cubic-bezier(0.23, 1, 0.32, 1) for strong ease-out, cubic-bezier(0.77, 0, 0.175, 1) for strong ease-in-out, or cubic-bezier(0.32, 0.72, 0, 1) for drawers.
- Keep motion responsive: press feedback 100–160ms, tooltips/popovers 125–200ms, dropdowns 150–250ms, and most UI under 300ms. A justified modal or drawer may take 200–500ms; marketing or explanatory motion may take longer. For interruptible gestures, prefer a spring such as { type: "spring", duration: 0.5, bounce: 0.2 }, with restrained bounce.
- Preserve physical continuity. Never enter from scale(0); use roughly scale(0.95) plus opacity. Anchor popovers and tooltips to their trigger's transform origin; keep modals centered. Enter and exit along the same spatial path. Use transitions for rapidly retriggered UI and springs for gestures so interruptions retarget smoothly. Stagger groups by only 30–80ms and never block interaction.
- Ship accessibility with the motion. Under prefers-reduced-motion, retain useful opacity/color feedback but remove or reduce position and transform movement. Gate hover motion with @media (hover: hover) and (pointer: fine).
- Match the product's personality and inspect surrounding code before choosing values. If feel cannot be established from code, make the smallest defensible choice and tell the user what to check in slow motion or on a real device.`;

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
${ANIMATION_CRAFT_GUIDANCE}
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
