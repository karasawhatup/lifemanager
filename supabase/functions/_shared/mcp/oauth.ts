import { randomToken, sha256Hex, pkceS256 } from "./crypto.ts";
import { eq, isNull, type Env, type Store } from "./db.ts";
import { isUuid } from "./validate.ts";

export type OAuthDeps = {
  db: Store;
  resource: string;
  now: Date;
  verifyPassword: (email: string, password: string) => Promise<{ userId: string } | null>;
  fetchImpl?: typeof fetch;
};

const HOSTS = new Set(["chatgpt.com", "claude.ai", "claude.com", "anthropic.com"]);

export function canonicalRedirect(value: string): string | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.username || url.password || url.hash) return null;
  if (url.protocol === "http:") {
    if (url.hostname !== "localhost" && url.hostname !== "127.0.0.1") return null;
    const port = Number(url.port);
    if (!Number.isInteger(port) || port < 1024 || port > 65535) return null;
    if (!/^\/[A-Za-z0-9._~/-]*$/.test(url.pathname) || url.search) return null;
    return `${url.origin}${url.pathname}`;
  }
  if (url.protocol !== "https:" || url.port) return null;
  const full = `${url.origin}${url.pathname}`;
  if (
    full === "https://claude.ai/api/mcp/auth_callback" ||
    full === "https://claude.com/api/mcp/auth_callback" ||
    full === "https://chatgpt.com/connector_platform_oauth_redirect"
  ) {
    return full;
  }
  if (/^https:\/\/chatgpt\.com\/connector\/oauth\/[A-Za-z0-9_-]{1,80}$/.test(full)) return full;
  if (/^https:\/\/chatgpt\.com\/backend-api\/aip\/connectors\/[A-Za-z0-9/_-]{1,120}$/.test(full)) return full;
  if (/^https:\/\/chat\.openai\.com\/aip\/[A-Za-z0-9_-]{1,80}\/oauth\/callback$/.test(full)) return full;
  return null;
}

export function protectedResource(resource: string): Record<string, unknown> {
  return {
    resource,
    authorization_servers: [resource],
    scopes_supported: ["read", "write"],
    bearer_methods_supported: ["header"],
    resource_name: "LIFEMANAGER",
  };
}

export function authorizationMetadata(resource: string): Record<string, unknown> {
  return {
    issuer: resource,
    authorization_endpoint: `${resource}/oauth/authorize`,
    token_endpoint: `${resource}/oauth/token`,
    registration_endpoint: `${resource}/oauth/register`,
    revocation_endpoint: `${resource}/oauth/revoke`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    client_id_metadata_document_supported: true,
    scopes_supported: ["read", "write"],
    service_documentation: "https://github.com/karasawhatup/lifemanager/blob/main/docs/mcp.md",
  };
}

export async function verifySupabasePassword(
  env: Env,
  email: string,
  password: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ userId: string } | null> {
  if (!env.supabaseUrl || !env.anonKey) return null;
  const res = await fetchImpl(`${env.supabaseUrl.replace(/\/$/, "")}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: env.anonKey, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) return null;
  const body = (await res.json()) as { user?: { id?: string } };
  const id = body.user?.id ?? "";
  if (!isUuid(id)) return null;
  return { userId: id };
}

export async function handleRegister(req: Request, deps: OAuthDeps): Promise<Response> {
  const body = await readJson(req);
  const rawUris = Array.isArray(body.redirect_uris) ? body.redirect_uris : [];
  const redirectUris = rawUris
    .filter((item): item is string => typeof item === "string")
    .map((item) => canonicalRedirect(item))
    .filter((item): item is string => Boolean(item));
  if (redirectUris.length === 0 || redirectUris.length > 8 || redirectUris.length !== rawUris.length) {
    return oauthError(400, "invalid_redirect_uri", "リダイレクト先が許可されていません / Redirect URI is not allowed");
  }
  const name = typeof body.client_name === "string" ? clean(body.client_name).slice(0, 80) : null;
  const clientId = randomToken("lmc_").slice(0, 48);
  await deps.db.insert("mcp_oauth_clients", {
    client_id: clientId,
    redirect_uris: redirectUris,
    client_name: name,
  });
  return json(
    {
      client_id: clientId,
      client_id_issued_at: Math.floor(deps.now.getTime() / 1000),
      redirect_uris: redirectUris,
      client_name: name,
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
    },
    201,
  );
}

export async function handleAuthorize(req: Request, deps: OAuthDeps): Promise<Response> {
  const params = req.method === "GET" ? new URL(req.url).searchParams : await readForm(req);
  const clientId = params.get("client_id") ?? "";
  const redirect = canonicalRedirect(params.get("redirect_uri") ?? "");
  const challenge = params.get("code_challenge") ?? "";
  const method = params.get("code_challenge_method") ?? "";
  const responseType = params.get("response_type") ?? "code";
  const state = clean(params.get("state") ?? "").slice(0, 512);
  const resource = params.get("resource") ?? "";
  const allowedScopes = parseScopes(params.get("scope"));
  if (!clientId || !redirect || !/^[A-Za-z0-9_-]{43,128}$/.test(challenge) || method !== "S256" || responseType !== "code") {
    return html(page("接続できません", "<p>認可リクエストの項目が足りないか、リダイレクト先が許可されていません。</p>"), 400);
  }
  if (resource && resource.replace(/\/$/, "") !== deps.resource.replace(/\/$/, "")) {
    return html(page("接続できません", "<p>接続先の URL がこのサーバーと違います。</p>"), 400);
  }
  if (!allowedScopes) return html(page("接続できません", "<p>scope は read か write です。</p>"), 400);
  const clientOk = await clientAllows(deps, clientId, redirect);
  if (!clientOk) return html(page("接続できません", "<p>このクライアントは登録されていません。</p>"), 400);

  if (req.method === "GET") {
    return html(loginPage({ clientId, redirect, challenge, state, resource: deps.resource, scopes: allowedScopes }), 200);
  }

  const email = (params.get("email") ?? "").trim();
  const password = params.get("password") ?? "";
  const label = clean(params.get("label") ?? "") || defaultLabel(redirect);
  const scope = params.get("chosen_scope") ?? "";
  if (!allowedScopes.includes(scope as "read" | "write") || (scope !== "read" && scope !== "write")) {
    return html(loginPage({ clientId, redirect, challenge, state, resource: deps.resource, scopes: allowedScopes, error: "権限を選び直してください。" }), 400);
  }
  if (label.length > 80 || email.length > 200 || password.length < 1 || password.length > 200) {
    return html(loginPage({ clientId, redirect, challenge, state, resource: deps.resource, scopes: allowedScopes, error: "入力を確認してください。" }), 400);
  }
  const user = await deps.verifyPassword(email, password);
  if (!user) {
    return html(loginPage({ clientId, redirect, challenge, state, resource: deps.resource, scopes: allowedScopes, error: "メールアドレスまたはパスワードが違います。" }), 401);
  }
  const active = await deps.db.select("mcp_access_tokens", {
    filters: [eq("owner_id", user.userId), isNull("revoked_at")],
    columns: "id",
    limit: 21,
  });
  if (active.length >= 20) {
    return html(page("トークンが多すぎます", "<p>設定画面で古いトークンを取り消してから、もう一度つないでください。</p>"), 400);
  }
  const code = randomToken("lmoc_");
  await deps.db.insert("mcp_oauth_codes", {
    code_hash: await sha256Hex(code),
    owner_id: user.userId,
    client_id: clientId.slice(0, 300),
    redirect_uri: redirect,
    scope,
    label,
    code_challenge: challenge,
    expires_at: new Date(deps.now.getTime() + 5 * 60 * 1000).toISOString(),
    used_at: null,
  });
  const dest = new URL(redirect);
  dest.searchParams.set("code", code);
  if (state) dest.searchParams.set("state", state);
  return new Response(null, { status: 302, headers: { Location: dest.href, "Cache-Control": "no-store" } });
}

export async function handleToken(req: Request, deps: OAuthDeps): Promise<Response> {
  const params = await readForm(req);
  const grant = params.get("grant_type") ?? "";
  const clientId = params.get("client_id") ?? "";
  const resource = params.get("resource") ?? deps.resource;
  if (resource.replace(/\/$/, "") !== deps.resource.replace(/\/$/, "")) {
    return oauthError(400, "invalid_target", "resource が違います / Resource does not match");
  }
  if (grant === "refresh_token") return refresh(params, deps, clientId);
  if (grant !== "authorization_code") return oauthError(400, "unsupported_grant_type", "grant_type が違います / Unsupported grant");
  const code = params.get("code") ?? "";
  const verifier = params.get("code_verifier") ?? "";
  const redirect = canonicalRedirect(params.get("redirect_uri") ?? "");
  if (!code.startsWith("lmoc_") || !redirect || !/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)) {
    return oauthError(400, "invalid_grant", "認可コードが無効です / Invalid grant");
  }
  const rows = await deps.db.select("mcp_oauth_codes", {
    filters: [eq("code_hash", await sha256Hex(code))],
    limit: 1,
  });
  const row = rows[0];
  if (!row || row.used_at || String(row.client_id) !== clientId || String(row.redirect_uri) !== redirect) {
    return oauthError(400, "invalid_grant", "認可コードが無効です / Invalid grant");
  }
  if (Date.parse(String(row.expires_at)) < deps.now.getTime()) {
    return oauthError(400, "invalid_grant", "認可コードの期限が切れました / Code expired");
  }
  if (!same(await pkceS256(verifier), String(row.code_challenge))) {
    return oauthError(400, "invalid_grant", "PKCE が一致しません / PKCE verification failed");
  }
  const marked = await deps.db.update(
    "mcp_oauth_codes",
    [eq("code_hash", await sha256Hex(code)), isNull("used_at")],
    { used_at: deps.now.toISOString() },
  );
  if (marked.length !== 1) return oauthError(400, "invalid_grant", "認可コードが無効です / Invalid grant");
  const issued = await issueToken(deps, {
    ownerId: String(row.owner_id),
    scope: String(row.scope) === "write" ? "write" : "read",
    label: String(row.label),
  });
  return json(issued, 200);
}

export async function handleRevoke(req: Request, deps: OAuthDeps): Promise<Response> {
  const params = await readForm(req);
  const token = params.get("token") ?? "";
  if (token.startsWith("lmrt_")) {
    const rows = await deps.db.select("mcp_oauth_refresh", {
      filters: [eq("token_hash", await sha256Hex(token))],
      limit: 1,
    });
    const row = rows[0];
    if (row && !row.revoked_at) {
      await deps.db.update("mcp_oauth_refresh", [eq("token_hash", String(row.token_hash))], { revoked_at: deps.now.toISOString() });
      await deps.db.update("mcp_access_tokens", [eq("id", String(row.access_token_id)), isNull("revoked_at")], {
        revoked_at: deps.now.toISOString(),
      });
    }
  } else if (token.startsWith("lm_")) {
    await deps.db.update("mcp_access_tokens", [eq("token_hash", await sha256Hex(token)), isNull("revoked_at")], {
      revoked_at: deps.now.toISOString(),
    });
  }
  return new Response(null, { status: 200, headers: { "Cache-Control": "no-store" } });
}

async function refresh(params: URLSearchParams, deps: OAuthDeps, clientId: string): Promise<Response> {
  const token = params.get("refresh_token") ?? "";
  if (!token.startsWith("lmrt_") || !clientId) return oauthError(400, "invalid_grant", "リフレッシュトークンが無効です / Invalid refresh token");
  const rows = await deps.db.select("mcp_oauth_refresh", {
    filters: [eq("token_hash", await sha256Hex(token)), isNull("revoked_at")],
    limit: 1,
  });
  const row = rows[0];
  if (!row || Date.parse(String(row.expires_at)) < deps.now.getTime()) {
    return oauthError(400, "invalid_grant", "リフレッシュトークンが無効です / Invalid refresh token");
  }
  const accessRows = await deps.db.select("mcp_access_tokens", {
    filters: [eq("id", String(row.access_token_id))],
    limit: 1,
  });
  const access = accessRows[0];
  if (!access || access.revoked_at) return oauthError(400, "invalid_grant", "トークンは取り消されています / Token revoked");
  if (!(await knownClient(deps, clientId))) return oauthError(400, "invalid_client", "クライアントが違います / Unknown client");
  const issued = await issueToken(deps, {
    ownerId: String(access.owner_id),
    scope: access.scope === "write" ? "write" : "read",
    label: String(access.label),
  });
  await deps.db.update("mcp_access_tokens", [eq("id", String(access.id)), isNull("revoked_at")], { revoked_at: deps.now.toISOString() });
  await deps.db.update("mcp_oauth_refresh", [eq("token_hash", String(row.token_hash))], { revoked_at: deps.now.toISOString() });
  return json(issued, 200);
}

async function knownClient(deps: OAuthDeps, clientId: string): Promise<boolean> {
  if (clientId.startsWith("lmc_")) {
    const rows = await deps.db.select("mcp_oauth_clients", { filters: [eq("client_id", clientId)], limit: 1 });
    return rows.length === 1;
  }
  if (clientId.startsWith("https://")) {
    const uris = await fetchCimd(clientId, deps.fetchImpl ?? fetch);
    return Boolean(uris && uris.length);
  }
  return false;
}

async function issueToken(deps: OAuthDeps, input: { ownerId: string; scope: "read" | "write"; label: string }): Promise<Record<string, unknown>> {
  const access = randomToken("lm_");
  const refreshToken = randomToken("lmrt_");
  const row = await deps.db.insert("mcp_access_tokens", {
    owner_id: input.ownerId,
    label: input.label.slice(0, 80),
    token_prefix: access.slice(0, 12),
    token_hash: await sha256Hex(access),
    scope: input.scope,
    audience: deps.resource,
    issued_via: "oauth",
    window_count: 0,
  });
  const expires = new Date(deps.now.getTime() + 180 * 24 * 60 * 60 * 1000).toISOString();
  await deps.db.insert("mcp_oauth_refresh", {
    token_hash: await sha256Hex(refreshToken),
    access_token_id: String(row.id),
    expires_at: expires,
  });
  return {
    access_token: access,
    token_type: "Bearer",
    expires_in: 180 * 24 * 60 * 60,
    refresh_token: refreshToken,
    scope: input.scope,
  };
}

async function clientAllows(deps: OAuthDeps, clientId: string, redirect: string): Promise<boolean> {
  if (clientId.startsWith("lmc_")) {
    const rows = await deps.db.select("mcp_oauth_clients", { filters: [eq("client_id", clientId)], limit: 1 });
    const uris = rows[0]?.redirect_uris;
    return Array.isArray(uris) && uris.map(String).includes(redirect);
  }
  if (!clientId.startsWith("https://")) return false;
  const uris = await fetchCimd(clientId, deps.fetchImpl ?? fetch);
  if (!uris) return false;
  return uris.some((item) => canonicalRedirect(item) === redirect);
}

async function fetchCimd(clientId: string, fetchImpl: typeof fetch): Promise<string[] | null> {
  let url: URL;
  try {
    url = new URL(clientId);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port || !HOSTS.has(url.hostname)) return null;
  try {
    const res = await fetchImpl(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(5000),
      headers: { accept: "application/json" },
    });
    if (res.status !== 200) return null;
    const text = await res.text();
    if (text.length > 65536) return null;
    const body = JSON.parse(text) as { redirect_uris?: unknown };
    if (!Array.isArray(body.redirect_uris)) return null;
    return body.redirect_uris.filter((item): item is string => typeof item === "string").slice(0, 8);
  } catch {
    return null;
  }
}

function parseScopes(value: string | null): string[] | null {
  const parts = (value ?? "").split(/\s+/).filter(Boolean);
  if (parts.length === 0) return ["read", "write"];
  if (parts.some((part) => part !== "read" && part !== "write")) return null;
  return [...new Set(parts)];
}

function defaultLabel(redirect: string): string {
  if (redirect.includes("chatgpt.com") || redirect.includes("openai.com")) return "ChatGPT";
  if (redirect.includes("claude")) return "Claude";
  if (redirect.includes("localhost") || redirect.includes("127.0.0.1")) return "ローカル";
  return "外部AI";
}

function clean(value: string): string {
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim();
}

function same(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function readJson(req: Request): Promise<Record<string, unknown>> {
  const text = await req.text();
  if (text.length > 65536) return {};
  try {
    const body = JSON.parse(text) as unknown;
    return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

async function readForm(req: Request): Promise<URLSearchParams> {
  const type = req.headers.get("content-type") ?? "";
  const text = await req.text();
  if (text.length > 65536) return new URLSearchParams();
  if (type.includes("application/json")) {
    const body = await readJson(new Request(req.url, { method: "POST", body: text, headers: { "content-type": "application/json" } }));
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(body)) {
      if (typeof value === "string") params.set(key, value);
    }
    return params;
  }
  return new URLSearchParams(text);
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

function oauthError(status: number, error: string, description: string): Response {
  return json({ error, error_description: description }, status);
}

function html(body: string, status: number): Response {
  return new Response(body, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}

function esc(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => (ch === "&" ? "&amp;" : ch === "<" ? "&lt;" : ch === ">" ? "&gt;" : ch === '"' ? "&quot;" : "&#39;"));
}

function page(title: string, inner: string): string {
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)}</title>
<style>body{margin:0;background:#07080a;color:#f4f5f7;font:16px/1.5 sans-serif}main{max-width:420px;margin:0 auto;padding:28px 16px}h1{font-size:22px}p,label{color:#c5c8d0}input,select,button{font:inherit;width:100%;box-sizing:border-box}input,select{margin:6px 0 14px;padding:12px;border-radius:12px;border:1px solid rgba(255,255,255,.16);background:#0c0d11;color:#f4f5f7}button{height:46px;border:0;border-radius:999px;background:#f3f5f8;color:#121318;font-weight:650}.err{color:#f0c9c9}</style></head><body><main><h1>${esc(title)}</h1>${inner}</main></body></html>`;
}

function loginPage(input: {
  clientId: string;
  redirect: string;
  challenge: string;
  state: string;
  resource: string;
  scopes: string[];
  error?: string;
}): string {
  const options = input.scopes
    .map((scope) => `<option value="${scope}"${scope === "read" ? " selected" : ""}>${scope === "read" ? "読むだけ" : "読み書き"}</option>`)
    .join("");
  const error = input.error ? `<p class="err">${esc(input.error)}</p>` : "";
  return page(
    "LIFEMANAGER に接続",
    `${error}<p>LIFEMANAGER のログインと同じメールアドレスとパスワードです。接続すると、設定画面にトークンの名前だけが残ります。生のトークンはここには残りません。</p>
<form method="post" action="${esc(input.resource)}/oauth/authorize">
<input type="hidden" name="client_id" value="${esc(input.clientId)}">
<input type="hidden" name="redirect_uri" value="${esc(input.redirect)}">
<input type="hidden" name="code_challenge" value="${esc(input.challenge)}">
<input type="hidden" name="code_challenge_method" value="S256">
<input type="hidden" name="response_type" value="code">
<input type="hidden" name="state" value="${esc(input.state)}">
<input type="hidden" name="scope" value="${esc(input.scopes.join(" "))}">
<input type="hidden" name="resource" value="${esc(input.resource)}">
<label>名前<input name="label" maxlength="80" value="${esc(defaultLabel(input.redirect))}"></label>
<label>権限<select name="chosen_scope">${options}</select></label>
<label>メール<input name="email" type="email" autocomplete="username" required></label>
<label>パスワード<input name="password" type="password" autocomplete="current-password" required></label>
<button type="submit">接続する</button>
</form>
<p>読み書きでも、削除は相手が confirm を付けたときだけです。取り消すときは LIFEMANAGER の設定です。</p>`,
  );
}
