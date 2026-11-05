import { createClient } from "npm:@supabase/supabase-js@2";

export const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
  });
}

export function preflight(req: Request): Response | null {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  return null;
}

export function isResponse(value: unknown): value is Response {
  return value instanceof Response;
}

/** ログイン中のユーザーだけ通す。service_role は使わない。 */
export async function requireUser(req: Request): Promise<{ id: string } | Response> {
  const header = req.headers.get("Authorization") ?? "";
  const jwt = header.replace(/^Bearer\s+/i, "").trim();
  if (!jwt || jwt === "undefined") return json({ error: "ログインが必要です" }, 401);

  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const anon = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  if (!url || !anon) return json({ error: "関数の Supabase 設定がありません" }, 500);

  const supabase = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.auth.getUser(jwt);
  if (error || !data.user) return json({ error: "ログインが必要です" }, 401);
  return { id: data.user.id };
}

export function clipError(text: string): string {
  return text
    .replace(/sk-[A-Za-z0-9_-]{8,}/g, "[hidden]")
    .replace(/AIza[0-9A-Za-z_-]{10,}/g, "[hidden]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 280);
}
