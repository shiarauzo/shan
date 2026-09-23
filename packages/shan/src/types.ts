import type { ShanModelOption } from "./models";

export type ProposedFile = {
  path: string;
  status: "created" | "modified" | "deleted";
  additions: number;
  deletions: number;
  patch: string;
};

export type Proposal = {
  id: string;
  /** Conversation that owns this project-wide live preview. */
  sessionId?: string;
  summary: string;
  files: ProposedFile[];
  createdAt: string;
};

export type SelectedElementContext = {
  selector: string;
  tagName: string;
  id?: string;
  classNames: string[];
  text: string;
  html: string;
  bounds: { x: number; y: number; width: number; height: number };
};

export type ShanPromptContext = {
  selectedElement?: SelectedElementContext;
  drawing?: { x: number; y: number; t: number }[];
};

export type ShanConversationMessage = {
  id: string;
  turnId: string;
  role: "user" | "assistant";
  text: string;
  createdAt: string;
  proposalId?: string;
  proposalStatus?: "previewing" | "kept" | "discarded";
};

export type ShanAgentActivity = {
  id: string;
  turnId: string;
  kind: "read" | "search" | "edit" | "write" | "remove";
  label: string;
  detail: string;
  status: "running" | "complete" | "error";
  meta?: string;
  createdAt: string;
};

export type ShanSession = {
  id: string;
  title: string;
  status: "idle" | "working";
  createdAt: string;
  updatedAt: string;
  messages: ShanConversationMessage[];
  activities: ShanAgentActivity[];
};

export type ShanSessionSummary = {
  id: string;
  title: string;
  status: ShanSession["status"];
  createdAt: string;
  updatedAt: string;
  messageCount: number;
};

export type ShanApiResponse =
  | {
      status: "previewing";
      proposal: Proposal;
      session?: ShanSession;
      sessions?: ShanSessionSummary[];
      models?: ShanModelOption[];
      defaultModelId?: string;
    }
  | { status: "kept"; files: string[]; session?: ShanSession }
  | { status: "discarded"; files: string[]; session?: ShanSession }
  | {
      status: "idle";
      session?: ShanSession;
      sessions?: ShanSessionSummary[];
      models?: ShanModelOption[];
      defaultModelId?: string;
    }
  | {
      status: "session_started";
      session: ShanSession;
      sessions?: ShanSessionSummary[];
    }
  | { status: "waiting"; message: string }
  | { status: "reading"; spec: unknown; latencyMs: number; model: string }
  | { status: "error"; error?: string; message?: string };
