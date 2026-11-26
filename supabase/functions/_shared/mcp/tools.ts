import { englishTools } from "./english.ts";
import { lifeTools } from "./life.ts";
import type { Tool } from "./tool.ts";

export type { Tool, ToolResult } from "./tool.ts";

export const tools: Tool[] = [...lifeTools, ...englishTools];

const byName = new Map(tools.map((tool) => [tool.name, tool]));

export function findTool(name: string): Tool | undefined {
  return byName.get(name);
}

export function toolFields(tool: Tool): string[] {
  const properties = tool.inputSchema.properties;
  if (!properties || typeof properties !== "object") return [];
  return Object.keys(properties as Record<string, unknown>);
}
