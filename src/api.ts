import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { clearDemo, loadDemo, saveDemo, seedBundle } from "./demo";
import { DEFAULT_SETTINGS } from "./defaults";
import { isCategory } from "./labels";
import { emit, state } from "./state";
import { normalizeTime } from "./time";
import type {
  BlockStatus,
  Bundle,
  Category,
  ChangeRequest,
  Result,
  ScheduleBlock,
  Settings,
  Todo,
  TodoRank,
  TodoStatus,
  TravelTime,
  WakeSleepLog,
  WakeSleepType,
  Wish,
} from "./types";

const TABLES = [
  "schedule_blocks",
  "todos",
  "wishes",
  "wake_sleep_logs",
  "change_requests",
  "travel_times",
  "settings",
] as const;

let supabase: SupabaseClient | null = null;
let realtimeChannel: ReturnType<SupabaseClient["channel"]> | null = null;
let authReady = false;
let reloadTimer = 0;

export function readConfig(): { url: string; anonKey: string; live: boolean } {
  const fromWindow = window.LIFEMANAGER_CONFIG;
  const url = (fromWindow?.supabaseUrl || import.meta.env.VITE_SUPABASE_URL || "").trim();
  const anonKey = (fromWindow?.supabaseAnonKey || import.meta.env.VITE_SUPABASE_ANON_KEY || "").trim();
  const placeholder = /your_|xxx|example/i.test(url) || /your_|xxx/i.test(anonKey);
  const live = /^https?:\/\//.test(url) && anonKey.length >= 20 && !placeholder;
  return { url, anonKey, live };
}

function bundleFromState(): Bundle {
  if (!state.settings) throw new Error("settings missing");
  return {
    blocks: state.blocks,
    todos: state.todos,
    wishes: state.wishes,
    logs: state.logs,
    requests: state.requests,
    travels: state.travels,
    settings: state.settings,
  };
}

function applyBundle(bundle: Bundle): void {
  state.blocks = bundle.blocks;
  state.todos = bundle.todos;
  state.wishes = bundle.wishes;
  state.logs = bundle.logs;
  state.requests = bundle.requests;
  state.travels = bundle.travels;
  state.settings = bundle.settings;
}

function persist(): void {
  if (state.mode === "demo") saveDemo(bundleFromState());
}

function nowIso(): string {
  return new Date().toISOString();
}

function humanError(err: unknown): string {
  const raw =
    err && typeof err === "object" && "message" in err ? String((err as { message: unknown }).message) : "";
  console.error(err);
  if (/todos_minutes/i.test(raw)) return "所要時間は10分単位（10〜600）にしてください";
  if (/settings_|buffer_minutes|prep_minutes|day_length|laundry_interval/i.test(raw)) {
    return "設定の数字が範囲外です";
  }
  if (/ten_min|schedule_blocks_order/i.test(raw)) {
    return "時刻は10分単位で、終了は開始より後にしてください";
  }
  if (/travel_times_route|duplicate key/i.test(raw)) {
    return "同じ区間がすでにあります。そちらを編集してください";
  }
  if (/JWT|session/i.test(raw)) return "ログインの期限が切れました。もう一度ログインしてください";
  if (/Failed to fetch|NetworkError|network/i.test(raw)) return "ネットワークに接続できません";
  return "保存できませんでした。少し待ってからもう一度試してください";
}

function authError(raw: string): string {
  if (/invalid login/i.test(raw)) return "メールアドレスまたはパスワードが違います";
  if (/email not confirmed/i.test(raw)) {
    return "メールが未確認です。Supabaseでユーザーを作るとき Auto Confirm をオンにしてください";
  }
  if (/user not found|signups not allowed|not authorized/i.test(raw)) {
    return "そのメールのユーザーがありません。Supabaseの画面で一人だけ作ってください";
  }
  return "ログインできませんでした。URLとanon key、ユーザー作成を確認してください";
}

function guard(): Result {
  if (state.mode === "demo" || state.email) return { ok: true };
  return { ok: false, error: "先にログインしてください" };
}

function client(): SupabaseClient {
  if (!supabase) throw new Error("supabase is not ready");
  return supabase;
}

function asBlock(row: Record<string, unknown>): ScheduleBlock {
  const category = String(row.category);
  return {
    id: String(row.id),
    date: String(row.date),
    start_time: normalizeTime(String(row.start_time)),
    end_time: normalizeTime(String(row.end_time)),
    title: String(row.title),
    category: isCategory(category) ? category : "free",
    status: row.status === "done" || row.status === "skipped" ? row.status : "planned",
    notes: row.notes == null ? null : String(row.notes),
    source: row.source === "bot" ? "bot" : "app",
    created_by: row.created_by == null ? null : String(row.created_by),
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
  };
}

function asTodo(row: Record<string, unknown>): Todo {
  const rank = row.rank === "A" || row.rank === "B" || row.rank === "C" ? row.rank : "C";
  return {
    id: String(row.id),
    title: String(row.title),
    rank,
    due_date: row.due_date == null ? null : String(row.due_date),
    estimated_minutes: row.estimated_minutes == null ? null : Number(row.estimated_minutes),
    status: row.status === "done" ? "done" : "open",
    notes: row.notes == null ? null : String(row.notes),
    source: row.source === "bot" ? "bot" : "app",
    created_by: row.created_by == null ? null : String(row.created_by),
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
  };
}

function asWish(row: Record<string, unknown>): Wish {
  return {
    id: String(row.id),
    title: String(row.title),
    category: String(row.category ?? "other"),
    notes: row.notes == null ? null : String(row.notes),
    done: Boolean(row.done),
    source: row.source === "bot" ? "bot" : "app",
    created_by: row.created_by == null ? null : String(row.created_by),
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
  };
}

function asLog(row: Record<string, unknown>): WakeSleepLog {
  return {
    id: String(row.id),
    type: row.type === "sleep" ? "sleep" : "wake",
    logged_at: String(row.logged_at),
    notes: row.notes == null ? null : String(row.notes),
    source: row.source === "bot" ? "bot" : "app",
    created_by: row.created_by == null ? null : String(row.created_by),
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
  };
}

function asRequest(row: Record<string, unknown>): ChangeRequest {
  return {
    id: String(row.id),
    body: String(row.body),
    status: row.status === "handled" ? "handled" : "open",
    bot_response: row.bot_response == null ? null : String(row.bot_response),
    source: row.source === "bot" ? "bot" : "app",
    created_by: row.created_by == null ? null : String(row.created_by),
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
  };
}

function asTravel(row: Record<string, unknown>): TravelTime {
  return {
    id: String(row.id),
    from_place: String(row.from_place),
    to_place: String(row.to_place),
    minutes: Number(row.minutes),
    notes: row.notes == null ? null : String(row.notes),
    source: row.source === "bot" ? "bot" : "app",
    created_by: row.created_by == null ? null : String(row.created_by),
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
  };
}

function asSettings(row: Record<string, unknown>): Settings {
  return {
    display_name: String(row.display_name ?? "XOLDA"),
    timezone: String(row.timezone ?? "Asia/Tokyo"),
    buffer_minutes_per_day: Number(row.buffer_minutes_per_day ?? 120),
    prep_minutes: Number(row.prep_minutes ?? 40),
    english_minutes_per_day: Number(row.english_minutes_per_day ?? 60),
    meal_minutes: Number(row.meal_minutes ?? 40),
    bath_minutes: Number(row.bath_minutes ?? 30),
    laundry_interval_days: Number(row.laundry_interval_days ?? 3),
    day_length_hours: Number(row.day_length_hours ?? 16),
    created_by: row.created_by == null ? null : String(row.created_by),
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
  };
}

async function loadLive(): Promise<Result> {
  const sb = client();
  const [blocks, todos, wishes, logs, requests, travels, settings] = await Promise.all([
    sb.from("schedule_blocks").select("*").order("date").order("start_time").limit(5000),
    sb.from("todos").select("*").order("rank").limit(1000),
    sb.from("wishes").select("*").order("created_at", { ascending: false }).limit(1000),
    sb.from("wake_sleep_logs").select("*").order("logged_at", { ascending: false }).limit(1000),
    sb.from("change_requests").select("*").order("created_at", { ascending: false }).limit(500),
    sb.from("travel_times").select("*").order("from_place").limit(500),
    sb.from("settings").select("*").maybeSingle(),
  ]);
  const error = blocks.error || todos.error || wishes.error || logs.error || requests.error || travels.error || settings.error;
  if (error) return { ok: false, error: humanError(error) };

  state.blocks = ((blocks.data ?? []) as Record<string, unknown>[]).map(asBlock);
  state.todos = ((todos.data ?? []) as Record<string, unknown>[]).map(asTodo);
  state.wishes = ((wishes.data ?? []) as Record<string, unknown>[]).map(asWish);
  state.logs = ((logs.data ?? []) as Record<string, unknown>[]).map(asLog);
  state.requests = ((requests.data ?? []) as Record<string, unknown>[]).map(asRequest);
  state.travels = ((travels.data ?? []) as Record<string, unknown>[]).map(asTravel);

  if (settings.data) {
    state.settings = asSettings(settings.data as Record<string, unknown>);
  } else {
    const created = await ensureSettings();
    if (!created.ok) return created;
  }
  state.connected = true;
  return { ok: true };
}

async function ensureSettings(): Promise<Result> {
  const sb = client();
  const { data: userData, error: userError } = await sb.auth.getUser();
  if (userError || !userData.user) return { ok: false, error: "ログイン情報を確認できません" };
  const at = nowIso();
  const row = {
    owner_id: userData.user.id,
    ...DEFAULT_SETTINGS,
    created_by: "app",
  };
  const { data, error } = await sb.from("settings").upsert(row).select("*").single();
  if (error) return { ok: false, error: humanError(error) };
  state.settings = asSettings(data as Record<string, unknown>);
  state.settings.created_at ||= at;
  return { ok: true };
}

function subscribeRealtime(): void {
  if (realtimeChannel) return;
  const sb = client();
  const channel = sb.channel("lifemanager");
  for (const table of TABLES) {
    channel.on("postgres_changes", { event: "*", schema: "public", table }, () => queueReload());
  }
  realtimeChannel = channel;
  channel.subscribe((status) => {
    const connected = status === "SUBSCRIBED";
    if (state.connected === connected) return;
    state.connected = connected;
    if (!state.booting) emit();
  });
}

function queueReload(): void {
  window.clearTimeout(reloadTimer);
  reloadTimer = window.setTimeout(() => {
    const el = document.activeElement;
    const typing = !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT");
    if (typing) {
      queueReload();
      return;
    }
    void reloadSilent();
  }, 280);
}

export async function reloadSilent(): Promise<void> {
  if (state.mode !== "live" || !state.email) return;
  const result = await loadLive();
  if (!result.ok) state.connected = false;
  emit();
}

function redirectTo(): string {
  return new URL("./", window.location.href).href;
}

export async function boot(): Promise<void> {
  try {
    await bootInner();
  } catch (err) {
    console.error(err);
    state.booting = false;
    state.mode = "live";
    state.connected = false;
    state.authNotice = "接続できませんでした。デモに戻すには config.js のURLと鍵を空にして、もう一度開いてください";
    emit();
  }
}

async function bootInner(): Promise<void> {
  const cfg = readConfig();
  if (!cfg.live) {
    applyBundle(loadDemo());
    state.mode = "demo";
    state.connected = true;
    state.booting = false;
    state.pendingAutoScroll = true;
    emit();
    return;
  }

  state.mode = "live";
  supabase = createClient(cfg.url, cfg.anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });

  supabase.auth.onAuthStateChange((event, session) => {
    if (!authReady) return;
    if (event === "SIGNED_OUT") {
      state.email = null;
      state.blocks = [];
      state.todos = [];
      state.wishes = [];
      state.logs = [];
      state.requests = [];
      state.travels = [];
      state.settings = null;
      emit();
      return;
    }
    if (event === "SIGNED_IN") {
      const email = session?.user.email ?? null;
      if (state.email === email && state.settings) return;
      state.email = email;
      void reloadSilent().then(() => subscribeRealtime());
    }
  });

  const { data } = await supabase.auth.getSession();
  authReady = true;
  state.email = data.session?.user.email ?? null;
  if (data.session) {
    const result = await loadLive();
    if (!result.ok) state.authNotice = result.error;
    subscribeRealtime();
  }
  state.booting = false;
  state.pendingAutoScroll = true;
  emit();
}

export async function signInPassword(email: string, password: string): Promise<Result> {
  if (!supabase) return { ok: false, error: "Supabaseが未設定です" };
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { ok: false, error: authError(error.message) };
  state.email = email;
  state.authNotice = null;
  const loaded = await loadLive();
  if (!loaded.ok) return loaded;
  subscribeRealtime();
  return { ok: true };
}

export async function signInMagic(email: string): Promise<Result> {
  if (!supabase) return { ok: false, error: "Supabaseが未設定です" };
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: redirectTo(), shouldCreateUser: false },
  });
  if (error) return { ok: false, error: authError(error.message) };
  return { ok: true };
}

export async function signOut(): Promise<void> {
  await supabase?.auth.signOut();
  state.email = null;
  state.authNotice = null;
}

export function resetDemoData(): void {
  clearDemo();
  applyBundle(seedBundle());
  saveDemo(bundleFromState());
}

type BlockInput = {
  date: string;
  start_time: string;
  end_time: string;
  title: string;
  category: Category;
  notes: string | null;
};

export async function createBlock(input: BlockInput): Promise<Result> {
  const gated = guard();
  if (!gated.ok) return gated;
  if (state.mode === "demo") {
    const at = nowIso();
    state.blocks.push({
      id: crypto.randomUUID(),
      ...input,
      status: "planned",
      source: "app",
      created_by: "app",
      created_at: at,
      updated_at: at,
    });
    persist();
    return { ok: true };
  }
  const { data, error } = await client()
    .from("schedule_blocks")
    .insert({ ...input, status: "planned", source: "app", created_by: "app" })
    .select("*")
    .single();
  if (error) return { ok: false, error: humanError(error) };
  state.blocks.push(asBlock(data as Record<string, unknown>));
  return { ok: true };
}

export async function updateBlock(id: string, input: BlockInput): Promise<Result> {
  const gated = guard();
  if (!gated.ok) return gated;
  const current = state.blocks.find((b) => b.id === id);
  if (!current) return { ok: false, error: "予定が見つかりません" };
  if (state.mode === "demo") {
    Object.assign(current, input, { updated_at: nowIso() });
    persist();
    return { ok: true };
  }
  const { data, error } = await client().from("schedule_blocks").update(input).eq("id", id).select("*").single();
  if (error) return { ok: false, error: humanError(error) };
  Object.assign(current, asBlock(data as Record<string, unknown>));
  return { ok: true };
}

export async function setBlockStatus(id: string, status: BlockStatus): Promise<Result> {
  const gated = guard();
  if (!gated.ok) return gated;
  const current = state.blocks.find((b) => b.id === id);
  if (!current) return { ok: false, error: "予定が見つかりません" };
  if (state.mode === "demo") {
    current.status = status;
    current.updated_at = nowIso();
    persist();
    return { ok: true };
  }
  const { data, error } = await client()
    .from("schedule_blocks")
    .update({ status })
    .eq("id", id)
    .select("*")
    .single();
  if (error) return { ok: false, error: humanError(error) };
  Object.assign(current, asBlock(data as Record<string, unknown>));
  return { ok: true };
}

export async function deleteBlock(id: string): Promise<Result> {
  const gated = guard();
  if (!gated.ok) return gated;
  if (state.mode === "demo") {
    state.blocks = state.blocks.filter((b) => b.id !== id);
    persist();
    return { ok: true };
  }
  const { error } = await client().from("schedule_blocks").delete().eq("id", id);
  if (error) return { ok: false, error: humanError(error) };
  state.blocks = state.blocks.filter((b) => b.id !== id);
  return { ok: true };
}

export async function logMark(type: WakeSleepType, loggedAt: string): Promise<Result> {
  const gated = guard();
  if (!gated.ok) return gated;
  if (state.mode === "demo") {
    const at = nowIso();
    state.logs.push({
      id: crypto.randomUUID(),
      type,
      logged_at: loggedAt,
      notes: null,
      source: "app",
      created_by: "app",
      created_at: at,
      updated_at: at,
    });
    persist();
    return { ok: true };
  }
  const { data, error } = await client()
    .from("wake_sleep_logs")
    .insert({ type, logged_at: loggedAt, source: "app", created_by: "app" })
    .select("*")
    .single();
  if (error) return { ok: false, error: humanError(error) };
  state.logs.push(asLog(data as Record<string, unknown>));
  return { ok: true };
}

export async function deleteLog(id: string): Promise<Result> {
  const gated = guard();
  if (!gated.ok) return gated;
  if (state.mode === "demo") {
    state.logs = state.logs.filter((l) => l.id !== id);
    persist();
    return { ok: true };
  }
  const { error } = await client().from("wake_sleep_logs").delete().eq("id", id);
  if (error) return { ok: false, error: humanError(error) };
  state.logs = state.logs.filter((l) => l.id !== id);
  return { ok: true };
}

export async function createRequest(body: string): Promise<Result> {
  const gated = guard();
  if (!gated.ok) return gated;
  if (state.mode === "demo") {
    const at = nowIso();
    state.requests.unshift({
      id: crypto.randomUUID(),
      body,
      status: "open",
      bot_response: null,
      source: "app",
      created_by: "app",
      created_at: at,
      updated_at: at,
    });
    persist();
    return { ok: true };
  }
  const { data, error } = await client()
    .from("change_requests")
    .insert({ body, status: "open", source: "app", created_by: "app" })
    .select("*")
    .single();
  if (error) return { ok: false, error: humanError(error) };
  state.requests.unshift(asRequest(data as Record<string, unknown>));
  return { ok: true };
}

type WishInput = { title: string; category: string; notes: string | null };

export async function saveWish(id: string | null, input: WishInput): Promise<Result> {
  const gated = guard();
  if (!gated.ok) return gated;
  if (state.mode === "demo") {
    const at = nowIso();
    if (id) {
      const current = state.wishes.find((w) => w.id === id);
      if (!current) return { ok: false, error: "見つかりません" };
      Object.assign(current, input, { updated_at: at });
    } else {
      state.wishes.unshift({
        id: crypto.randomUUID(),
        ...input,
        done: false,
        source: "app",
        created_by: "app",
        created_at: at,
        updated_at: at,
      });
    }
    persist();
    return { ok: true };
  }
  if (id) {
    const { data, error } = await client().from("wishes").update(input).eq("id", id).select("*").single();
    if (error) return { ok: false, error: humanError(error) };
    const current = state.wishes.find((w) => w.id === id);
    if (current) Object.assign(current, asWish(data as Record<string, unknown>));
    return { ok: true };
  }
  const { data, error } = await client()
    .from("wishes")
    .insert({ ...input, done: false, source: "app", created_by: "app" })
    .select("*")
    .single();
  if (error) return { ok: false, error: humanError(error) };
  state.wishes.unshift(asWish(data as Record<string, unknown>));
  return { ok: true };
}

export async function setWishDone(id: string, done: boolean): Promise<Result> {
  const gated = guard();
  if (!gated.ok) return gated;
  const current = state.wishes.find((w) => w.id === id);
  if (!current) return { ok: false, error: "見つかりません" };
  if (state.mode === "demo") {
    current.done = done;
    current.updated_at = nowIso();
    persist();
    return { ok: true };
  }
  const { data, error } = await client().from("wishes").update({ done }).eq("id", id).select("*").single();
  if (error) return { ok: false, error: humanError(error) };
  Object.assign(current, asWish(data as Record<string, unknown>));
  return { ok: true };
}

export async function deleteWish(id: string): Promise<Result> {
  const gated = guard();
  if (!gated.ok) return gated;
  if (state.mode === "demo") {
    state.wishes = state.wishes.filter((w) => w.id !== id);
    persist();
    return { ok: true };
  }
  const { error } = await client().from("wishes").delete().eq("id", id);
  if (error) return { ok: false, error: humanError(error) };
  state.wishes = state.wishes.filter((w) => w.id !== id);
  return { ok: true };
}

type TodoInput = {
  title: string;
  rank: TodoRank;
  due_date: string | null;
  estimated_minutes: number | null;
  notes: string | null;
};

export async function saveTodo(id: string | null, input: TodoInput): Promise<Result> {
  const gated = guard();
  if (!gated.ok) return gated;
  if (state.mode === "demo") {
    const at = nowIso();
    if (id) {
      const current = state.todos.find((t) => t.id === id);
      if (!current) return { ok: false, error: "見つかりません" };
      Object.assign(current, input, { updated_at: at });
    } else {
      state.todos.unshift({
        id: crypto.randomUUID(),
        ...input,
        status: "open",
        source: "app",
        created_by: "app",
        created_at: at,
        updated_at: at,
      });
    }
    persist();
    return { ok: true };
  }
  if (id) {
    const { data, error } = await client().from("todos").update(input).eq("id", id).select("*").single();
    if (error) return { ok: false, error: humanError(error) };
    const current = state.todos.find((t) => t.id === id);
    if (current) Object.assign(current, asTodo(data as Record<string, unknown>));
    return { ok: true };
  }
  const { data, error } = await client()
    .from("todos")
    .insert({ ...input, status: "open", source: "app", created_by: "app" })
    .select("*")
    .single();
  if (error) return { ok: false, error: humanError(error) };
  state.todos.unshift(asTodo(data as Record<string, unknown>));
  return { ok: true };
}

export async function setTodoStatus(id: string, status: TodoStatus): Promise<Result> {
  const gated = guard();
  if (!gated.ok) return gated;
  const current = state.todos.find((t) => t.id === id);
  if (!current) return { ok: false, error: "見つかりません" };
  if (state.mode === "demo") {
    current.status = status;
    current.updated_at = nowIso();
    persist();
    return { ok: true };
  }
  const { data, error } = await client().from("todos").update({ status }).eq("id", id).select("*").single();
  if (error) return { ok: false, error: humanError(error) };
  Object.assign(current, asTodo(data as Record<string, unknown>));
  return { ok: true };
}

export async function deleteTodo(id: string): Promise<Result> {
  const gated = guard();
  if (!gated.ok) return gated;
  if (state.mode === "demo") {
    state.todos = state.todos.filter((t) => t.id !== id);
    persist();
    return { ok: true };
  }
  const { error } = await client().from("todos").delete().eq("id", id);
  if (error) return { ok: false, error: humanError(error) };
  state.todos = state.todos.filter((t) => t.id !== id);
  return { ok: true };
}

type TravelInput = { from_place: string; to_place: string; minutes: number; notes: string | null };

export async function saveTravel(id: string | null, input: TravelInput): Promise<Result> {
  const gated = guard();
  if (!gated.ok) return gated;
  const dup = state.travels.find(
    (t) => t.id !== id && t.from_place === input.from_place && t.to_place === input.to_place,
  );
  if (dup) return { ok: false, error: "同じ区間がすでにあります。そちらを編集してください" };
  if (state.mode === "demo") {
    const at = nowIso();
    if (id) {
      const current = state.travels.find((t) => t.id === id);
      if (!current) return { ok: false, error: "見つかりません" };
      Object.assign(current, input, { updated_at: at });
    } else {
      state.travels.push({
        id: crypto.randomUUID(),
        ...input,
        source: "app",
        created_by: "app",
        created_at: at,
        updated_at: at,
      });
    }
    persist();
    return { ok: true };
  }
  if (id) {
    const { data, error } = await client().from("travel_times").update(input).eq("id", id).select("*").single();
    if (error) return { ok: false, error: humanError(error) };
    const current = state.travels.find((t) => t.id === id);
    if (current) Object.assign(current, asTravel(data as Record<string, unknown>));
    return { ok: true };
  }
  const { data, error } = await client()
    .from("travel_times")
    .insert({ ...input, source: "app", created_by: "app" })
    .select("*")
    .single();
  if (error) return { ok: false, error: humanError(error) };
  state.travels.push(asTravel(data as Record<string, unknown>));
  return { ok: true };
}

export async function deleteTravel(id: string): Promise<Result> {
  const gated = guard();
  if (!gated.ok) return gated;
  if (state.mode === "demo") {
    state.travels = state.travels.filter((t) => t.id !== id);
    persist();
    return { ok: true };
  }
  const { error } = await client().from("travel_times").delete().eq("id", id);
  if (error) return { ok: false, error: humanError(error) };
  state.travels = state.travels.filter((t) => t.id !== id);
  return { ok: true };
}

export async function saveSettings(input: Omit<Settings, "created_at" | "updated_at" | "created_by">): Promise<Result> {
  const gated = guard();
  if (!gated.ok) return gated;
  if (state.mode === "demo") {
    const at = nowIso();
    state.settings = {
      ...input,
      created_by: state.settings?.created_by ?? "app",
      created_at: state.settings?.created_at ?? at,
      updated_at: at,
    };
    persist();
    return { ok: true };
  }
  const sb = client();
  const { data: userData, error: userError } = await sb.auth.getUser();
  if (userError || !userData.user) return { ok: false, error: "ログイン情報を確認できません" };
  const { data, error } = await sb
    .from("settings")
    .upsert({ owner_id: userData.user.id, ...input, created_by: "app" })
    .select("*")
    .single();
  if (error) return { ok: false, error: humanError(error) };
  state.settings = asSettings(data as Record<string, unknown>);
  return { ok: true };
}
