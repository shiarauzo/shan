export const MOTION_NAMES = ["orbit", "hold", "slide", "sway", "rise", "pulse"] as const;
export const EASING_NAMES = ["linear", "ease-in", "ease-out", "ease-in-out"] as const;

export type MotionName = (typeof MOTION_NAMES)[number];
export type EasingName = (typeof EASING_NAMES)[number];

export type MotionSpec = {
  name: MotionName;
  easing: EasingName;
  durationMs: number;
  recognized: boolean | null;
  reading: string;
};

/**
 * Default model for motion intent reading via Nebius Token Factory.
 * Qwen3-30B-A3B-Instruct-2507 is a compact MoE (30.5B parameters, ~3B active)
 * well-suited for structured JSON classification tasks like motion naming.
 */
export const DEFAULT_MOTION_MODEL = "Qwen/Qwen3-30B-A3B-Instruct-2507";
export const DEFAULT_NEBIUS_MODEL = DEFAULT_MOTION_MODEL;
export const NEBIUS_BASE_URL = "https://api.tokenfactory.nebius.com/v1/";

const MOTION_LABELS: Record<MotionName, string> = {
  orbit: "Orbit",
  hold: "Hold",
  slide: "Slide",
  sway: "Sway",
  rise: "Rise",
  pulse: "Pulse",
};

export function motionLabel(name: MotionName) {
  return MOTION_LABELS[name];
}

export function playingLine(kind: "cleanup" | "reading", name?: MotionName) {
  if (kind === "cleanup") return "Playing the cleaned stroke";
  if (!name) return "Playing";
  const article = name === "orbit" ? "an" : "a";
  return `Playing ${article} ${motionLabel(name).toLowerCase()}`;
}

function isMotionName(value: unknown): value is MotionName {
  return typeof value === "string" && MOTION_NAMES.includes(value as MotionName);
}

function isEasingName(value: unknown): value is EasingName {
  return typeof value === "string" && EASING_NAMES.includes(value as EasingName);
}

function unwrapJson(input: unknown): unknown {
  if (typeof input !== "string") return input;
  const fenced = input.match(/```(?:json)?\s*([\s\S]*?)```/);
  const text = fenced?.[1] ?? input;
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

export function parseMotionSpec(input: unknown): MotionSpec | null {
  const value = unwrapJson(input);
  if (!value || typeof value !== "object") return null;

  const record = value as Record<string, unknown>;
  if (!isMotionName(record.name) || !isEasingName(record.easing)) return null;

  const durationMs = Number(record.durationMs);
  if (!Number.isFinite(durationMs)) return null;

  const recognized =
    record.recognized === true ? true : record.recognized === false ? false : null;
  const reading = typeof record.reading === "string" ? record.reading.trim().slice(0, 180) : "";

  return {
    name: record.name,
    easing: record.easing,
    durationMs: Math.min(6000, Math.max(400, Math.round(durationMs))),
    recognized,
    reading,
  };
}

export function messageText(content: unknown) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";

  return content
    .map((part) => {
      if (!part || typeof part !== "object" || !("text" in part)) return "";
      return String((part as { text: unknown }).text ?? "");
    })
    .join("");
}
