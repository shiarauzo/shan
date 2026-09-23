import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  activityFilterButtonStyle,
  ProposalDecisionButtons,
  proposalReviewMessageId,
} from "./editor";

describe("activityFilterButtonStyle", () => {
  test("does not mix border shorthand and longhand properties", () => {
    for (const filter of ["all", "files", "search"] as const) {
      const style = activityFilterButtonStyle(filter, filter);

      expect(style).not.toHaveProperty("borderColor");
    }
  });
});

describe("ProposalDecisionButtons", () => {
  test("renders only the keep and discard controls", () => {
    const markup = renderToStaticMarkup(
      createElement(ProposalDecisionButtons, {
        disabled: false,
        onDecide: () => {},
      }),
    );

    expect(markup).toContain("Discard changes");
    expect(markup).toContain("Keep changes");
    expect(markup).not.toContain("Changes live");
  });
});

describe("proposalReviewMessageId", () => {
  test("places review controls under only the latest matching message", () => {
    const message = (id: string, proposalId?: string) => ({
      id,
      turnId: `turn-${id}`,
      role: "assistant" as const,
      text: id,
      createdAt: "2026-09-23T00:00:00.000Z",
      proposalId,
      proposalStatus: "previewing" as const,
    });

    expect(
      proposalReviewMessageId(
        [message("first", "proposal-1"), message("latest", "proposal-1")],
        "proposal-1",
      ),
    ).toBe("latest");
  });
});
