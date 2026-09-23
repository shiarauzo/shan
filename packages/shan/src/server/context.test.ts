import { describe, expect, test } from "bun:test";
import { normalizePromptContext, promptWithContext } from "./context";

describe("visual prompt context", () => {
  test("bounds and normalizes selected-element and drawing data", () => {
    const context = normalizePromptContext({
      selectedElement: {
        selector: "#hero",
        tagName: "section",
        classNames: ["hero", 4],
        text: "Welcome",
        html: '<section id="hero">Welcome</section>',
        bounds: { x: 10, y: 20, width: -5, height: 300 },
      },
      drawing: [
        { x: -2, y: 3, t: -10 },
        { x: "bad", y: 0, t: 1 },
      ],
    });

    expect(context?.selectedElement).toMatchObject({
      selector: "#hero",
      tagName: "section",
      classNames: ["hero"],
      bounds: { x: 10, y: 20, width: 0, height: 300 },
    });
    expect(context?.drawing).toEqual([{ x: 0, y: 1, t: 0 }]);
  });

  test("adds visual context to the coding request", () => {
    const context = normalizePromptContext({
      selectedElement: {
        selector: "main > h1",
        tagName: "h1",
        classNames: [],
        text: "Hello",
        html: "<h1>Hello</h1>",
        bounds: {},
      },
      drawing: [
        { x: 0.1, y: 0.2, t: 0 },
        { x: 0.8, y: 0.2, t: 300 },
      ],
    });
    const result = promptWithContext("Move it right", context);

    expect(result).toContain("Requested change:\nMove it right");
    expect(result).toContain("Selected element context");
    expect(result).toContain("main > h1");
    expect(result).toContain("Drawing note over the viewport");
  });

  test("interprets a rightward drawing as motion of the selected element", () => {
    const context = normalizePromptContext({
      selectedElement: {
        selector: "main a",
        tagName: "a",
        classNames: [],
        text: "See the card",
        html: '<a href="#account">See the card</a>',
        bounds: { x: 54, y: 390, width: 142, height: 50 },
      },
      drawing: [
        { x: 0.03, y: 0.4, t: 0 },
        { x: 0.42, y: 0.39, t: 180 },
        { x: 0.85, y: 0.41, t: 360 },
      ],
    });

    const result = promptWithContext("animate this", context);

    expect(result).toContain("predominantly rightward");
    expect(result).toContain("animate the selected element itself");
    expect(result).toContain("Do not animate unrelated elements");
  });
});
