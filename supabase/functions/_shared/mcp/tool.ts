import type { Ctx } from "./query.ts";
import type { Json } from "./validate.ts";

export type ToolResult = { text: string };

export type Tool = {
  name: string;
  description: string;
  scope: "read" | "write";
  inputSchema: Record<string, unknown>;
  handle: (args: Json, ctx: Ctx) => Promise<ToolResult>;
};
