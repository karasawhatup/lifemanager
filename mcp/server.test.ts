import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import { sha256Hex, pkceS256 } from "../supabase/functions/_shared/mcp/crypto.ts";
import { eq, type Filter, type Row, type SelectOpts, type Store } from "../supabase/functions/_shared/mcp/db.ts";
import { handleRequest, type ServerDeps } from "../supabase/functions/_shared/mcp/http.ts";
import { runStdio } from "../supabase/functions/_shared/mcp/stdio.ts";

const OWNER = "11111111-1111-1111-1111-111111111111";
const TOKEN = "lm_testtoken_aaaaaaaaaaaa";
const NOW = new Date("2026-11-26T01:00:00.000Z");
const BASE = "https://oynfsgxgpsotvbqbpksl.supabase.co/functions/v1/mcp";

function memory(): Store & { tables: Map<string, Row[]> } {
  const tables = new Map<string, Row[]>();
  const bucket = (table: string) => {
    const found = tables.get(table);
    if (found) return found;
    const created: Row[] = [];
    tables.set(table, created);
    return created;
  };
  const match = (row: Row, filters: Filter[]) =>
    filters.every((filter) => {
      const value = row[filter.column];
      if (filter.op === "is") return filter.value === "null" ? value == null : String(value) === filter.value;
      if (filter.op === "eq") return String(value) === filter.value;
      if (filter.op === "gte") return String(value ?? "") >= filter.value;
      if (filter.op === "lt") return String(value ?? "") < filter.value;
      if (filter.op === "cs") {
        const inner = filter.value.slice(1, -1);
        return Array.isArray(value) && value.map(String).includes(inner);
      }
      return false;
    });
  return {
    tables,
    async select(table, opts: SelectOpts = {}) {
      let rows = bucket(table).filter((row) => match(row, opts.filters ?? []));
      if (opts.orIlike?.query) {
        const query = opts.orIlike.query.toLowerCase();
        rows = rows.filter((row) => opts.orIlike?.columns.some((column) => String(row[column] ?? "").toLowerCase().includes(query)));
      }
      if (opts.order?.length) {
        rows = [...rows].sort((a, b) => {
          for (const order of opts.order ?? []) {
            const left = String(a[order.column] ?? "");
            const right = String(b[order.column] ?? "");
            if (left === right) continue;
            const cmp = left < right ? -1 : 1;
            return order.ascending ? cmp : -cmp;
          }
          return 0;
        });
      }
      if (opts.limit) rows = rows.slice(0, opts.limit);
      return rows.map((row) => structuredClone(row));
    },
    async insert(table, row) {
      const copy = structuredClone(row);
      if (!copy.id) copy.id = crypto.randomUUID();
      bucket(table).push(copy);
      return structuredClone(copy);
    },
    async update(table, filters, patch) {
      const found = bucket(table).filter((row) => match(row, filters));
      for (const row of found) Object.assign(row, structuredClone(patch));
      return found.map((row) => structuredClone(row));
    },
    async remove(table, filters) {
      const all = bucket(table);
      const found = all.filter((row) => match(row, filters));
      tables.set(
        table,
        all.filter((row) => !match(row, filters)),
      );
      return found.map((row) => structuredClone(row));
    },
  };
}

async function seed(db: Store, token: string, scope: "read" | "write", extra: Row = {}): Promise<void> {
  await db.insert("mcp_access_tokens", {
    id: crypto.randomUUID(),
    owner_id: OWNER,
    label: "test",
    token_prefix: token.slice(0, 12),
    token_hash: await sha256Hex(token),
    scope,
    audience: null,
    issued_via: "app",
    revoked_at: null,
    last_used_at: null,
    window_started_at: null,
    window_count: 0,
    ...extra,
  });
}

function deps(db: Store, now = NOW): ServerDeps {
  return {
    env: {
      supabaseUrl: "https://oynfsgxgpsotvbqbpksl.supabase.co",
      serviceRoleKey: "test-service-role",
      anonKey: "test-anon",
    },
    db,
    now: () => now,
    verifyPassword: async (email, password) =>
      email === "xolda@example.com" && password === "secret" ? { userId: OWNER } : null,
    fetchImpl: async () => {
      throw new Error("network disabled");
    },
  };
}

function rpc(method: string, params: unknown, token?: string, id: number | string = 1): Request {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
  };
  if (token) headers.authorization = `Bearer ${token}`;
  return new Request(BASE, {
    method: "POST",
    headers,
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
  });
}

async function call(db: Store, method: string, params: unknown, token = TOKEN) {
  const res = await handleRequest(rpc(method, params, token), deps(db));
  const body = (await res.json()) as { result?: { content?: { text: string }[]; tools?: { name: string; description: string; inputSchema: { type: string } }[]; isError?: boolean }; error?: { message: string } };
  return { status: res.status, body, headers: res.headers };
}

test("sha256 matches the known abc vector", async () => {
  assert.equal(await sha256Hex("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
});

test("initialize, tools/list, and tools/call", async () => {
  const db = memory();
  await seed(db, TOKEN, "write");
  const init = await call(db, "initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "test", version: "0" },
  });
  assert.equal(init.status, 200);
  assert.equal((init.body.result as { protocolVersion?: string }).protocolVersion, "2025-06-18");

  const listed = await call(db, "tools/list", {});
  const names = (listed.body.result?.tools ?? []).map((tool) => tool.name);
  for (const name of [
    "list_todos",
    "get_todo",
    "create_todo",
    "update_todo",
    "complete_todo",
    "delete_todo",
    "list_schedule_blocks",
    "create_schedule_block",
    "complete_schedule_block",
    "delete_schedule_block",
    "list_wishes",
    "create_wish",
    "complete_wish",
    "delete_wish",
    "list_wake_sleep",
    "log_wake_sleep",
    "delete_wake_sleep",
    "list_change_requests",
    "reply_change_request",
    "list_travel_times",
    "create_travel_time",
    "delete_travel_time",
    "get_settings",
    "add_expression",
    "search_expressions",
    "log_study_resource",
    "log_grammar_question",
    "answer_grammar_question",
    "submit_composition",
    "correct_composition",
    "create_assignment",
    "list_assignments",
    "submit_assignment",
    "review_assignment",
    "study_log_summary",
    "list_speaking_sessions",
    "get_speaking_session",
    "list_pronunciation_attempts",
    "get_pronunciation_attempt",
  ]) {
    assert.ok(names.includes(name), name);
  }
  assert.equal(new Set(names).size, names.length);
  for (const tool of listed.body.result?.tools ?? []) {
    assert.match(tool.description, /[ぁ-んァ-ン一-龯]/u);
    assert.equal(tool.inputSchema.type, "object");
  }
  for (const name of names) {
    assert.doesNotMatch(name, /conversation|speech_token|score_pronunciation|start_speaking|delete_speaking|create_speaking/);
  }

  await db.insert("todos", {
    id: "22222222-2222-2222-2222-222222222222",
    owner_id: OWNER,
    title: "レポート",
    rank: "A",
    status: "open",
    source: "app",
    created_by: "app",
  });
  const todos = await call(db, "tools/call", { name: "list_todos", arguments: { status: "open" } });
  const payload = JSON.parse(todos.body.result?.content?.[0]?.text ?? "{}") as { count: number; items: { title: string }[] };
  assert.equal(payload.count, 1);
  assert.equal(payload.items[0]?.title, "レポート");
});

test("server source does not call speaking model endpoints", () => {
  const dir = "supabase/functions/_shared/mcp";
  const files = readdirSync(dir).filter((name) => name.endsWith(".ts"));
  const source = files.map((name) => readFileSync(`${dir}/${name}`, "utf8")).join("\n");
  assert.doesNotMatch(source, /conversation-reply|speech-token|generativelanguage|cognitive\.microsoft/);
});

test("delete requires confirm and stays inside the owner", async () => {
  const db = memory();
  await seed(db, TOKEN, "write");
  const id = "33333333-3333-3333-3333-333333333333";
  await db.insert("todos", { id, owner_id: OWNER, title: "消す", rank: "C", status: "open", source: "app", created_by: "app" });
  const blocked = await call(db, "tools/call", { name: "delete_todo", arguments: { id, confirm: false } });
  assert.equal(blocked.body.result?.isError, true);
  assert.match(blocked.body.result?.content?.[0]?.text ?? "", /confirm/);
  assert.equal((await db.select("todos")).length, 1);
  const removed = await call(db, "tools/call", { name: "delete_todo", arguments: { id, confirm: true } });
  assert.equal(removed.body.result?.isError, undefined);
  assert.equal((await db.select("todos")).length, 0);
});

test("read token cannot write and a foreign owner id is rejected", async () => {
  const db = memory();
  await seed(db, TOKEN, "read");
  const denied = await call(db, "tools/call", { name: "create_todo", arguments: { title: "だめ", rank: "A" } });
  assert.equal(denied.body.result?.isError, true);
  assert.match(denied.body.result?.content?.[0]?.text ?? "", /読むだけ/);
  assert.equal((await db.select("todos")).length, 0);

  const write = "lm_writetoken_bbbbbbbbbbbb";
  await seed(db, write, "write");
  const foreign = await call(db, "tools/call", { name: "create_todo", arguments: { title: "侵入", rank: "A", owner_id: OWNER } }, write);
  assert.equal(foreign.body.result?.isError, true);
  assert.equal((await db.select("todos")).length, 0);
  const created = await call(db, "tools/call", { name: "create_todo", arguments: { title: "買う", rank: "B", estimated_minutes: 20 } }, write);
  assert.equal(created.body.result?.isError, undefined);
  const row = (await db.select("todos"))[0];
  assert.equal(row?.owner_id, OWNER);
  assert.equal(row?.source, "app");
  assert.equal(row?.created_by, "mcp");
});

test("schedule times must be 10 minutes and wake logs cannot be in the future", async () => {
  const db = memory();
  await seed(db, TOKEN, "write");
  const bad = await call(db, "tools/call", {
    name: "create_schedule_block",
    arguments: { date: "2026-11-26", start_time: "09:05", end_time: "10:00", title: "授業", category: "class" },
  });
  assert.equal(bad.body.result?.isError, true);
  assert.equal((await db.select("schedule_blocks")).length, 0);
  const good = await call(db, "tools/call", {
    name: "create_schedule_block",
    arguments: { date: "2026-11-26", start_time: "23:00", end_time: "24:00", title: "余白", category: "buffer" },
  });
  assert.equal(good.body.result?.isError, undefined);
  const future = await call(db, "tools/call", {
    name: "log_wake_sleep",
    arguments: { type: "wake", logged_at: "2026-11-27T12:00:00+09:00" },
  });
  assert.equal(future.body.result?.isError, true);
  assert.equal((await db.select("wake_sleep_logs")).length, 0);
});

test("english writes follow the paired status rules", async () => {
  const db = memory();
  await seed(db, TOKEN, "write");
  const question = "44444444-4444-4444-4444-444444444444";
  await db.insert("eng_questions", { id: question, owner_id: OWNER, question: "to の後ろは?", status: "open", answer: null, answered_by: null, created_by: "app" });
  const answered = await call(db, "tools/call", {
    name: "answer_grammar_question",
    arguments: { id: question, answer: "前置詞なので seeing です。" },
  });
  assert.equal(answered.body.result?.isError, undefined);
  const saved = (await db.select("eng_questions", { filters: [eq("id", question)] }))[0];
  assert.equal(saved?.status, "answered");
  assert.equal(saved?.answered_by, "tutor");
  assert.equal(saved?.answer, "前置詞なので seeing です。");

  const essay = "55555555-5555-5555-5555-555555555555";
  await db.insert("eng_essays", { id: essay, owner_id: OWNER, title: "", original_text: "I goes.", status: "pending", created_by: "app" });
  const corrected = await call(db, "tools/call", {
    name: "correct_composition",
    arguments: { id: essay, corrected_text: "I went.", explanation: "過去形です。" },
  });
  assert.equal(corrected.body.result?.isError, undefined);
  const essayRow = (await db.select("eng_essays"))[0];
  assert.equal(essayRow?.status, "corrected");
  assert.equal(essayRow?.corrected_by, "writer");
  assert.equal(essayRow?.explanation, "過去形です。");

  const assignment = "66666666-6666-6666-6666-666666666666";
  await db.insert("eng_assignments", {
    id: assignment,
    owner_id: OWNER,
    title: "表現を3つ",
    instructions: "書いてください",
    status: "assigned",
    answer: null,
    feedback: null,
    reviewed_by: null,
    submitted_at: null,
    created_by: "tutor",
  });
  const submitted = await call(db, "tools/call", { name: "submit_assignment", arguments: { id: assignment, answer: "look forward to" } });
  assert.equal(submitted.body.result?.isError, undefined);
  const open = (await db.select("eng_assignments"))[0];
  assert.equal(open?.status, "submitted");
  assert.ok(open?.submitted_at);
  const reviewed = await call(db, "tools/call", { name: "review_assignment", arguments: { id: assignment, feedback: "使えます。" } });
  assert.equal(reviewed.body.result?.isError, undefined);
  assert.equal((await db.select("eng_assignments"))[0]?.status, "reviewed");
  assert.equal((await db.select("eng_assignments"))[0]?.reviewed_by, "tutor");
});

test("study summary counts a Tokyo day and does not invent speaking rows", async () => {
  const db = memory();
  await seed(db, TOKEN, "read");
  await db.insert("eng_expressions", { id: crypto.randomUUID(), owner_id: OWNER, term: "look forward to", meaning: "楽しみに待つ", learned_on: "2026-11-26", created_by: "tutor" });
  await db.insert("schedule_blocks", {
    id: crypto.randomUUID(),
    owner_id: OWNER,
    date: "2026-11-26",
    start_time: "09:00:00",
    end_time: "10:00:00",
    title: "英語",
    category: "english",
    status: "planned",
    source: "app",
  });
  await db.insert("settings", { owner_id: OWNER, english_minutes_per_day: 60, timezone: "Asia/Tokyo" });
  const summary = await call(db, "tools/call", { name: "study_log_summary", arguments: {} });
  const body = JSON.parse(summary.body.result?.content?.[0]?.text ?? "{}") as {
    date: string;
    expressions: number;
    english_schedule_minutes: number;
    english_minutes_goal: number;
    speaking_sessions: number;
  };
  assert.equal(body.date, "2026-11-26");
  assert.equal(body.expressions, 1);
  assert.equal(body.english_schedule_minutes, 60);
  assert.equal(body.english_minutes_goal, 60);
  assert.equal(body.speaking_sessions, 0);
  assert.equal((await db.select("eng_speaking_sessions")).length, 0);
});

test("missing, revoked, and supabase keys are rejected", async () => {
  const db = memory();
  await seed(db, TOKEN, "read");
  const missing = await handleRequest(rpc("tools/list", {}), deps(db));
  assert.equal(missing.status, 401);
  assert.match(missing.headers.get("WWW-Authenticate") ?? "", /resource_metadata="https:\/\/oynfsgxgpsotvbqbpksl\.supabase\.co\/functions\/v1\/mcp\/oauth\/protected-resource"/);

  await db.update("mcp_access_tokens", [eq("token_hash", await sha256Hex(TOKEN))], { revoked_at: NOW.toISOString() });
  const revoked = await call(db, "tools/list", {});
  assert.equal(revoked.status, 401);

  const jwt = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.signature";
  const bad = await handleRequest(rpc("tools/list", {}, jwt), deps(db));
  const body = (await bad.json()) as { error?: { message?: string } };
  assert.equal(bad.status, 401);
  assert.match(body.error?.message ?? "", /MCP トークン/);
  assert.equal((body.error?.message ?? "").includes(jwt), false);
  assert.equal((body.error?.message ?? "").includes("service_role"), false);
});

test("rate limit returns 429", async () => {
  const db = memory();
  await seed(db, TOKEN, "read", { window_count: 60, window_started_at: NOW.toISOString() });
  const limited = await call(db, "tools/list", {});
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get("Retry-After"), "60");
});

test("notifications return 202 and sse is not offered", async () => {
  const db = memory();
  await seed(db, TOKEN, "read");
  const note = await handleRequest(
    new Request(BASE, {
      method: "POST",
      headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
    }),
    deps(db),
  );
  assert.equal(note.status, 202);
  assert.equal(await note.text(), "");
  const sse = await handleRequest(new Request(BASE, { headers: { accept: "text/event-stream" } }), deps(db));
  assert.equal(sse.status, 405);
});

test("oauth metadata, pkce login, and refresh", async () => {
  const db = memory();
  const server = deps(db);
  const metadata = await handleRequest(new Request(`${BASE}/.well-known/openid-configuration`), server);
  const meta = (await metadata.json()) as { authorization_endpoint: string; code_challenge_methods_supported: string[]; token_endpoint_auth_methods_supported: string[] };
  assert.equal(metadata.status, 200);
  assert.equal(meta.authorization_endpoint, `${BASE}/oauth/authorize`);
  assert.ok(meta.code_challenge_methods_supported.includes("S256"));
  assert.ok(meta.token_endpoint_auth_methods_supported.includes("none"));

  const registered = await handleRequest(
    new Request(`${BASE}/oauth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ redirect_uris: ["https://chatgpt.com/connector_platform_oauth_redirect"], client_name: "ChatGPT" }),
    }),
    server,
  );
  const client = (await registered.json()) as { client_id: string };
  assert.equal(registered.status, 201);
  const verifier = "a".repeat(64);
  const challenge = await pkceS256(verifier);
  const form = new URLSearchParams({
    client_id: client.client_id,
    redirect_uri: "https://chatgpt.com/connector_platform_oauth_redirect",
    code_challenge: challenge,
    code_challenge_method: "S256",
    response_type: "code",
    state: "xyz",
    scope: "read write",
    resource: BASE,
    email: "xolda@example.com",
    password: "secret",
    label: "ChatGPT",
    chosen_scope: "write",
  });
  const login = await handleRequest(
    new Request(`${BASE}/oauth/authorize`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: form }),
    server,
  );
  assert.equal(login.status, 302);
  const location = new URL(login.headers.get("Location") ?? "");
  assert.equal(location.origin + location.pathname, "https://chatgpt.com/connector_platform_oauth_redirect");
  assert.equal(location.searchParams.get("state"), "xyz");
  const code = location.searchParams.get("code") ?? "";
  const exchanged = await handleRequest(
    new Request(`${BASE}/oauth/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        code_verifier: verifier,
        redirect_uri: "https://chatgpt.com/connector_platform_oauth_redirect",
        client_id: client.client_id,
        resource: BASE,
      }),
    }),
    server,
  );
  const tokenBody = (await exchanged.json()) as { access_token: string; refresh_token: string; token_type: string; scope: string };
  assert.equal(tokenBody.token_type, "Bearer");
  assert.equal(tokenBody.scope, "write");
  const dumped = JSON.stringify([...db.tables.values()]);
  assert.equal(dumped.includes(tokenBody.access_token), false);
  assert.equal(dumped.includes(tokenBody.refresh_token), false);
  assert.equal(dumped.includes(code), false);
  assert.equal(dumped.includes("test-service-role"), false);

  const listed = await call(db, "tools/list", {}, tokenBody.access_token);
  assert.equal(listed.status, 200);
  assert.ok((listed.body.result?.tools ?? []).length > 10);

  const refreshed = await handleRequest(
    new Request(`${BASE}/oauth/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: tokenBody.refresh_token, client_id: client.client_id }),
    }),
    server,
  );
  const next = (await refreshed.json()) as { access_token: string };
  assert.equal(refreshed.status, 200);
  const oldCall = await call(db, "tools/list", {}, tokenBody.access_token);
  assert.equal(oldCall.status, 401);
  const newCall = await call(db, "tools/list", {}, next.access_token);
  assert.equal(newCall.status, 200);
});

test("evil client metadata is not fetched", async () => {
  const db = memory();
  let called = false;
  const server = deps(db);
  server.fetchImpl = async () => {
    called = true;
    throw new Error("should not fetch");
  };
  const res = await handleRequest(
    new Request(`${BASE}/oauth/authorize?client_id=https://evil.example/client.json&redirect_uri=https://evil.example/callback&code_challenge=${"a".repeat(43)}&code_challenge_method=S256&response_type=code`),
    server,
  );
  assert.equal(res.status, 400);
  assert.equal(called, false);
});

test("stdio speaks the same tools", async () => {
  const db = memory();
  await seed(db, TOKEN, "read");
  let out = "";
  await runStdio(
    {
      lines: (async function* () {
        yield JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" });
      })(),
      write: (chunk) => {
        out += chunk;
      },
      error: () => undefined,
      env: { supabaseUrl: "https://oynfsgxgpsotvbqbpksl.supabase.co", serviceRoleKey: "local-only", accessToken: TOKEN },
    },
    { db, now: () => NOW },
  );
  const body = JSON.parse(out) as { result: { tools: { name: string }[] } };
  assert.ok(body.result.tools.some((tool) => tool.name === "get_settings"));
});

test("oversized body is rejected", async () => {
  const db = memory();
  const res = await handleRequest(
    new Request(BASE, { method: "POST", headers: { "content-length": "300000", "content-type": "application/json" }, body: "{}" }),
    deps(db),
  );
  assert.equal(res.status, 413);
});
