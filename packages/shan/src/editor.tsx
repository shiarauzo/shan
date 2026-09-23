"use client";

import {
  type CSSProperties,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
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
  ShanApiResponse,
  ShanPromptContext,
} from "./types";

export type ShanEditorProps = {
  endpoint?: string;
  className?: string;
  placeholder?: string;
  /** Time for the Next.js compiler to settle before reloading the preview. */
  previewReloadDelayMs?: number;
};

type EditorMode = "idle" | "select" | "draw";
type EditorState =
  | { name: "idle" }
  | { name: "working" }
  | { name: "refreshing"; proposal: Proposal }
  | { name: "previewing"; proposal: Proposal }
  | { name: "deciding"; proposal: Proposal; action: "keep" | "discard" }
  | { name: "success"; message: string }
  | { name: "error"; message: string; proposal?: Proposal };

type Box = { top: number; left: number; width: number; height: number };

const BLUE = "#0d99ff";
const ICON = "#f5f5f5";

const styles: Record<string, CSSProperties> = {
  logoButton: {
    pointerEvents: "auto",
    position: "fixed",
    zIndex: 2147483647,
    right: 20,
    bottom: 20,
    display: "grid",
    placeItems: "center",
    width: 40,
    height: 40,
    padding: 0,
    border: "1px solid rgba(255,255,255,.32)",
    borderRadius: "50%",
    background: "#0a0a0a",
    color: "#fff",
    boxShadow: "0 8px 24px rgba(0,0,0,.35)",
    cursor: "pointer",
  },
  shell: {
    pointerEvents: "auto",
    position: "fixed",
    zIndex: 2147483646,
    left: "50%",
    bottom: 20,
    transform: "translateX(-50%)",
    display: "flex",
    alignItems: "center",
    gap: 4,
    height: 48,
    maxWidth: "calc(100vw - 28px)",
    padding: "6px 8px",
    border: "1px solid rgba(255,255,255,.1)",
    borderRadius: 14,
    background: "#2c2c2c",
    boxShadow: "0 18px 48px rgba(0,0,0,.4)",
    color: ICON,
    font: "500 12px/1.2 ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
  },
  group: {
    display: "flex",
    alignItems: "center",
    gap: 2,
  },
  rightGroup: {
    display: "flex",
    alignItems: "center",
    gap: 2,
    marginLeft: 4,
    padding: "2px 4px",
    borderRadius: 10,
    background: "rgba(0,0,0,.28)",
  },
  divider: {
    width: 1,
    height: 22,
    margin: "0 6px",
    background: "rgba(255,255,255,.14)",
    flex: "none",
  },
  tool: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 1,
    height: 32,
    minWidth: 32,
    padding: "0 6px",
    border: 0,
    borderRadius: 8,
    background: "transparent",
    color: ICON,
    cursor: "pointer",
  },
  toolActive: {
    background: BLUE,
    color: "#fff",
  },
  toolDisabled: {
    opacity: 0.35,
    cursor: "default",
  },
  promptSlot: {
    display: "flex",
    alignItems: "center",
    gap: 4,
    width: 220,
    minWidth: 140,
    maxWidth: "28vw",
    height: 32,
    marginLeft: 4,
  },
  input: {
    flex: 1,
    minWidth: 0,
    height: 32,
    border: 0,
    outline: 0,
    borderRadius: 8,
    padding: "0 10px",
    color: "#f5f5f5",
    background: "rgba(0,0,0,.35)",
    font: "500 12px/1 ui-sans-serif, system-ui, sans-serif",
  },
  apply: {
    flex: "none",
    height: 32,
    padding: "0 10px",
    border: 0,
    borderRadius: 8,
    background: "#f4f4f5",
    color: "#111",
    font: "600 11px/1 ui-sans-serif, system-ui, sans-serif",
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  note: {
    maxWidth: 180,
    margin: "0 4px",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    color: "rgba(255,255,255,.55)",
    fontSize: 11,
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
    throw new Error(result.status === "error"
      ? result.error ?? result.message ?? "Shan request failed."
      : `Request failed (${response.status})`);
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
      const siblings = Array.from(parent.children).filter((child) => child.tagName === current?.tagName);
      if (siblings.length > 1) part += `:nth-of-type(${siblings.indexOf(current) + 1})`;
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
    classNames: (element.getAttribute("class") ?? "").split(/\s+/).filter(Boolean).slice(0, 30),
    text: (element.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 1_000),
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
  return { top: rect.top, left: rect.left, width: rect.width, height: rect.height };
}

export function ShanEditor({
  endpoint = "/api/shan",
  className,
  placeholder = "Describe a change…",
  previewReloadDelayMs = 500,
}: ShanEditorProps) {
  const [mounted, setMounted] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [promptOpen, setPromptOpen] = useState(false);
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<EditorState>({ name: "idle" });
  const [mode, setMode] = useState<EditorMode>("idle");
  const [selected, setSelected] = useState<SelectedElementContext | null>(null);
  const [selectedBox, setSelectedBox] = useState<Box | null>(null);
  const [hoverBox, setHoverBox] = useState<Box | null>(null);
  const selectedNode = useRef<Element | null>(null);
  const promptRef = useRef<HTMLInputElement | null>(null);
  const stroke = useStrokeCapture({ enabled: mode === "draw" });
  const busy = state.name === "working" || state.name === "refreshing" || state.name === "deciding";
  const proposal = state.name === "refreshing" || state.name === "previewing" || state.name === "deciding"
    ? state.proposal
    : state.name === "error"
      ? state.proposal
      : undefined;

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (promptOpen) promptRef.current?.focus();
  }, [promptOpen]);

  const updateSelectedBox = useCallback(() => setSelectedBox(boxFor(selectedNode.current)), []);

  useEffect(() => {
    if (!mounted) return;
    let cancelled = false;
    void post(endpoint, { action: "status" })
      .then((result) => {
        if (!cancelled && result.status === "previewing") {
          setState({ name: "previewing", proposal: result.proposal });
          setOpen(true);
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [endpoint, mounted]);

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
    const onMove = (event: PointerEvent) => setHoverBox(boxFor(candidate(event.target)));
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
      if (event.key !== "Escape") return;
      if (promptOpen) {
        setPromptOpen(false);
        return;
      }
      if (mode !== "idle") {
        setMode("idle");
        return;
      }
      if (!busy) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode, busy, promptOpen]);

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
    if (!value || busy || proposal) return;
    setState({ name: "working" });
    try {
      const result = await post(endpoint, { action: "prompt", prompt: value, context: promptContext() });
      if (result.status !== "previewing") throw new Error("The agent returned an unexpected response.");
      setPromptOpen(false);
      setState({ name: "refreshing", proposal: result.proposal });
      window.setTimeout(() => window.location.reload(), Math.max(0, previewReloadDelayMs));
    } catch (error) {
      setState({ name: "error", message: error instanceof Error ? error.message : "Agent request failed." });
    }
  }

  async function decide(action: "keep" | "discard") {
    if (!proposal || busy) return;
    setState({ name: "deciding", proposal, action });
    try {
      const result = await post(endpoint, { action, proposalId: proposal.id });
      if (action === "keep" && result.status !== "kept") throw new Error("The agent returned an unexpected response.");
      if (action === "discard" && result.status !== "discarded") throw new Error("The agent returned an unexpected response.");
      const fileCount = result.status === "kept" || result.status === "discarded" ? result.files.length : 0;
      setPrompt("");
      setState({
        name: "success",
        message: action === "keep"
          ? `Kept ${fileCount} file${fileCount === 1 ? "" : "s"}`
          : `Discarded ${fileCount} file${fileCount === 1 ? "" : "s"}`,
      });
    } catch (error) {
      setState({ name: "error", message: error instanceof Error ? error.message : `Could not ${action} changes.`, proposal });
    }
  }

  function playDrawing() {
    const points = stroke.getPoints();
    if (!selectedNode.current || !strokeIsUsable(points)) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    playMotion(selectedNode.current, cleanupPlan(cleanStroke(points), reduced));
  }

  async function refineMotion() {
    const points = stroke.getPoints();
    if (!selectedNode.current || !strokeIsUsable(points)) return;
    try {
      const result = await post(endpoint, { action: "motion", points: sampleForModel(points) });
      if (result.status === "waiting") {
        playDrawing();
        return;
      }
      if (result.status !== "reading") return;
      const spec = parseMotionSpec(result.spec);
      if (!spec) return;
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      playMotion(selectedNode.current, readingPlan(spec, points, reduced));
    } catch {
      // Quiet on failure.
    }
  }

  function clearContext() {
    stopMotion(selectedNode.current);
    selectedNode.current = null;
    setSelected(null);
    setSelectedBox(null);
    stroke.clear();
    setMode("idle");
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      void sendPrompt();
    }
  }

  function toggleOpen() {
    setOpen((value) => {
      if (value) {
        setMode("idle");
        setPromptOpen(false);
      }
      return !value;
    });
  }

  function setTool(next: EditorMode) {
    setMode((current) => (current === next ? "idle" : next));
    if (next !== "idle") setPromptOpen(false);
  }

  if (!mounted) return null;

  const drawingReady = strokeIsUsable(stroke.points);
  const hasContext = !!selected || stroke.points.length > 0;
  const status =
    state.name === "error" || state.name === "success"
      ? state.message
      : null;

  return (
    <>
      {mode === "draw" ? (
        <div
          {...stroke.bindings}
          aria-label="Draw a note over the page"
          style={{ position: "fixed", inset: 0, zIndex: 2147483645, cursor: "crosshair", touchAction: "none" }}
        />
      ) : null}
      {stroke.points.length > 1 ? (
        <svg viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden="true" style={{ position: "fixed", inset: 0, zIndex: 2147483646, width: "100%", height: "100%", pointerEvents: "none" }}>
          <polyline points={strokePolyline(stroke.points)} fill="none" stroke={BLUE} strokeWidth="2.5" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : null}
      {hoverBox ? <Highlight box={hoverBox} color={BLUE} /> : null}
      {selectedBox ? <Highlight box={selectedBox} color={BLUE} /> : null}

      <button
        type="button"
        data-shan-editor
        className={className}
        aria-label={open ? "Close editor" : "Open editor"}
        aria-expanded={open}
        aria-controls="shan-toolbar"
        style={styles.logoButton}
        onClick={toggleOpen}
      >
        <LogoMark />
      </button>
      {open ? (
        <aside data-shan-editor id="shan-toolbar" style={styles.shell} aria-label="Shan editor">
          <div style={styles.group}>
            <ToolButton
              label="Select element"
              active={mode === "select"}
              onClick={() => setTool("select")}
            >
              <IconPointer />
            </ToolButton>
          </div>

          <div style={styles.divider} aria-hidden="true" />

          <div style={styles.rightGroup}>
            <ToolButton
              label="Draw note"
              active={mode === "draw"}
              onClick={() => setTool("draw")}
            >
              <IconSquiggle />
            </ToolButton>
            <ToolButton
              label="Play drawing"
              disabled={!selected || !drawingReady}
              onClick={playDrawing}
            >
              <IconMeasure />
            </ToolButton>
            <ToolButton
              label="Refine motion"
              accent
              disabled={!selected || !drawingReady}
              onClick={() => void refineMotion()}
            >
              <IconDiamond />
            </ToolButton>
            <ToolButton
              label="Prompt"
              active={promptOpen && !proposal}
              onClick={() => {
                if (proposal) return;
                setMode("idle");
                setPromptOpen((value) => !value);
              }}
            >
              <IconCode />
            </ToolButton>
          </div>

          {proposal ? (
            <>
              <p
                style={{
                  ...styles.note,
                  color: state.name === "error" ? "#fca5a5" : "rgba(255,255,255,.55)",
                }}
                title={state.name === "error" ? state.message : proposal.summary}
              >
                {state.name === "error" ? state.message : proposal.summary}
              </p>
              <ToolButton label="Discard" disabled={busy} onClick={() => void decide("discard")}>
                <IconDiscard />
              </ToolButton>
              <ToolButton label="Keep" disabled={busy} onClick={() => void decide("keep")}>
                <IconKeep />
              </ToolButton>
            </>
          ) : promptOpen ? (
            <form style={styles.promptSlot} onSubmit={sendPrompt}>
              <input
                ref={promptRef}
                aria-label="Prompt"
                value={prompt}
                disabled={busy}
                onChange={(event) => setPrompt(event.target.value)}
                onKeyDown={onKeyDown}
                placeholder={state.name === "working" || state.name === "refreshing" ? "Applying…" : placeholder}
                style={styles.input}
              />
              <button
                type="submit"
                disabled={!prompt.trim() || busy}
                style={{ ...styles.apply, opacity: !prompt.trim() || busy ? 0.5 : 1 }}
              >
                {state.name === "working" ? "…" : "Apply"}
              </button>
            </form>
          ) : null}

          {status ? (
            <p role="status" style={{ ...styles.note, color: state.name === "error" ? "#fca5a5" : "#86efac" }}>
              {status}
            </p>
          ) : null}

          {hasContext ? (
            <ToolButton label="Clear context" onClick={clearContext}>
              <IconClear />
            </ToolButton>
          ) : null}
        </aside>
      ) : null}
    </>
  );
}

function ToolButton({
  label,
  children,
  active = false,
  accent = false,
  disabled = false,
  onClick,
}: {
  label: string;
  children: ReactNode;
  active?: boolean;
  accent?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active || undefined}
      disabled={disabled}
      onClick={onClick}
      style={{
        ...styles.tool,
        ...(active ? styles.toolActive : {}),
        ...(accent && !active ? { color: BLUE } : {}),
        ...(disabled ? styles.toolDisabled : {}),
      }}
    >
      {children}
    </button>
  );
}

function svgProps(size = 16) {
  return {
    width: size,
    height: size,
    viewBox: "0 0 16 16",
    fill: "none",
    "aria-hidden": true as const,
  };
}

function IconPointer() {
  return (
    <svg {...svgProps()}>
      <path d="M3.2 2.4 12.5 7.1l-4.1 1.2-1.2 4.1Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  );
}

function IconSquiggle() {
  return (
    <svg {...svgProps()}>
      <path
        d="M2.8 10.2c1.4-3.2 2.6-4.8 3.6-4.8 1.2 0 1.5 2.6 2.6 2.6 1.2 0 1.8-3.8 4.2-4.6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconMeasure() {
  return (
    <svg {...svgProps()}>
      <path d="M3.2 12.4V5.2h2.2M3.2 12.4H10.4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="m9.2 3.4 3.4 3.4-1.5.4-.4 1.5Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
    </svg>
  );
}

function IconDiamond() {
  return (
    <svg {...svgProps()}>
      <path d="m8 2.4 5.2 5.2L8 12.8 2.8 7.6Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M6.2 7.6h3.6M8.4 6.2 9.8 7.6 8.4 9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconCode() {
  return (
    <svg {...svgProps()}>
      <path d="M5.2 4.4 2.6 8l2.6 3.6M10.8 4.4 13.4 8l-2.6 3.6M9.1 3.8 6.9 12.2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconDiscard() {
  return (
    <svg {...svgProps()}>
      <path d="m4.2 4.2 7.6 7.6M11.8 4.2 4.2 11.8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function IconKeep() {
  return (
    <svg {...svgProps()}>
      <path d="m3.4 8.1 2.8 2.8 6.4-6.4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconClear() {
  return (
    <svg {...svgProps()}>
      <path d="M5.2 3.4h5.6M6.2 3.4V2.6h3.6v.8M4.6 5.2h6.8l-.6 7.2H5.2Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
    </svg>
  );
}

function LogoMark() {
  return (
    <span
      aria-hidden="true"
      style={{ font: "600 17px/1 ui-sans-serif, system-ui, sans-serif", letterSpacing: "-0.04em" }}
    >
      S
    </span>
  );
}

function Highlight({ box, color }: { box: Box; color: string }) {
  return (
    <div
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
    />
  );
}
