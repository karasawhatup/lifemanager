import { sha256Hex } from "./crypto.ts";
import { eq, isNull, type Store } from "./db.ts";
import { isUuid } from "./validate.ts";

export type Session = {
  tokenId: string;
  ownerId: string;
  scope: "read" | "write";
};

export type AuthFailure = {
  ok: false;
  status: 401 | 429;
  message: string;
  wwwError?: "invalid_token" | "invalid_request";
};

export type AuthSuccess = { ok: true; session: Session };

const LIMIT = 60;
const WINDOW_MS = 60_000;

export function bearerToken(header: string | null): { kind: "none" | "jwt" | "token"; token?: string } {
  const value = (header ?? "").trim();
  if (!value) return { kind: "none" };
  const raw = value.replace(/^Bearer\s+/i, "").trim();
  if (!raw || raw === value) return { kind: "none" };
  if (raw.startsWith("eyJ") || raw.split(".").length === 3) return { kind: "jwt" };
  if (!/^lm_[A-Za-z0-9_-]{20,180}$/.test(raw)) return { kind: "none" };
  if (raw.startsWith("lmrt_") || raw.startsWith("lmoc_") || raw.startsWith("lmc_")) return { kind: "none" };
  return { kind: "token", token: raw };
}

export async function authenticate(
  db: Store,
  header: string | null,
  resource: string,
  now: Date,
): Promise<AuthSuccess | AuthFailure> {
  const parsed = bearerToken(header);
  if (parsed.kind === "jwt") {
    return {
      ok: false,
      status: 401,
      wwwError: "invalid_token",
      message: "Supabase の鍵ではなく、設定画面で作った MCP トークンを使ってください / Use an MCP token from Settings, not a Supabase key.",
    };
  }
  if (parsed.kind !== "token" || !parsed.token) {
    return {
      ok: false,
      status: 401,
      wwwError: "invalid_request",
      message: "Authorization: Bearer に MCP トークンが必要です / A bearer MCP token is required.",
    };
  }

  const hash = await sha256Hex(parsed.token);
  const rows = await db.select("mcp_access_tokens", {
    filters: [eq("token_hash", hash), isNull("revoked_at")],
    columns: "id,owner_id,scope,audience,window_started_at,window_count",
    limit: 1,
  });
  const row = rows[0];
  if (!row) {
    return {
      ok: false,
      status: 401,
      wwwError: "invalid_token",
      message: "トークンが無効か、取り消されています / The token is invalid or revoked.",
    };
  }
  const ownerId = String(row.owner_id ?? "");
  const tokenId = String(row.id ?? "");
  const scope = row.scope === "write" ? "write" : row.scope === "read" ? "read" : null;
  if (!scope || !isUuid(ownerId) || !isUuid(tokenId)) {
    return {
      ok: false,
      status: 401,
      wwwError: "invalid_token",
      message: "トークンが無効か、取り消されています / The token is invalid or revoked.",
    };
  }
  const audience = row.audience == null ? "" : String(row.audience);
  if (audience && audience.replace(/\/$/, "") !== resource.replace(/\/$/, "")) {
    return {
      ok: false,
      status: 401,
      wwwError: "invalid_token",
      message: "このトークンは別の接続先用です / This token was issued for a different server.",
    };
  }

  const started = row.window_started_at ? Date.parse(String(row.window_started_at)) : Number.NaN;
  let count = Number(row.window_count ?? 0);
  if (!Number.isFinite(count) || count < 0) count = 0;
  let windowStart = started;
  if (!Number.isFinite(windowStart) || now.getTime() - windowStart >= WINDOW_MS) {
    count = 0;
    windowStart = now.getTime();
  }
  count += 1;
  const patch = {
    window_count: count,
    window_started_at: new Date(windowStart).toISOString(),
    last_used_at: now.toISOString(),
  };
  await db.update("mcp_access_tokens", [eq("id", tokenId), eq("owner_id", ownerId)], patch).catch(() => undefined);
  if (count > LIMIT) {
    return {
      ok: false,
      status: 429,
      message: "リクエストが多すぎます。1分ほど待ってください / Too many requests. Wait about a minute.",
    };
  }
  return { ok: true, session: { tokenId, ownerId, scope } };
}
