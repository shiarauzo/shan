import type { ShanPromptContext } from "../types";

function finite(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function drawingDirection(drawing: NonNullable<ShanPromptContext["drawing"]>) {
  if (drawing.length < 2) return undefined;

  const first = drawing[0];
  const last = drawing.at(-1);
  if (!first || !last) return undefined;

  const dx = last.x - first.x;
  const dy = last.y - first.y;
  const horizontal = Math.abs(dx);
  const vertical = Math.abs(dy);
  const meaningfulDisplacement = 0.04;

  if (
    horizontal < meaningfulDisplacement &&
    vertical < meaningfulDisplacement
  ) {
    return "a path with no strong net direction";
  }
  if (horizontal >= vertical * 1.5) {
    return `a predominantly ${dx > 0 ? "rightward" : "leftward"} path`;
  }
  if (vertical >= horizontal * 1.5) {
    return `a predominantly ${dy > 0 ? "downward" : "upward"} path`;
  }

  return `a diagonal path moving ${dy > 0 ? "down" : "up"} and ${dx > 0 ? "right" : "left"}`;
}

export function normalizePromptContext(
  input: unknown,
): ShanPromptContext | undefined {
  if (!input || typeof input !== "object") return undefined;
  const value = input as Record<string, unknown>;
  const context: ShanPromptContext = {};

  if (value.selectedElement && typeof value.selectedElement === "object") {
    const selected = value.selectedElement as Record<string, unknown>;
    if (
      typeof selected.selector === "string" &&
      typeof selected.tagName === "string"
    ) {
      const bounds =
        selected.bounds && typeof selected.bounds === "object"
          ? (selected.bounds as Record<string, unknown>)
          : {};
      context.selectedElement = {
        selector: selected.selector.slice(0, 500),
        tagName: selected.tagName.slice(0, 40),
        ...(typeof selected.id === "string"
          ? { id: selected.id.slice(0, 200) }
          : {}),
        classNames: Array.isArray(selected.classNames)
          ? selected.classNames
              .filter((item): item is string => typeof item === "string")
              .slice(0, 30)
              .map((item) => item.slice(0, 200))
          : [],
        text:
          typeof selected.text === "string"
            ? selected.text.slice(0, 1_000)
            : "",
        html:
          typeof selected.html === "string"
            ? selected.html.slice(0, 4_000)
            : "",
        bounds: {
          x: finite(bounds.x),
          y: finite(bounds.y),
          width: Math.max(0, finite(bounds.width)),
          height: Math.max(0, finite(bounds.height)),
        },
      };
    }
  }

  if (Array.isArray(value.drawing)) {
    context.drawing = value.drawing.slice(0, 80).flatMap((point) => {
      if (!point || typeof point !== "object") return [];
      const { x, y, t } = point as Record<string, unknown>;
      if (
        ![x, y, t].every(
          (item) => typeof item === "number" && Number.isFinite(item),
        )
      )
        return [];
      return [
        {
          x: Math.min(1, Math.max(0, Number(x))),
          y: Math.min(1, Math.max(0, Number(y))),
          t: Math.max(0, Number(t)),
        },
      ];
    });
  }

  return context.selectedElement || context.drawing?.length
    ? context
    : undefined;
}

export function promptWithContext(prompt: string, context?: ShanPromptContext) {
  if (!context) return prompt;
  const parts = [`Requested change:\n${prompt}`];
  if (context.selectedElement) {
    parts.push(
      `Selected element context from the browser (use this to locate the corresponding source; do not assume the HTML is the source file):\n${JSON.stringify(context.selectedElement, null, 2)}`,
    );
  }
  if (context.drawing?.length) {
    const direction = drawingDirection(context.drawing);
    const selectionGuidance = context.selectedElement
      ? "When the request is generic or deictic (for example, ‘animate this’), animate the selected element itself and use the Drawing Note's direction as the intended motion. Do not animate unrelated elements. An explicit written request overrides this inference."
      : "Use the Drawing Note's direction to infer the intended motion or spatial change.";
    parts.push(
      `Drawing note over the viewport. Points are chronological; coordinates are normalized from 0 to 1 and t is elapsed milliseconds.${direction ? ` Its net gesture is ${direction}.` : ""} ${selectionGuidance}\n${JSON.stringify(context.drawing)}`,
    );
  }
  return parts.join("\n\n");
}
