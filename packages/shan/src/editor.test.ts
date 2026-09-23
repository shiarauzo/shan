import { describe, expect, test } from "bun:test";
import { activityFilterButtonStyle } from "./editor";

describe("activityFilterButtonStyle", () => {
  test("does not mix border shorthand and longhand properties", () => {
    for (const filter of ["all", "files", "search"] as const) {
      const style = activityFilterButtonStyle(filter, filter);

      expect(style).not.toHaveProperty("borderColor");
    }
  });
});
