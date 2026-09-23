"use client";

import {
  type CSSProperties,
  type FormEvent,
  type KeyboardEvent,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import {
  capturePageSnapshot,
  changedElements,
  isPageSnapshot,
  type PageSnapshot,
} from "./change-preview";
import type { ShanModelOption } from "./models";
import {
  cleanStroke,
  cleanupPlan,
  parseMotionSpec,
  playMotion,
  readingPlan,
  sampleForModel,
  stopMotion,
  strokeIsUsable,
  strokePolyline,
  useStrokeCapture,
} from "./motion";
import type {
  Proposal,
  SelectedElementContext,
  ShanAgentActivity,
  ShanApiResponse,
  ShanPromptContext,
  ShanSession,
  ShanSessionSummary,
} from "./types";

export type ShanEditorProps = {
  endpoint?: string;
  className?: string;
  placeholder?: string;
  /** Time for the Next.js compiler to settle before reloading the preview. */
  previewReloadDelayMs?: number;
};

type EditorMode = "idle" | "select" | "draw";
type ActivityFilter = "all" | "files" | "search";
type EditorState =
  | { name: "idle" }
  | { name: "working" }
  | { name: "refreshing"; proposal: Proposal }
  | { name: "previewing"; proposal: Proposal }
  | { name: "deciding"; proposal: Proposal; action: "keep" | "discard" }
  | { name: "success"; message: string }
  | { name: "error"; message: string; proposal?: Proposal };

type Box = { top: number; left: number; width: number; height: number };

const line = "rgba(255,255,255,.09)";
const strongLine = "rgba(255,255,255,.14)";
const styles: Record<string, CSSProperties> = {
  shell: {
    position: "fixed",
    zIndex: 2147483647,
    top: 12,
    right: 12,
    bottom: 12,
    display: "flex",
    flexDirection: "column",
    width: "min(430px, calc(100vw - 24px))",
    overflow: "hidden",
    border: `1px solid ${strongLine}`,
    borderRadius: 16,
    color: "#f3f4ef",
    background: "rgba(17,20,18,.975)",
    boxShadow: "0 28px 90px rgba(9,12,10,.36), 0 3px 12px rgba(9,12,10,.18)",
    backdropFilter: "blur(20px)",
    font: "500 13px/1.45 ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    flex: "0 0 54px",
    padding: "0 11px 0 13px",
    borderBottom: `1px solid ${line}`,
  },
  headerStart: { display: "flex", alignItems: "center", gap: 9 },
  minimizeButton: {
    display: "grid",
    placeItems: "center",
    width: 28,
    height: 28,
    border: `1px solid ${strongLine}`,
    borderRadius: 8,
    padding: 0,
    color: "#b7bcb7",
    background: "rgba(255,255,255,.035)",
    font: "600 16px/1 inherit",
    cursor: "pointer",
  },
  restoreButton: {
    position: "fixed",
    zIndex: 2147483647,
    right: 16,
    bottom: 16,
    display: "grid",
    placeItems: "center",
    width: 48,
    height: 48,
    border: "1px solid rgba(168,230,193,.28)",
    borderRadius: 15,
    padding: 0,
    color: "#a8e6c1",
    background: "rgba(17,20,18,.975)",
    boxShadow: "0 16px 44px rgba(9,12,10,.35), 0 2px 8px rgba(9,12,10,.24)",
    backdropFilter: "blur(20px)",
    font: "700 18px/1 ui-sans-serif, system-ui, sans-serif",
    cursor: "pointer",
  },
  brand: { display: "flex", alignItems: "center", gap: 8, fontWeight: 700 },
  mark: {
    display: "grid",
    placeItems: "center",
    width: 28,
    height: 28,
    border: "1px solid rgba(168,230,193,.2)",
    borderRadius: 9,
    color: "#a8e6c1",
    background: "#173d28",
    fontSize: 14,
  },
  live: {
    padding: "2px 6px",
    borderRadius: 999,
    color: "#a8e6c1",
    background: "#173d28",
    fontSize: 8,
    fontWeight: 700,
    letterSpacing: ".08em",
    textTransform: "uppercase",
  },
  newSession: {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    border: `1px solid ${strongLine}`,
    borderRadius: 8,
    padding: "6px 8px",
    color: "#d7dad5",
    background: "rgba(255,255,255,.035)",
    font: "600 11px/1.3 inherit",
    cursor: "pointer",
  },
  sessionHeader: {
    padding: "15px 16px 11px",
    borderBottom: `1px solid ${line}`,
  },
  sessionEyebrow: {
    color: "#656b66",
    fontSize: 9,
    letterSpacing: ".09em",
    textTransform: "uppercase",
  },
  sessionTitle: {
    overflow: "hidden",
    margin: "3px 0 2px",
    color: "#f3f4ef",
    fontSize: 16,
    fontWeight: 650,
    letterSpacing: "-.02em",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  sessionSelect: {
    width: "100%",
    margin: "4px 0 2px",
    border: 0,
    outline: 0,
    padding: "2px 22px 2px 0",
    color: "#f3f4ef",
    background: "#111412",
    font: "650 14px/1.4 inherit",
    cursor: "pointer",
  },
  sessionMeta: { color: "#969d96", fontSize: 9 },
  filters: { display: "flex", gap: 5, marginTop: 10 },
  filterButton: {
    border: "1px solid transparent",
    borderRadius: 6,
    padding: "5px 8px",
    color: "#969d96",
    background: "transparent",
    font: "600 9px/1.2 inherit",
    cursor: "pointer",
  },
  activeFilter: {
    borderColor: strongLine,
    color: "#e3e5e1",
    background: "#1d211e",
  },
  feed: {
    minHeight: 0,
    flex: 1,
    overflowY: "auto",
    padding: "15px 15px 24px",
    scrollbarColor: "#343935 transparent",
  },
  empty: {
    display: "grid",
    placeItems: "center",
    alignContent: "center",
    minHeight: 260,
    padding: 32,
    color: "#969d96",
    textAlign: "center",
  },
  message: {
    display: "grid",
    gridTemplateColumns: "27px minmax(0,1fr)",
    gap: 9,
    marginBottom: 17,
  },
  avatar: {
    display: "grid",
    placeItems: "center",
    width: 27,
    height: 27,
    border: `1px solid ${strongLine}`,
    borderRadius: 8,
    color: "#cfd2cd",
    background: "#222622",
    fontSize: 8,
    fontWeight: 700,
  },
  agentAvatar: { color: "#a8e6c1", background: "#173d28" },
  messageTime: { color: "#656b66", fontSize: 9 },
  messageText: {
    margin: "4px 0 0",
    color: "#d9dbd7",
    fontSize: 11,
    lineHeight: 1.58,
    whiteSpace: "pre-wrap",
  },
  assistantText: { color: "#b9beb9" },
  turnStatus: {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    marginTop: 7,
    borderRadius: 6,
    padding: "4px 7px",
    color: "#969d96",
    background: "#1d211e",
    fontSize: 8,
  },
  activityGroup: {
    margin: "6px 0 8px",
    overflow: "hidden",
    border: `1px solid ${line}`,
    borderRadius: 8,
    background: "rgba(0,0,0,.1)",
  },
  activityHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "7px 8px",
    color: "#969d96",
    fontSize: 9,
  },
  activityRow: {
    display: "grid",
    gridTemplateColumns: "23px minmax(0,1fr) auto",
    alignItems: "center",
    gap: 7,
    minHeight: 32,
    padding: "3px 7px",
    borderTop: "1px solid rgba(255,255,255,.06)",
  },
  activityIcon: {
    display: "grid",
    placeItems: "center",
    width: 22,
    height: 22,
    border: `1px solid ${line}`,
    borderRadius: 6,
    color: "#9bc4ff",
    background: "#1b1e1c",
    fontSize: 11,
  },
  activityLabel: {
    display: "block",
    overflow: "hidden",
    color: "#c5c9c4",
    font: "9px/1.35 ui-monospace, SFMono-Regular, Menlo, monospace",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  activityVerb: {
    color: "#969d96",
    fontFamily: "ui-sans-serif, system-ui, sans-serif",
    fontWeight: 650,
  },
  activityMeta: { color: "#656b66", fontSize: 8, whiteSpace: "nowrap" },
  runningDot: {
    display: "inline-block",
    width: 6,
    height: 6,
    borderRadius: "50%",
    background: "#e4c780",
    boxShadow: "0 0 0 3px rgba(228,199,128,.08)",
  },
  tools: {
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 5,
    flex: "0 0 auto",
    padding: "8px 10px",
    borderTop: `1px solid ${line}`,
    background: "#111412",
  },
  composerWrap: {
    flex: "0 0 auto",
    padding: "0 10px 10px",
    background: "#111412",
  },
  composer: {
    overflow: "hidden",
    border: `1px solid ${strongLine}`,
    borderRadius: 12,
    background: "#171a18",
    boxShadow: "0 5px 20px rgba(0,0,0,.16)",
  },
  textarea: {
    display: "block",
    width: "100%",
    minHeight: 43,
    maxHeight: 100,
    resize: "none",
    border: 0,
    outline: 0,
    padding: "11px 12px 5px",
    color: "inherit",
    background: "transparent",
    font: "inherit",
  },
  composerFooter: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "5px 7px 7px 11px",
  },
  sendHint: { marginLeft: "auto", color: "#656b66", fontSize: 9 },
  button: {
    border: 0,
    borderRadius: 7,
    padding: "7px 10px",
    color: "#142219",
    background: "#a8e6c1",
    font: "700 10px/1.3 inherit",
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  mutedButton: {
    border: `1px solid ${strongLine}`,
    borderRadius: 7,
    padding: "5px 7px",
    color: "#b7bcb7",
    background: "transparent",
    font: "600 9px/1.3 inherit",
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  select: {
    maxWidth: 126,
    minWidth: 0,
    marginRight: "auto",
    border: 0,
    outline: 0,
    padding: "3px 18px 3px 0",
    color: "#969d96",
    background: "#171a18",
    font: "600 9px/1.3 inherit",
    cursor: "pointer",
  },
  activeButton: {
    border: "1px solid #a8e6c1",
    color: "#dff5e7",
    background: "#173d28",
  },
  context: {
    minWidth: 0,
    flex: 1,
    overflow: "hidden",
    color: "#656b66",
    fontSize: 9,
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  proposal: {
    margin: "3px 0 17px 36px",
    overflow: "hidden",
    border: "1px solid rgba(168,230,193,.16)",
    borderRadius: 10,
    background: "rgba(168,230,193,.025)",
  },
  collapseButton: {
    border: 0,
    padding: 0,
    color: "#969d96",
    background: "transparent",
    font: "600 9px/1.3 inherit",
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  file: { borderTop: `1px solid ${line}`, padding: "6px 9px", fontSize: 9 },
  patch: {
    maxHeight: 180,
    overflow: "auto",
    margin: "7px 0 2px",
    padding: 8,
    borderRadius: 7,
    color: "#d1d5db",
    background: "#090a0d",
    font: "9px/1.45 ui-monospace, SFMono-Regular, Menlo, monospace",
    whiteSpace: "pre",
  },
};

async function post(endpoint: string, body: unknown): Promise<ShanApiResponse> {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = (await response.json()) as ShanApiResponse;
  if (!response.ok || result.status === "error") {
    throw new Error(
      result.status === "error"
        ? (result.error ?? result.message ?? "Shan request failed.")
        : `Request failed (${response.status})`,
    );
  }
  return result;
}

function escaped(value: string) {
  return typeof CSS !== "undefined" && CSS.escape
    ? CSS.escape(value)
    : value.replace(/[^a-zA-Z0-9_-]/g, "\\$&");
}

function selectorFor(element: Element) {
  if (element.id) return `#${escaped(element.id)}`;
  const parts: string[] = [];
  let current: Element | null = element;
  while (current && current !== document.body && parts.length < 6) {
    let part = current.tagName.toLowerCase();
    const parent: Element | null = current.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children).filter(
        (child) => child.tagName === current?.tagName,
      );
      if (siblings.length > 1)
        part += `:nth-of-type(${siblings.indexOf(current) + 1})`;
    }
    parts.unshift(part);
    current = parent;
  }
  return parts.join(" > ");
}

function elementContext(element: Element): SelectedElementContext {
  const rect = element.getBoundingClientRect();
  return {
    selector: selectorFor(element),
    tagName: element.tagName.toLowerCase(),
    ...(element.id ? { id: element.id } : {}),
    classNames: (element.getAttribute("class") ?? "")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 30),
    text: (element.textContent ?? "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 1_000),
    html: element.outerHTML.slice(0, 4_000),
    bounds: {
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    },
  };
}

function boxFor(element: Element | null): Box | null {
  if (!element?.isConnected) return null;
  const rect = element.getBoundingClientRect();
  return {
    top: rect.top,
    left: rect.left,
    width: rect.width,
    height: rect.height,
  };
}

function snapshotStorageKey(endpoint: string) {
  return `shan:page-before:${endpoint}`;
}

function sessionStorageKey(endpoint: string) {
  return `shan:session:${endpoint}`;
}

function readSessionId(endpoint: string) {
  try {
    return (
      window.sessionStorage.getItem(sessionStorageKey(endpoint)) ?? undefined
    );
  } catch {
    return undefined;
  }
}

function rememberSession(endpoint: string, session: ShanSession) {
  try {
    window.sessionStorage.setItem(sessionStorageKey(endpoint), session.id);
  } catch {
    /* Storage can be disabled. */
  }
}

function savePageSnapshot(endpoint: string, snapshot: PageSnapshot) {
  try {
    window.sessionStorage.setItem(
      snapshotStorageKey(endpoint),
      JSON.stringify(snapshot),
    );
  } catch {
    // A Change Preview still works when session storage is unavailable.
  }
}

function readPageSnapshot(endpoint: string) {
  try {
    const value: unknown = JSON.parse(
      window.sessionStorage.getItem(snapshotStorageKey(endpoint)) ?? "null",
    );
    return isPageSnapshot(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

function clearPageSnapshot(endpoint: string) {
  try {
    window.sessionStorage.removeItem(snapshotStorageKey(endpoint));
  } catch {
    /* Storage can be disabled. */
  }
}

function timeLabel(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

const activityPresentation: Record<
  ShanAgentActivity["kind"],
  { group: Exclude<ActivityFilter, "all">; glyph: string; color: string }
> = {
  read: { group: "files", glyph: "↳", color: "#9bc4ff" },
  search: { group: "search", glyph: "⌕", color: "#e4c780" },
  edit: { group: "files", glyph: "±", color: "#a8e6c1" },
  write: { group: "files", glyph: "+", color: "#a8e6c1" },
  remove: { group: "files", glyph: "−", color: "#a8e6c1" },
};

function visibleActivities(
  activities: ShanAgentActivity[],
  filter: ActivityFilter,
) {
  return activities.filter(
    (activity) =>
      filter === "all" || activityPresentation[activity.kind].group === filter,
  );
}

function ActivityList({
  activities,
  filter,
}: {
  activities: ShanAgentActivity[];
  filter: ActivityFilter;
}) {
  const visible = visibleActivities(activities, filter);
  if (visible.length === 0) return null;
  return (
    <div style={styles.activityGroup}>
      <div style={styles.activityHeader}>
        <span>Agent activity</span>
        <span>
          {visible.length} event{visible.length === 1 ? "" : "s"}
        </span>
      </div>
      {visible.map((activity) => (
        <div key={activity.id} style={styles.activityRow}>
          <span
            style={{
              ...styles.activityIcon,
              color: activityPresentation[activity.kind].color,
            }}
          >
            {activity.status === "running" ? (
              <i style={styles.runningDot} />
            ) : (
              activityPresentation[activity.kind].glyph
            )}
          </span>
          <span style={styles.activityLabel} title={activity.detail}>
            <b style={styles.activityVerb}>{activity.label}</b>{" "}
            {activity.detail}
          </span>
          <small style={styles.activityMeta}>
            {activity.status === "running" ? "Running" : activity.meta}
          </small>
        </div>
      ))}
    </div>
  );
}

export function ShanEditor({
  endpoint = "/api/shan",
  className,
  placeholder = "Describe a change…",
  previewReloadDelayMs = 500,
}: ShanEditorProps) {
  const [prompt, setPrompt] = useState("");
  const [models, setModels] = useState<ShanModelOption[]>([]);
  const [selectedModelId, setSelectedModelId] = useState<string>();
  const [state, setState] = useState<EditorState>({ name: "idle" });
  const [session, setSession] = useState<ShanSession>();
  const [sessionList, setSessionList] = useState<ShanSessionSummary[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string>();
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>("all");
  const [minimized, setMinimized] = useState(false);
  const [mode, setMode] = useState<EditorMode>("idle");
  const [selected, setSelected] = useState<SelectedElementContext | null>(null);
  const [selectedBox, setSelectedBox] = useState<Box | null>(null);
  const [hoverBox, setHoverBox] = useState<Box | null>(null);
  const [pageBeforeChange, setPageBeforeChange] = useState<PageSnapshot>();
  const [motionMessage, setMotionMessage] = useState("");
  const [areChangesExpanded, setAreChangesExpanded] = useState(true);
  const changesId = useId();
  const selectedNode = useRef<Element | null>(null);
  const feedNode = useRef<HTMLDivElement | null>(null);
  const stroke = useStrokeCapture({
    enabled: mode === "draw",
    onStart: () => setMotionMessage("Drawing note captured."),
  });
  const busy =
    state.name === "working" ||
    state.name === "refreshing" ||
    state.name === "deciding";
  const proposal =
    state.name === "refreshing" ||
    state.name === "previewing" ||
    state.name === "deciding"
      ? state.proposal
      : state.name === "error"
        ? state.proposal
        : undefined;

  const updateSelectedBox = useCallback(
    () => setSelectedBox(boxFor(selectedNode.current)),
    [],
  );

  useEffect(() => {
    let cancelled = false;
    void post(endpoint, {
      action: "status",
      sessionId: readSessionId(endpoint),
    })
      .then((result) => {
        if (!cancelled && "session" in result && result.session) {
          rememberSession(endpoint, result.session);
          setCurrentSessionId(result.session.id);
          setSession(result.session);
        }
        if (!cancelled && "sessions" in result && result.sessions) {
          setSessionList(result.sessions);
        }
        if (
          !cancelled &&
          (result.status === "idle" || result.status === "previewing") &&
          result.models
        ) {
          setModels(result.models);
          setSelectedModelId((selectedModel) => {
            let stored: string | null = null;
            try {
              stored = window.sessionStorage.getItem(`shan:model:${endpoint}`);
            } catch {}
            const candidate = selectedModel ?? stored ?? result.defaultModelId;
            return result.models?.some((model) => model.id === candidate)
              ? candidate
              : result.models?.[0]?.id;
          });
        }
        if (!cancelled && result.status === "previewing") {
          setState({ name: "previewing", proposal: result.proposal });
          setPageBeforeChange(readPageSnapshot(endpoint));
        } else if (!cancelled && result.status === "idle") {
          clearPageSnapshot(endpoint);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [endpoint]);

  useEffect(() => {
    if (state.name !== "working") return;
    let cancelled = false;
    const refresh = () =>
      void post(endpoint, {
        action: "status",
        sessionId: currentSessionId ?? readSessionId(endpoint),
      })
        .then((result) => {
          if (!cancelled && "session" in result && result.session) {
            rememberSession(endpoint, result.session);
            setSession(result.session);
          }
          if (!cancelled && "sessions" in result && result.sessions) {
            setSessionList(result.sessions);
          }
        })
        .catch(() => {});
    refresh();
    const timer = window.setInterval(refresh, 650);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [currentSessionId, endpoint, state.name]);

  useEffect(() => {
    const node = feedNode.current;
    if (node && (session?.updatedAt || state.name))
      node.scrollTop = node.scrollHeight;
  }, [session?.updatedAt, state.name]);

  useEffect(() => {
    if (!selected) return;
    updateSelectedBox();
    window.addEventListener("resize", updateSelectedBox);
    window.addEventListener("scroll", updateSelectedBox, true);
    return () => {
      window.removeEventListener("resize", updateSelectedBox);
      window.removeEventListener("scroll", updateSelectedBox, true);
    };
  }, [selected, updateSelectedBox]);

  useEffect(() => {
    if (mode !== "select") {
      setHoverBox(null);
      return;
    }
    const candidate = (target: EventTarget | null) => {
      const element = target instanceof Element ? target : null;
      return element?.closest("[data-shan-editor]") ? null : element;
    };
    const onMove = (event: PointerEvent) =>
      setHoverBox(boxFor(candidate(event.target)));
    const onClick = (event: MouseEvent) => {
      const element = candidate(event.target);
      if (!element) return;
      event.preventDefault();
      event.stopPropagation();
      selectedNode.current = element;
      setSelected(elementContext(element));
      setSelectedBox(boxFor(element));
      setHoverBox(null);
      setMode("idle");
      setMotionMessage("");
    };
    document.addEventListener("pointermove", onMove, true);
    document.addEventListener("click", onClick, true);
    return () => {
      document.removeEventListener("pointermove", onMove, true);
      document.removeEventListener("click", onClick, true);
    };
  }, [mode]);

  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setMode("idle");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function promptContext(): ShanPromptContext | undefined {
    const drawing = sampleForModel(stroke.getPoints());
    if (!selected && drawing.length === 0) return undefined;
    return {
      ...(selected ? { selectedElement: selected } : {}),
      ...(drawing.length ? { drawing } : {}),
    };
  }

  async function sendPrompt(event?: FormEvent) {
    event?.preventDefault();
    const value = prompt.trim();
    if (!value || busy || readOnly) return;
    setAreChangesExpanded(true);
    stopMotion(selectedNode.current);
    try {
      const before = capturePageSnapshot(document.body).snapshot;
      savePageSnapshot(endpoint, before);
      setPageBeforeChange(before);
    } catch {
      clearPageSnapshot(endpoint);
      setPageBeforeChange(undefined);
    }
    setState({ name: "working" });
    setPrompt("");
    try {
      const result = await post(endpoint, {
        action: "prompt",
        prompt: value,
        context: promptContext(),
        sessionId: currentSessionId,
        ...(selectedModelId ? { modelId: selectedModelId } : {}),
      });
      if (result.status !== "previewing")
        throw new Error("The agent returned an unexpected response.");
      if (result.session) {
        rememberSession(endpoint, result.session);
        setCurrentSessionId(result.session.id);
        setSession(result.session);
      }
      setState({ name: "refreshing", proposal: result.proposal });
      window.setTimeout(
        () => window.location.reload(),
        Math.max(0, previewReloadDelayMs),
      );
    } catch (error) {
      clearPageSnapshot(endpoint);
      setPageBeforeChange(undefined);
      setPrompt(value);
      setState({
        name: "error",
        message:
          error instanceof Error ? error.message : "Agent request failed.",
        ...(proposal ? { proposal } : {}),
      });
    }
  }

  async function decide(action: "keep" | "discard") {
    if (!proposal || busy) return;
    setState({ name: "deciding", proposal, action });
    try {
      const result = await post(endpoint, {
        action,
        proposalId: proposal.id,
        sessionId: currentSessionId,
      });
      if (action === "keep" && result.status !== "kept")
        throw new Error("The agent returned an unexpected response.");
      if (action === "discard" && result.status !== "discarded")
        throw new Error("The agent returned an unexpected response.");
      if (
        (result.status === "kept" || result.status === "discarded") &&
        result.session
      ) {
        rememberSession(endpoint, result.session);
        setSession(result.session);
      }
      const fileCount =
        result.status === "kept" || result.status === "discarded"
          ? result.files.length
          : 0;
      clearPageSnapshot(endpoint);
      setPageBeforeChange(undefined);
      setPrompt("");
      setState({
        name: "success",
        message:
          action === "keep"
            ? `Kept ${fileCount} changed file${fileCount === 1 ? "" : "s"}.`
            : `Discarded changes in ${fileCount} file${fileCount === 1 ? "" : "s"}.`,
      });
    } catch (error) {
      setState({
        name: "error",
        message:
          error instanceof Error
            ? error.message
            : `Could not ${action} changes.`,
        proposal,
      });
    }
  }

  async function newSession() {
    if (busy) return;
    if (
      proposal &&
      !window.confirm(
        "Discard the current live changes and start a fresh session?",
      )
    )
      return;
    try {
      const result = await post(endpoint, {
        action: "newSession",
        sessionId: currentSessionId,
        discardPreview: !!proposal,
      });
      if (result.status !== "session_started")
        throw new Error("The agent returned an unexpected response.");
      clearPageSnapshot(endpoint);
      clearContext();
      setPrompt("");
      rememberSession(endpoint, result.session);
      setCurrentSessionId(result.session.id);
      setSession(result.session);
      if (result.sessions) setSessionList(result.sessions);
      setState({ name: "idle" });
    } catch (error) {
      setState({
        name: "error",
        message:
          error instanceof Error
            ? error.message
            : "Could not start a new session.",
        proposal,
      });
    }
  }

  async function viewSession(sessionId: string) {
    if (busy || sessionId === session?.id) return;
    try {
      const result = await post(endpoint, { action: "status", sessionId });
      if (result.status !== "idle" && result.status !== "previewing") {
        throw new Error("The session could not be loaded.");
      }
      if (result.session) setSession(result.session);
      if (result.sessions) setSessionList(result.sessions);
      setState(
        result.status === "previewing"
          ? { name: "previewing", proposal: result.proposal }
          : { name: "idle" },
      );
    } catch (error) {
      setState({
        name: "error",
        message:
          error instanceof Error
            ? error.message
            : "Could not load the session.",
      });
    }
  }

  function playDrawing() {
    const points = stroke.getPoints();
    if (!selectedNode.current || !strokeIsUsable(points)) return;
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    playMotion(selectedNode.current, cleanupPlan(cleanStroke(points), reduced));
    setMotionMessage("Playing the drawing on the selected element.");
  }

  async function refineMotion() {
    const points = stroke.getPoints();
    if (!selectedNode.current || !strokeIsUsable(points)) return;
    setMotionMessage("Reading the drawing…");
    try {
      const result = await post(endpoint, {
        action: "motion",
        points: sampleForModel(points),
        ...(selectedModelId ? { modelId: selectedModelId } : {}),
      });
      if (result.status === "waiting") {
        setMotionMessage(result.message);
        playDrawing();
        return;
      }
      if (result.status !== "reading")
        throw new Error("The model did not return a motion.");
      const spec = parseMotionSpec(result.spec);
      if (!spec) throw new Error("The model did not return a motion.");
      const reduced = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      playMotion(selectedNode.current, readingPlan(spec, points, reduced));
      setMotionMessage(spec.reading || `Playing ${spec.name}.`);
    } catch (error) {
      setMotionMessage(
        error instanceof Error ? error.message : "Could not read the drawing.",
      );
    }
  }

  function clearContext() {
    stopMotion(selectedNode.current);
    selectedNode.current = null;
    setSelected(null);
    setSelectedBox(null);
    stroke.clear();
    setMode("idle");
    setMotionMessage("");
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendPrompt();
    }
  }

  function selectModel(modelId: string) {
    setSelectedModelId(modelId);
    try {
      window.sessionStorage.setItem(`shan:model:${endpoint}`, modelId);
    } catch {}
  }

  const drawingReady = strokeIsUsable(stroke.points);
  const readOnly = !!currentSessionId && session?.id !== currentSessionId;
  const contextLabel = selected
    ? `${selected.selector}${stroke.points.length ? ` · drawing ${stroke.points.length} points` : ""}`
    : stroke.points.length
      ? `Drawing note · ${stroke.points.length} points`
      : "No element selected — prompt applies globally";

  if (minimized) {
    return (
      <button
        data-shan-editor
        className={className}
        type="button"
        style={styles.restoreButton}
        aria-label="Restore Shan editor"
        title="Restore Shan editor"
        onClick={() => setMinimized(false)}
      >
        <span aria-hidden="true">✦</span>
      </button>
    );
  }

  return (
    <>
      {mode === "draw" ? (
        <div
          {...stroke.bindings}
          data-shan-editor
          role="application"
          aria-label="Draw a note over the page"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 2147483645,
            cursor: "crosshair",
            touchAction: "none",
          }}
        />
      ) : null}
      {stroke.points.length > 1 ? (
        <svg
          data-shan-editor
          viewBox="0 0 1 1"
          preserveAspectRatio="none"
          aria-hidden="true"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 2147483646,
            width: "100%",
            height: "100%",
            pointerEvents: "none",
          }}
        >
          <polyline
            points={strokePolyline(stroke.points)}
            fill="none"
            stroke="#7c3aed"
            strokeWidth="2.5"
            vectorEffect="non-scaling-stroke"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ) : null}
      {proposal && state.name !== "refreshing" ? (
        <ChangeHighlights before={pageBeforeChange} />
      ) : null}
      {hoverBox ? <Highlight box={hoverBox} color="#60a5fa" /> : null}
      {selectedBox ? <Highlight box={selectedBox} color="#a78bfa" /> : null}

      <aside
        data-shan-editor
        className={className}
        style={styles.shell}
        aria-label="Shan visual editor"
      >
        <header style={styles.header}>
          <div style={styles.headerStart}>
            <button
              type="button"
              style={styles.minimizeButton}
              aria-label="Minimize Shan editor"
              title="Minimize"
              onClick={() => {
                setMode("idle");
                setHoverBox(null);
                setMinimized(true);
              }}
            >
              <span aria-hidden="true">−</span>
            </button>
            <div style={styles.brand}>
              <span style={styles.mark}>✦</span>
              <span>Shan</span>
              <span style={styles.live}>Live</span>
            </div>
          </div>
          <button
            type="button"
            style={{ ...styles.newSession, opacity: busy ? 0.5 : 1 }}
            disabled={busy}
            onClick={() => void newSession()}
          >
            <span aria-hidden="true">＋</span> New
          </button>
        </header>

        <section style={styles.sessionHeader}>
          <div style={styles.sessionEyebrow}>
            {readOnly ? "Previous session · Read only" : "Current session"}
          </div>
          <select
            aria-label="Conversation session"
            value={session?.id ?? ""}
            onChange={(event) => void viewSession(event.target.value)}
            style={styles.sessionSelect}
          >
            {sessionList.map((summary) => (
              <option key={summary.id} value={summary.id}>
                {summary.id === currentSessionId ? "Current — " : ""}
                {summary.title}
              </option>
            ))}
            {session &&
            !sessionList.some((summary) => summary.id === session.id) ? (
              <option value={session.id}>{session.title}</option>
            ) : null}
          </select>
          <div style={styles.sessionMeta}>
            {session?.messages.length ?? 0} messages ·{" "}
            {session?.activities.length ?? 0} activities
            {session?.status === "working" ? " · Agent working" : ""}
          </div>
          <fieldset
            style={{
              ...styles.filters,
              minWidth: 0,
              marginRight: 0,
              marginBottom: 0,
              marginLeft: 0,
              padding: 0,
              border: 0,
            }}
            aria-label="Filter agent activity"
          >
            {(["all", "files", "search"] as const).map((filter) => (
              <button
                key={filter}
                type="button"
                style={{
                  ...styles.filterButton,
                  ...(activityFilter === filter ? styles.activeFilter : {}),
                }}
                onClick={() => setActivityFilter(filter)}
              >
                {filter === "all"
                  ? "All activity"
                  : filter === "files"
                    ? "Files"
                    : "Search"}
              </button>
            ))}
          </fieldset>
        </section>

        <div ref={feedNode} style={styles.feed} aria-live="polite">
          {!session || session.messages.length === 0 ? (
            <div style={styles.empty}>
              <span style={{ ...styles.mark, marginBottom: 12 }}>✦</span>
              <strong style={{ color: "#f3f4ef", fontSize: 14 }}>
                What should we change?
              </strong>
              <span style={{ maxWidth: 270, marginTop: 5, fontSize: 10 }}>
                Select an element, draw a note, or describe an update to start
                this session.
              </span>
            </div>
          ) : (
            session.messages.map((message) => {
              const activities = session.activities.filter(
                (activity) => activity.turnId === message.turnId,
              );
              return (
                <div key={message.id} style={styles.message}>
                  <span
                    style={{
                      ...styles.avatar,
                      ...(message.role === "assistant"
                        ? styles.agentAvatar
                        : {}),
                    }}
                  >
                    {message.role === "assistant" ? "✦" : "You"}
                  </span>
                  <div style={{ minWidth: 0 }}>
                    <time style={styles.messageTime}>
                      {message.role === "assistant" ? "Shan · " : ""}
                      {timeLabel(message.createdAt)}
                    </time>
                    {message.role === "assistant" ? (
                      <ActivityList
                        activities={activities}
                        filter={activityFilter}
                      />
                    ) : null}
                    <p
                      style={{
                        ...styles.messageText,
                        ...(message.role === "assistant"
                          ? styles.assistantText
                          : {}),
                      }}
                    >
                      {message.text}
                    </p>
                    {message.proposalStatus ? (
                      <span
                        style={{
                          ...styles.turnStatus,
                          color:
                            message.proposalStatus === "discarded"
                              ? "#e49d98"
                              : message.proposalStatus === "previewing"
                                ? "#a8e6c1"
                                : "#969d96",
                        }}
                      >
                        {message.proposalStatus === "previewing"
                          ? "● Changes live"
                          : message.proposalStatus === "kept"
                            ? "✓ Changes kept"
                            : "↶ Changes discarded"}
                      </span>
                    ) : null}
                  </div>
                </div>
              );
            })
          )}

          {session?.status === "working"
            ? (() => {
                const lastTurn = [...session.messages]
                  .reverse()
                  .find((message) => message.role === "user")?.turnId;
                const activities = session.activities.filter(
                  (activity) => activity.turnId === lastTurn,
                );
                return (
                  <div style={styles.message}>
                    <span style={{ ...styles.avatar, ...styles.agentAvatar }}>
                      ✦
                    </span>
                    <div style={{ minWidth: 0 }}>
                      <time style={styles.messageTime}>Shan · now</time>
                      <ActivityList
                        activities={activities}
                        filter={activityFilter}
                      />
                      <p
                        style={{
                          ...styles.messageText,
                          ...styles.assistantText,
                          color: "#969d96",
                        }}
                      >
                        <i style={{ ...styles.runningDot, marginRight: 8 }} />
                        Working on this turn…
                      </p>
                    </div>
                  </div>
                );
              })()
            : null}

          {proposal ? (
            <section style={styles.proposal} aria-label="Live changes">
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "9px 10px",
                  color: state.name === "refreshing" ? "#e4c780" : "#a8e6c1",
                  fontSize: 9,
                  fontWeight: 700,
                }}
              >
                <span>
                  {state.name === "refreshing"
                    ? "Applying changes…"
                    : "✓ Changes live"}
                </span>
                <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ color: "#969d96", fontWeight: 500 }}>
                    {proposal.files.length} file
                    {proposal.files.length === 1 ? "" : "s"}
                  </span>
                  <button
                    type="button"
                    style={styles.collapseButton}
                    aria-expanded={areChangesExpanded}
                    aria-controls={changesId}
                    onClick={() =>
                      setAreChangesExpanded((expanded) => !expanded)
                    }
                  >
                    {areChangesExpanded ? "Hide" : "Show"}
                  </button>
                </span>
              </div>
              <div id={changesId} hidden={!areChangesExpanded}>
                <div
                  style={{
                    padding: "0 10px 9px",
                    color: "#b9beb9",
                    fontSize: 10,
                  }}
                >
                  {proposal.summary}
                </div>
                {proposal.files.map((file) => (
                  <details key={file.path} style={styles.file}>
                    <summary
                      style={{
                        overflow: "hidden",
                        cursor: "pointer",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      <span style={{ opacity: 0.65, marginRight: 7 }}>
                        {file.status}
                      </span>
                      {file.path}
                      <span style={{ marginLeft: 7, color: "#a8e6c1" }}>
                        +{file.additions}
                      </span>
                      <span style={{ marginLeft: 4, color: "#e49d98" }}>
                        −{file.deletions}
                      </span>
                    </summary>
                    <pre style={styles.patch}>{file.patch}</pre>
                  </details>
                ))}
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: 6,
                  padding: "8px 9px 9px",
                }}
              >
                <button
                  type="button"
                  style={styles.mutedButton}
                  disabled={busy}
                  onClick={() => void decide("discard")}
                >
                  {state.name === "deciding" && state.action === "discard"
                    ? "Discarding…"
                    : "Undo turn"}
                </button>
                <button
                  type="button"
                  style={styles.button}
                  disabled={busy}
                  onClick={() => void decide("keep")}
                >
                  {state.name === "deciding" && state.action === "keep"
                    ? "Keeping…"
                    : "Keep changes"}
                </button>
              </div>
            </section>
          ) : null}

          {state.name === "error" || state.name === "success" ? (
            <div
              role="status"
              style={{
                margin: "0 0 12px 36px",
                color: state.name === "error" ? "#e49d98" : "#a8e6c1",
                fontSize: 10,
              }}
            >
              {state.message}
            </div>
          ) : null}
        </div>

        <div style={styles.tools}>
          <button
            type="button"
            style={{
              ...styles.mutedButton,
              ...(mode === "select" ? styles.activeButton : {}),
            }}
            onClick={() => setMode(mode === "select" ? "idle" : "select")}
          >
            {selected ? "Reselect" : "Select"}
          </button>
          <button
            type="button"
            style={{
              ...styles.mutedButton,
              ...(mode === "draw" ? styles.activeButton : {}),
            }}
            onClick={() => setMode(mode === "draw" ? "idle" : "draw")}
          >
            Draw
          </button>
          <button
            type="button"
            style={styles.mutedButton}
            disabled={!selected || !drawingReady}
            onClick={playDrawing}
          >
            Play
          </button>
          <button
            type="button"
            style={styles.mutedButton}
            disabled={!selected || !drawingReady}
            onClick={() => void refineMotion()}
          >
            Refine
          </button>
          <button
            type="button"
            style={styles.mutedButton}
            disabled={!selected && stroke.points.length === 0}
            onClick={clearContext}
          >
            Clear
          </button>
          <div title={contextLabel} style={styles.context}>
            {motionMessage || contextLabel}
          </div>
        </div>

        <div style={styles.composerWrap}>
          <form style={styles.composer} onSubmit={sendPrompt}>
            <textarea
              aria-label="Change prompt"
              value={prompt}
              disabled={busy || readOnly}
              onChange={(event) => setPrompt(event.target.value)}
              onKeyDown={onKeyDown}
              placeholder={
                readOnly
                  ? "Previous sessions are read only"
                  : busy
                    ? "Applying changes…"
                    : session?.messages.length
                      ? "Continue this conversation…"
                      : placeholder
              }
              rows={1}
              style={styles.textarea}
            />
            <div style={styles.composerFooter}>
              {models.length > 1 ? (
                <select
                  aria-label="AI model"
                  disabled={busy}
                  value={selectedModelId}
                  onChange={(event) => selectModel(event.target.value)}
                  style={{ ...styles.select, opacity: busy ? 0.5 : 1 }}
                  title={
                    models.find((model) => model.id === selectedModelId)
                      ?.description
                  }
                >
                  {models.map((model) => (
                    <option
                      key={model.id}
                      value={model.id}
                      title={model.description}
                    >
                      {model.label}
                    </option>
                  ))}
                </select>
              ) : (
                <span
                  style={{ marginRight: "auto", color: "#656b66", fontSize: 9 }}
                >
                  Current page
                </span>
              )}
              <span style={styles.sendHint}>↵ Send · ⇧↵ New line</span>
              <button
                disabled={!prompt.trim() || busy || readOnly}
                type="submit"
                style={{
                  ...styles.button,
                  opacity: !prompt.trim() || busy || readOnly ? 0.5 : 1,
                }}
              >
                {state.name === "working" ? "Working…" : "Send"}
              </button>
            </div>
          </form>
        </div>
      </aside>
    </>
  );
}

function ChangeHighlights({ before }: { before?: PageSnapshot }) {
  const [elements, setElements] = useState<Element[]>([]);
  const [boxes, setBoxes] = useState<Array<Box & { key: number }>>([]);

  useEffect(() => {
    if (!before) {
      setElements([]);
      return;
    }
    const current = capturePageSnapshot(document.body);
    setElements(changedElements(before, current));
  }, [before]);

  useEffect(() => {
    if (elements.length === 0) {
      setBoxes([]);
      return;
    }
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        setBoxes(
          elements.flatMap((element, key) => {
            const box = boxFor(element);
            return box && box.width > 0 && box.height > 0
              ? [{ ...box, key }]
              : [];
          }),
        );
      });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    const observer =
      typeof ResizeObserver === "undefined"
        ? undefined
        : new ResizeObserver(update);
    elements.forEach((element) => {
      observer?.observe(element);
    });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
      observer?.disconnect();
    };
  }, [elements]);

  return boxes.map(({ key, ...box }) => (
    <Highlight key={key} box={box} color="#f59e0b" label="Changed" />
  ));
}

function Highlight({
  box,
  color,
  label,
}: {
  box: Box;
  color: string;
  label?: string;
}) {
  return (
    <div
      data-shan-editor
      aria-hidden="true"
      style={{
        position: "fixed",
        zIndex: 2147483644,
        top: box.top,
        left: box.left,
        width: box.width,
        height: box.height,
        border: `2px solid ${color}`,
        borderRadius: 4,
        background: `${color}18`,
        pointerEvents: "none",
        boxSizing: "border-box",
      }}
    >
      {label ? (
        <span
          style={{
            position: "absolute",
            top: box.top > 24 ? -23 : 3,
            left: -2,
            padding: "2px 6px",
            borderRadius: "5px 5px 5px 0",
            color: "#18181b",
            background: color,
            font: "700 10px/1.4 ui-sans-serif, system-ui, sans-serif",
            letterSpacing: ".06em",
            textTransform: "uppercase",
            whiteSpace: "nowrap",
          }}
        >
          {label}
        </span>
      ) : null}
    </div>
  );
}
