import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  beginTurn,
  completeTurn,
  getSession,
  listSessions,
  recordActivity,
  setProposalStatus,
  startNewSession,
} from "./sessions";

const roots: string[] = [];

async function project() {
  const root = await mkdtemp(join(tmpdir(), "shan-session-test-"));
  roots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("conversation sessions", () => {
  test("records turns, tool activity, and proposal decisions", async () => {
    const root = await project();
    const initial = await getSession(root);
    expect(initial.messages).toEqual([]);

    const turn = await beginTurn(root, "Make the card larger");
    expect(turn.session.title).toBe("Make the card larger");
    expect(turn.history).toEqual([]);

    await recordActivity(root, turn.turnId, {
      id: "activity-1",
      kind: "read",
      label: "Read",
      detail: "app/page.tsx",
      status: "complete",
      meta: "42 lines",
    });
    await completeTurn(
      root,
      turn.turnId,
      "Made the card larger.",
      "proposal-1",
    );

    let session = await getSession(root);
    expect(session.status).toBe("idle");
    expect(session.messages.map((message) => message.role)).toEqual([
      "user",
      "assistant",
    ]);
    expect(session.activities[0]).toMatchObject({
      detail: "app/page.tsx",
      turnId: turn.turnId,
    });
    expect(session.messages[1]).toMatchObject({
      proposalId: "proposal-1",
      proposalStatus: "previewing",
    });

    await setProposalStatus(root, "proposal-1", "kept");
    session = await getSession(root);
    expect(session.messages[1].proposalStatus).toBe("kept");
  });

  test("preserves the visual context that accompanied a user message", async () => {
    const root = await project();
    const drawing = {
      points: [
        { x: 0.1, y: 0.2, t: 0 },
        { x: 0.8, y: 0.2, t: 240 },
      ],
      viewport: { width: 1440, height: 900 },
    };

    const turn = await beginTurn(root, "Move it right", "default", drawing);
    const session = await getSession(root);

    expect(turn.session.messages[0]?.drawing).toEqual(drawing);
    expect(session.messages[0]?.drawing).toEqual(drawing);
  });

  test("passes prior messages into a follow-up and starts fresh on demand", async () => {
    const root = await project();
    const first = await beginTurn(root, "Add a card");
    await completeTurn(root, first.turnId, "Added the card.", "proposal-1");

    const second = await beginTurn(root, "Make it quieter");
    expect(second.history.map((message) => message.text)).toEqual([
      "Add a card",
      "Added the card.",
    ]);

    const fresh = await startNewSession(root);
    expect(fresh.id).not.toBe(second.session.id);
    expect(fresh.messages).toEqual([]);
    expect(fresh.activities).toEqual([]);
  });

  test("updates a running activity instead of duplicating it", async () => {
    const root = await project();
    const turn = await beginTurn(root, "Inspect the page");
    await recordActivity(root, turn.turnId, {
      id: "same-id",
      kind: "search",
      label: "Searching",
      detail: "**/*.tsx",
      status: "running",
    });
    await recordActivity(root, turn.turnId, {
      id: "same-id",
      kind: "search",
      label: "Searched",
      detail: "**/*.tsx",
      status: "complete",
      meta: "6 matches",
    });

    const session = await getSession(root);
    expect(session.activities).toHaveLength(1);
    expect(session.activities[0]).toMatchObject({
      label: "Searched",
      status: "complete",
      meta: "6 matches",
    });
  });

  test("does not lose parallel tool activity", async () => {
    const root = await project();
    const turn = await beginTurn(root, "Inspect both files");

    await Promise.all([
      recordActivity(root, turn.turnId, {
        id: "one",
        kind: "read",
        label: "Read",
        detail: "one.ts",
        status: "complete",
      }),
      recordActivity(root, turn.turnId, {
        id: "two",
        kind: "read",
        label: "Read",
        detail: "two.ts",
        status: "complete",
      }),
    ]);

    expect(
      (await getSession(root)).activities.map((activity) => activity.id).sort(),
    ).toEqual(["one", "two"]);
  });

  test("keeps browser conversations isolated", async () => {
    const root = await project();
    await beginTurn(root, "First browser", "session-one");
    const other = await getSession(root, "session-two");

    expect(other.id).toBe("session-two");
    expect(other.messages).toEqual([]);
    expect((await getSession(root, "session-one")).messages[0].text).toBe(
      "First browser",
    );
  });

  test("lists previous sessions newest first for read-only navigation", async () => {
    const root = await project();
    const first = await beginTurn(root, "First conversation", "session-one");
    await completeTurn(
      root,
      first.turnId,
      "First answer",
      "proposal-one",
      "session-one",
    );
    await startNewSession(root);

    const summaries = await listSessions(root);
    expect(summaries).toHaveLength(2);
    expect(summaries[0].id).not.toBe("session-one");
    expect(summaries[1]).toMatchObject({
      id: "session-one",
      title: "First conversation",
      messageCount: 2,
    });
  });
});
