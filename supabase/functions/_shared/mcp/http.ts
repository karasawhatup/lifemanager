import { createRestStore, resourceUrl, type Env, type Store } from "./db.ts";
import {
  authorizationMetadata,
  handleAuthorize,
  handleRegister,
  handleRevoke,
  handleToken,
  protectedResource,
  verifySupabasePassword,
} from "./oauth.ts";
import { dispatchRpc } from "./protocol.ts";

export type ServerDeps = {
  env: Env;
  db?: Store;
  now?: () => Date;
  verifyPassword?: (email: string, password: string) => Promise<{ userId: string } | null>;
  fetchImpl?: typeof fetch;
};

const MAX_BODY = 262144;

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, accept, mcp-protocol-version, mcp-session-id, last-event-id",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Expose-Headers": "WWW-Authenticate, Retry-After",
  "Access-Control-Max-Age": "600",
};

function withCors(res: Response): Response {
  const headers = new Headers(res.headers);
  for (const [key, value] of Object.entries(CORS)) headers.set(key, value);
  return new Response(res.body, { status: res.status, headers });
}

function json(body: unknown, status: number, extra?: Record<string, string>): Response {
  const headers = new Headers({ "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  for (const [key, value] of Object.entries(extra ?? {})) headers.set(key, value);
  return withCors(new Response(JSON.stringify(body), { status, headers }));
}

export function routeSuffix(pathname: string): string {
  const marker = "/mcp";
  const at = pathname.indexOf(marker);
  let rest = pathname;
  if (at >= 0) {
    const after = pathname.slice(at + marker.length);
    if (after === "" || after.startsWith("/")) rest = after;
  }
  if (rest === "" || rest === "/") return "/";
  return rest.replace(/\/$/, "") || "/";
}

export async function handleRequest(req: Request, deps: ServerDeps): Promise<Response> {
  if (req.method === "OPTIONS") return withCors(new Response(null, { status: 204 }));
  const resource = resourceUrl(deps.env);
  const path = routeSuffix(new URL(req.url).pathname);
  const db = deps.db ?? createRestStore(deps.env, deps.fetchImpl);
  const now = deps.now?.() ?? new Date();
  const oauth = {
    db,
    resource,
    now,
    fetchImpl: deps.fetchImpl,
    verifyPassword:
      deps.verifyPassword ?? ((email: string, password: string) => verifySupabasePassword(deps.env, email, password, deps.fetchImpl)),
  };

  if (path === "/.well-known/oauth-protected-resource" || path === "/oauth/protected-resource") {
    return json(protectedResource(resource), 200);
  }
  if (path === "/.well-known/oauth-authorization-server" || path === "/.well-known/openid-configuration") {
    return json(authorizationMetadata(resource), 200);
  }

  const length = Number(req.headers.get("content-length") ?? "0");
  if (Number.isFinite(length) && length > MAX_BODY) return json({ error: "payload_too_large" }, 413);

  if (path === "/oauth/register" && req.method === "POST") return withCors(await handleRegister(req, oauth));
  if (path === "/oauth/authorize" && (req.method === "GET" || req.method === "POST")) return withCors(await handleAuthorize(req, oauth));
  if (path === "/oauth/token" && req.method === "POST") return withCors(await handleToken(req, oauth));
  if (path === "/oauth/revoke" && req.method === "POST") return withCors(await handleRevoke(req, oauth));
  if (path !== "/") return json({ error: "not_found" }, 404);

  if (req.method === "GET") {
    if ((req.headers.get("accept") ?? "").includes("text/event-stream")) {
      return withCors(new Response(null, { status: 405, headers: { Allow: "POST, DELETE, OPTIONS" } }));
    }
    return withCors(
      new Response(helpPage(resource), {
        status: 200,
        headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
      }),
    );
  }
  if (req.method === "DELETE") return withCors(new Response(null, { status: 204 }));
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const text = await req.text();
  if (text.length > MAX_BODY) return json({ error: "payload_too_large" }, 413);
  let message: unknown;
  try {
    message = JSON.parse(text);
  } catch {
    return json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, 400);
  }
  const outcome = await dispatchRpc(message, {
    db,
    authorization: req.headers.get("authorization"),
    resource,
    now,
  });
  if (outcome.kind === "empty") {
    return withCors(new Response(null, { status: outcome.status, headers: outcome.headers }));
  }
  return json(outcome.body, outcome.status, outcome.headers);
}

function helpPage(resource: string): string {
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>LIFEMANAGER MCP</title>
<style>body{margin:0;background:#07080a;color:#f4f5f7;font:16px/1.5 sans-serif}main{max-width:460px;margin:0 auto;padding:28px 16px}code{word-break:break-all}</style></head>
<body><main><h1>LIFEMANAGER MCP</h1>
<p>これは予定と英語学習を読み書きする MCP サーバーです。トークンは LIFEMANAGER の設定画面で作ります。Supabase の service_role キーは使いません。</p>
<p>接続先<br><code>${resource}</code></p>
<p>手順はリポジトリの docs/mcp.md です。</p></main></body></html>`;
}
