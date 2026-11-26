import { createRestStore, resourceUrl, type Store } from "./db.ts";
import { dispatchRpc } from "./protocol.ts";

export type StdioIo = {
  lines: AsyncIterable<string>;
  write: (chunk: string) => void;
  error: (chunk: string) => void;
  env: { supabaseUrl?: string; serviceRoleKey?: string; accessToken?: string };
};

export async function runStdio(io: StdioIo, deps?: { db?: Store; now?: () => Date }): Promise<void> {
  const supabaseUrl = io.env.supabaseUrl ?? "";
  const serviceRoleKey = io.env.serviceRoleKey ?? "";
  const accessToken = io.env.accessToken ?? "";
  if (!supabaseUrl || !serviceRoleKey || !accessToken) {
    io.error("SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY と LIFEMANAGER_MCP_TOKEN が必要です。値は表示しません。\n");
    return;
  }
  const db = deps?.db ?? createRestStore({ supabaseUrl, serviceRoleKey, anonKey: "" });
  const resource = resourceUrl({ supabaseUrl, serviceRoleKey, anonKey: "" });
  io.error("LIFEMANAGER MCP (stdio) ready\n");
  for await (const line of io.lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let message: unknown;
    try {
      message = JSON.parse(trimmed);
    } catch {
      io.write(`${JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } })}\n`);
      continue;
    }
    const outcome = await dispatchRpc(message, {
      db,
      authorization: `Bearer ${accessToken}`,
      resource,
      now: deps?.now?.() ?? new Date(),
    });
    if (outcome.kind === "json") io.write(`${JSON.stringify(outcome.body)}\n`);
  }
}
