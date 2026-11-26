import type { Store } from "./db.ts";
import type { Ctx } from "./query.ts";
import { authenticate } from "./session.ts";
import { findTool, toolFields, tools } from "./tools.ts";
import { ToolError, humanDbError, type Json } from "./validate.ts";

export const PROTOCOLS = ["2025-11-25", "2025-06-18", "2025-03-26"];

const INSTRUCTIONS = [
  "LIFEMANAGER と英語学習の記録です。所有者は一人で、日付と時刻は Asia/Tokyo です。",
  "削除ツールは confirm が true のときだけ消します。",
  "会話の生成や発音採点の API は呼びません。保存済みの会話と発音だけ読めます。",
  "英語の回答、添削、フィードバックは、状態と本文と役割を一度に書きます。",
  "This server stores one student's schedule and English study notes. Dates use Asia/Tokyo.",
  "Delete tools remove a row only when confirm is true.",
  "Do not start a speaking session or score pronunciation. Read saved results only.",
].join("\n");

export type Outcome =
  | { kind: "empty"; status: number; headers?: Record<string, string> }
  | { kind: "json"; status: number; body: unknown; headers?: Record<string, string> };

export function wwwAuthenticate(resource: string, error?: string): string {
  const metadata = `${resource}/oauth/protected-resource`;
  const base = `Bearer realm="lifemanager", resource_metadata="${metadata}", scope="read write"`;
  return error ? `${base}, error="${error}"` : base;
}

function negotiate(version: unknown): string {
  return typeof version === "string" && PROTOCOLS.includes(version) ? version : "2025-06-18";
}

function rpcResult(id: unknown, result: unknown): Record<string, unknown> {
  return { jsonrpc: "2.0", id, result };
}

function rpcError(id: unknown, code: number, message: string): Record<string, unknown> {
  return { jsonrpc: "2.0", id: id ?? null, error: { code, message } };
}

function messageId(message: Record<string, unknown>): unknown {
  return "id" in message ? message.id : null;
}

export async function dispatchRpc(
  message: unknown,
  opts: { db: Store; authorization: string | null; resource: string; now: Date },
): Promise<Outcome> {
  if (Array.isArray(message) || !message || typeof message !== "object") {
    return { kind: "json", status: 400, body: rpcError(null, -32600, "Invalid Request") };
  }
  const body = message as Record<string, unknown>;
  if (body.jsonrpc !== "2.0" || typeof body.method !== "string") {
    return { kind: "json", status: 400, body: rpcError(messageId(body), -32600, "Invalid Request") };
  }
  const id = messageId(body);
  const isNotification = !("id" in body);
  const auth = await authenticate(opts.db, opts.authorization, opts.resource, opts.now);
  if (!auth.ok) {
    const headers: Record<string, string> = {};
    if (auth.status === 401) headers["WWW-Authenticate"] = wwwAuthenticate(opts.resource, auth.wwwError);
    if (auth.status === 429) headers["Retry-After"] = "60";
    if (isNotification) return { kind: "empty", status: auth.status, headers };
    return { kind: "json", status: auth.status, headers, body: rpcError(id, auth.status === 429 ? -32029 : -32001, auth.message) };
  }

  if (isNotification) {
    return { kind: "empty", status: 202 };
  }

  try {
    const result = await callMethod(body.method, body.params, {
      db: opts.db,
      ownerId: auth.session.ownerId,
      now: opts.now,
      scope: auth.session.scope,
    });
    return { kind: "json", status: 200, body: rpcResult(id, result) };
  } catch (err) {
    if (err instanceof ToolError) {
      return { kind: "json", status: 200, body: rpcResult(id, { content: [{ type: "text", text: err.message }], isError: true }) };
    }
    if (err instanceof RpcError) {
      return { kind: "json", status: 200, body: rpcError(id, err.code, err.message) };
    }
    return { kind: "json", status: 200, body: rpcResult(id, { content: [{ type: "text", text: humanDbError(err) }], isError: true }) };
  }
}

class RpcError extends Error {
  code: number;
  constructor(code: number, message: string) {
    super(message);
    this.code = code;
  }
}

async function callMethod(
  method: string,
  params: unknown,
  ctx: Ctx & { scope: "read" | "write" },
): Promise<unknown> {
  if (method === "initialize") {
    const input = asObject(params);
    return {
      protocolVersion: negotiate(input.protocolVersion),
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: "lifemanager", title: "LIFEMANAGER", version: "1.0.0" },
      instructions: INSTRUCTIONS,
    };
  }
  if (method === "ping") return {};
  if (method === "tools/list") {
    return {
      tools: tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
      })),
    };
  }
  if (method === "tools/call") {
    const input = asObject(params);
    const name = input.name;
    if (typeof name !== "string") throw new RpcError(-32602, "Tool name is required");
    const tool = findTool(name);
    if (!tool) throw new RpcError(-32602, `Unknown tool: ${name}`);
    if (tool.scope === "write" && ctx.scope !== "write") {
      throw new ToolError("このトークンは読むだけです。設定画面で読み書きトークンを作ってください / This token is read-only. Create a read-write token in Settings.");
    }
    const args = input.arguments == null ? {} : input.arguments;
    if (!args || typeof args !== "object" || Array.isArray(args)) throw new RpcError(-32602, "arguments must be an object");
    const record = args as Json;
    for (const key of Object.keys(record)) {
      if (!toolFields(tool).includes(key)) {
        throw new ToolError(`未知の項目 ${key} は使えません / Unknown field ${key}`);
      }
    }
    const result = await tool.handle(record, ctx);
    if (result.text.length > 120000) {
      return {
        content: [{ type: "text", text: "結果が大きすぎます。limit を小さくするか、1件ずつ get してください / Result is too large. Lower limit or get one row." }],
        isError: true,
      };
    }
    return { content: [{ type: "text", text: result.text }] };
  }
  throw new RpcError(-32601, `Method not found: ${method}`);
}

function asObject(params: unknown): Json {
  if (!params || typeof params !== "object" || Array.isArray(params)) return {};
  return params as Json;
}
