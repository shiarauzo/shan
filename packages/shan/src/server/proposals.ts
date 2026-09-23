import { createHash } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTwoFilesPatch, diffLines } from "diff";
import { Effect, Schema } from "effect";
import type { Proposal, ProposedFile } from "../types";
import { applyChanges, type DraftChange } from "./workspace";

type StoredProposal = Proposal & {
  root: string;
  changes: DraftChange[];
};

export class ProposalError extends Schema.TaggedError<ProposalError>()(
  "ProposalError",
  {
    message: Schema.String,
    cause: Schema.optional(Schema.Defect()),
  },
) {}

function proposalError(cause: unknown) {
  if (cause instanceof ProposalError) return cause;
  return new ProposalError({
    message:
      cause instanceof Error
        ? cause.message
        : "Could not update the active preview.",
    cause,
  });
}

const STORE_KEY = Symbol.for("shan.proposal-store");
const ACTIVE_KEY = Symbol.for("shan.active-previews");
type GlobalProposalStore = typeof globalThis & {
  [STORE_KEY]?: Map<string, StoredProposal>;
  [ACTIVE_KEY]?: Map<string, string>;
};
const globalStore = globalThis as GlobalProposalStore;
if (!globalStore[STORE_KEY])
  globalStore[STORE_KEY] = new Map<string, StoredProposal>();
if (!globalStore[ACTIVE_KEY])
  globalStore[ACTIVE_KEY] = new Map<string, string>();
const proposals = globalStore[STORE_KEY];
const activePreviews = globalStore[ACTIVE_KEY];

function storagePath(root: string) {
  const projectId = createHash("sha256").update(root).digest("hex");
  return join(tmpdir(), "shan", `${projectId}.json`);
}

async function persist(proposal: StoredProposal) {
  const path = storagePath(proposal.root);
  await mkdir(join(tmpdir(), "shan"), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${proposal.id}.tmp`;
  await writeFile(temporary, JSON.stringify(proposal), {
    encoding: "utf8",
    mode: 0o600,
  });
  await rename(temporary, path);
  proposals.set(proposal.id, proposal);
  activePreviews.set(proposal.root, proposal.id);
}

async function readPersisted(
  root: string,
): Promise<StoredProposal | undefined> {
  const activeId = activePreviews.get(root);
  if (activeId) {
    const active = proposals.get(activeId);
    if (active) return active;
  }
  try {
    const parsed = JSON.parse(
      await readFile(storagePath(root), "utf8"),
    ) as StoredProposal;
    if (
      parsed.root !== root ||
      typeof parsed.id !== "string" ||
      !Array.isArray(parsed.changes)
    ) {
      throw new Error("The saved preview is invalid.");
    }
    proposals.set(parsed.id, parsed);
    activePreviews.set(root, parsed.id);
    return parsed;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

function describe(change: DraftChange): ProposedFile {
  let additions = 0;
  let deletions = 0;
  for (const part of diffLines(change.before ?? "", change.after ?? "")) {
    const lines = part.count ?? 0;
    if (part.added) additions += lines;
    if (part.removed) deletions += lines;
  }
  const status =
    change.before === null
      ? "created"
      : change.after === null
        ? "deleted"
        : "modified";
  return {
    path: change.path,
    status,
    additions,
    deletions,
    patch: createTwoFilesPatch(
      change.before === null ? "/dev/null" : change.path,
      change.after === null ? "/dev/null" : change.path,
      change.before ?? "",
      change.after ?? "",
      "before",
      "after",
      { context: 3 },
    ),
  };
}

function publicProposal(proposal: StoredProposal): Proposal {
  const { changes: _changes, root: _root, ...result } = proposal;
  return result;
}

async function findProposal(id: string, expectedRoot: string) {
  const proposal = await readPersisted(expectedRoot);
  if (!proposal || proposal.id !== id) {
    throw new Error(
      "Active preview not found. It may have already been kept or discarded.",
    );
  }
  return proposal;
}

async function finish(proposal: StoredProposal) {
  proposals.delete(proposal.id);
  activePreviews.delete(proposal.root);
  await rm(storagePath(proposal.root), { force: true });
}

export async function assertNoActivePreview(root: string) {
  if (await readPersisted(root)) {
    throw new Error(
      "Keep or discard the current changes before asking for another update.",
    );
  }
}

export async function applyForPreview(
  root: string,
  summary: string,
  changes: DraftChange[],
  sessionId?: string,
) {
  await assertNoActivePreview(root);
  if (changes.length === 0)
    throw new Error("The agent did not make any file changes.");
  const proposal: StoredProposal = {
    id: crypto.randomUUID(),
    root,
    sessionId,
    summary:
      summary.trim() ||
      "Try the updated app, then keep or discard these changes.",
    files: changes.map(describe),
    changes,
    createdAt: new Date().toISOString(),
  };

  // Reserve the project while applying so concurrent prompts cannot overlap.
  await persist(proposal);
  try {
    await applyChanges(root, changes);
  } catch (error) {
    await finish(proposal);
    throw error;
  }
  return publicProposal(proposal);
}

function mergeChanges(existing: DraftChange[], next: DraftChange[]) {
  const merged = new Map(existing.map((change) => [change.path, change]));
  for (const change of next) {
    const previous = merged.get(change.path);
    const combined = previous
      ? { path: change.path, before: previous.before, after: change.after }
      : change;
    if (combined.before === combined.after) merged.delete(change.path);
    else merged.set(change.path, combined);
  }
  return [...merged.values()];
}

/** Add a follow-up turn to the current preview without implicitly approving it. */
export async function extendActivePreview(
  root: string,
  summary: string,
  changes: DraftChange[],
  sessionId: string,
) {
  const active = await readPersisted(root);
  if (!active) return applyForPreview(root, summary, changes, sessionId);
  if (active.sessionId && active.sessionId !== sessionId) {
    throw new Error(
      "Another session has live changes. Keep or discard them before continuing here.",
    );
  }
  if (changes.length === 0)
    throw new Error("The agent did not make any file changes.");

  const combined = mergeChanges(active.changes, changes);
  if (combined.length === 0)
    throw new Error(
      "The follow-up returned the preview to its original state.",
    );
  const updated: StoredProposal = {
    ...active,
    sessionId,
    summary:
      summary.trim() ||
      "Try the updated app, then keep or discard these changes.",
    files: combined.map(describe),
    changes: combined,
    createdAt: new Date().toISOString(),
  };

  await persist(updated);
  try {
    await applyChanges(root, changes);
  } catch (error) {
    await persist(active);
    throw error;
  }
  return publicProposal(updated);
}

export async function getActiveProposal(root: string) {
  const proposal = await readPersisted(root);
  return proposal ? publicProposal(proposal) : undefined;
}

export const keepProposalEffect = Effect.fn("keepProposalEffect")(
  (id: string, expectedRoot: string) =>
    Effect.tryPromise({
      try: async () => {
        const proposal = await findProposal(id, expectedRoot);
        await finish(proposal);
        return proposal.changes.map((change) => change.path);
      },
      catch: proposalError,
    }),
);

export function keepProposal(id: string, expectedRoot: string) {
  return Effect.runPromise(keepProposalEffect(id, expectedRoot));
}

export async function discardProposal(id: string, expectedRoot: string) {
  const proposal = await findProposal(id, expectedRoot);
  const rollback = [...proposal.changes].reverse().map((change) => ({
    path: change.path,
    before: change.after,
    after: change.before,
  }));
  const files = await applyChanges(proposal.root, rollback);
  await finish(proposal);
  return files;
}
