import { jsonSchema, type ToolSet, tool } from "ai";
import type { ActivityUpdate } from "./sessions";
import type { WorkspaceDraft } from "./workspace";

const truncate = (value: string, limit = 80_000) =>
  value.length <= limit ? value : `${value.slice(0, limit)}\n… truncated`;

type ActivityReporter = (activity: ActivityUpdate) => void | Promise<void>;

async function tracked<T>(
  report: ActivityReporter | undefined,
  activity: Omit<ActivityUpdate, "id" | "status" | "meta">,
  execute: () => T | Promise<T>,
  meta?: (result: T) => string | undefined,
) {
  const id = crypto.randomUUID();
  await report?.({ ...activity, id, status: "running" });
  try {
    const result = await execute();
    await report?.({
      ...activity,
      id,
      status: "complete",
      meta: meta?.(result),
    });
    return result;
  } catch (error) {
    await report?.({ ...activity, id, status: "error", meta: "Failed" });
    throw error;
  }
}

export function createAgentTools(
  workspace: WorkspaceDraft,
  report?: ActivityReporter,
): ToolSet {
  return {
    read: tool({
      description:
        "Read a UTF-8 project file. The response includes line numbers.",
      inputSchema: jsonSchema<{
        path: string;
        offset?: number;
        limit?: number;
      }>({
        type: "object",
        properties: {
          path: { type: "string" },
          offset: { type: "integer", minimum: 1 },
          limit: { type: "integer", minimum: 1, maximum: 2000 },
        },
        required: ["path"],
        additionalProperties: false,
      }),
      execute: ({ path, offset = 1, limit = 500 }) =>
        tracked(
          report,
          {
            kind: "read",
            label: "Read",
            detail: path,
          },
          async () => {
            const content = await workspace.read(path);
            const lines = content.split("\n");
            return {
              path,
              totalLines: lines.length,
              content: truncate(
                lines
                  .slice(offset - 1, offset - 1 + limit)
                  .map((line, index) => `${offset + index}: ${line}`)
                  .join("\n"),
              ),
            };
          },
          (result) => `${result.totalLines} lines`,
        ),
    }),
    glob: tool({
      description: "List project files matching a glob such as **/*.tsx.",
      inputSchema: jsonSchema<{ pattern: string; limit?: number }>({
        type: "object",
        properties: {
          pattern: { type: "string", minLength: 1 },
          limit: { type: "integer", minimum: 1, maximum: 500 },
        },
        required: ["pattern"],
        additionalProperties: false,
      }),
      execute: ({ pattern, limit = 200 }) =>
        tracked(
          report,
          {
            kind: "search",
            label: "Searched files",
            detail: pattern,
          },
          async () => ({ matches: await workspace.glob(pattern, limit) }),
          (result) => `${result.matches.length} matches`,
        ),
    }),
    grep: tool({
      description: "Search text files for a JavaScript regular expression.",
      inputSchema: jsonSchema<{
        pattern: string;
        glob?: string;
        limit?: number;
      }>({
        type: "object",
        properties: {
          pattern: { type: "string", minLength: 1 },
          glob: { type: "string" },
          limit: { type: "integer", minimum: 1, maximum: 200 },
        },
        required: ["pattern"],
        additionalProperties: false,
      }),
      execute: ({ pattern, glob = "**/*", limit = 100 }) =>
        tracked(
          report,
          {
            kind: "search",
            label: "Searched code",
            detail: `${pattern} in ${glob}`,
          },
          async () => {
            const expression = new RegExp(pattern);
            const matches: Array<{ path: string; line: number; text: string }> =
              [];
            for (const path of await workspace.glob(glob, 500)) {
              let content: string;
              try {
                content = await workspace.read(path);
              } catch {
                continue;
              }
              for (const [index, line] of content.split("\n").entries()) {
                expression.lastIndex = 0;
                if (expression.test(line))
                  matches.push({
                    path,
                    line: index + 1,
                    text: line.slice(0, 500),
                  });
                if (matches.length >= limit)
                  return { matches, truncated: true };
              }
            }
            return { matches, truncated: false };
          },
          (result) => `${result.matches.length} matches`,
        ),
    }),
    write: tool({
      description:
        "Propose creating or replacing a UTF-8 project file. This only updates the draft; it does not touch disk.",
      inputSchema: jsonSchema<{ path: string; content: string }>({
        type: "object",
        properties: { path: { type: "string" }, content: { type: "string" } },
        required: ["path", "content"],
        additionalProperties: false,
      }),
      execute: ({ path, content }) =>
        tracked(
          report,
          {
            kind: "write",
            label: "Wrote",
            detail: path,
          },
          () => workspace.write(path, content),
          (result) => `${result.bytes} bytes`,
        ),
    }),
    edit: tool({
      description:
        "Propose replacing exact text in a project file. This only updates the draft; it does not touch disk.",
      inputSchema: jsonSchema<{
        path: string;
        oldText: string;
        newText: string;
        replaceAll?: boolean;
      }>({
        type: "object",
        properties: {
          path: { type: "string" },
          oldText: { type: "string", minLength: 1 },
          newText: { type: "string" },
          replaceAll: { type: "boolean" },
        },
        required: ["path", "oldText", "newText"],
        additionalProperties: false,
      }),
      execute: ({ path, oldText, newText, replaceAll }) =>
        tracked(
          report,
          {
            kind: "edit",
            label: "Modified",
            detail: path,
          },
          () => workspace.edit(path, oldText, newText, replaceAll),
          (result) =>
            `${result.replacements} replacement${result.replacements === 1 ? "" : "s"}`,
        ),
    }),
    remove: tool({
      description:
        "Propose deleting a project file. This only updates the draft; it does not touch disk.",
      inputSchema: jsonSchema<{ path: string }>({
        type: "object",
        properties: { path: { type: "string" } },
        required: ["path"],
        additionalProperties: false,
      }),
      execute: ({ path }) =>
        tracked(
          report,
          {
            kind: "remove",
            label: "Removed",
            detail: path,
          },
          () => workspace.remove(path),
        ),
    }),
  };
}
