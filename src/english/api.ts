import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readConfig } from "../config";
import { clearEnglishDemo, loadEnglishDemo, saveEnglishDemo, seedEnglish } from "./demo";
import { emit, state } from "./state";
import type {
  Actor,
  Assignment,
  AssignmentStatus,
  EnglishBundle,
  Essay,
  EssayStatus,
  Expression,
  Question,
  QuestionStatus,
  Resource,
  ResourceKind,
  Result,
} from "./types";
import { isActor } from "./types";

const TABLES = [
  "eng_expressions",
  "eng_resources",
  "eng_questions",
  "eng_essays",
  "eng_assignments",
] as const;

let supabase: SupabaseClient | null = null;
let realtimeChannel: ReturnType<SupabaseClient["channel"]> | null = null;
let authReady = false;
let reloadTimer = 0;

function bundleFromState(): EnglishBundle {
  return {
    expressions: state.expressions,
    resources: state.resources,
    questions: state.questions,
    essays: state.essays,
    assignments: state.assignments,
  };
}

function applyBundle(bundle: EnglishBundle): void {
  state.expressions = bundle.expressions;
  state.resources = bundle.resources;
  state.questions = bundle.questions;
  state.essays = bundle.essays;
  state.assignments = bundle.assignments;
}

function persist(): void {
  if (state.mode === "demo") saveEnglishDemo(bundleFromState());
}

function nowIso(): string {
  return new Date().toISOString();
}

function humanError(err: unknown): string {
  const raw =
    err && typeof err === "object" && "message" in err ? String((err as { message: unknown }).message) : "";
  console.error(err);
  if (/eng_resources_url/i.test(raw)) return "URLは http:// または https:// で始めてください";
  if (/eng_expressions_term|eng_expressions_meaning/i.test(raw)) return "表現と意味を入力してください";
  if (/eng_expressions_tags/i.test(raw)) return "タグは16個までです";
  if (/eng_questions_question/i.test(raw)) return "質問を入力してください";
  if (/eng_essays_original/i.test(raw)) return "英文を入力してください";
  if (/eng_essays_corrected_pair|eng_questions_answer_pair|eng_assignments_flow/i.test(raw)) {
    return "状態の組み合わせが保存できません。必須の欄が揃っているか確認してください";
  }
  if (/JWT|session/i.test(raw)) return "ログインの期限が切れました。もう一度ログインしてください";
  if (/permission denied|row-level security|42501/i.test(raw)) {
    return "保存する権限がありません。ログインしているか確認してください";
  }
  if (/Failed to fetch|NetworkError|network/i.test(raw)) return "ネットワークに接続できません";
  if (/schema cache|does not exist|PGRST205|Could not find the table/i.test(raw)) {
    return "英語学習の表がまだありません。SupabaseのSQL Editorで english_schema.sql を一度実行してください";
  }
  return "保存できませんでした。少し待ってからもう一度試してください";
}

function authError(raw: string): string {
  if (/invalid login/i.test(raw)) return "メールアドレスまたはパスワードが違います";
  if (/email not confirmed/i.test(raw)) {
    return "メールが未確認です。Supabaseでユーザーを作るとき Auto Confirm をオンにしてください";
  }
  if (/user not found|signups not allowed|not authorized/i.test(raw)) {
    return "そのメールのユーザーがありません。LIFEMANAGERと同じユーザーで入ってください";
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

function actorOf(value: unknown, fallback: Actor = "app"): Actor {
  const text = String(value ?? "");
  return isActor(text) ? text : fallback;
}

function agentOf(value: unknown): Actor | null {
  if (value == null || value === "") return null;
  const text = String(value);
  if (text === "tutor" || text === "writer" || text === "researcher") return text;
  return null;
}

function tagsOf(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((tag) => String(tag)).filter((tag) => tag.length > 0);
}

function asExpression(row: Record<string, unknown>): Expression {
  return {
    id: String(row.id),
    term: String(row.term ?? ""),
    meaning: String(row.meaning ?? ""),
    example: row.example == null ? null : String(row.example),
    tags: tagsOf(row.tags),
    learned_on: String(row.learned_on ?? ""),
    created_by: actorOf(row.created_by),
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
  };
}

function asResource(row: Record<string, unknown>): Resource {
  const kind = row.kind === "article" || row.kind === "video" || row.kind === "other" ? row.kind : "other";
  return {
    id: String(row.id),
    url: String(row.url ?? ""),
    title: String(row.title ?? ""),
    kind,
    note: row.note == null ? null : String(row.note),
    recorded_on: String(row.recorded_on ?? ""),
    added_by: actorOf(row.added_by),
    created_by: actorOf(row.created_by),
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
  };
}

function asQuestion(row: Record<string, unknown>): Question {
  const status: QuestionStatus = row.status === "answered" ? "answered" : "open";
  return {
    id: String(row.id),
    question: String(row.question ?? ""),
    answer: row.answer == null ? null : String(row.answer),
    status,
    created_by: actorOf(row.created_by),
    answered_by: agentOf(row.answered_by),
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
  };
}

function asEssay(row: Record<string, unknown>): Essay {
  const status: EssayStatus = row.status === "corrected" ? "corrected" : "pending";
  return {
    id: String(row.id),
    title: String(row.title ?? ""),
    original_text: String(row.original_text ?? ""),
    corrected_text: row.corrected_text == null ? null : String(row.corrected_text),
    explanation: row.explanation == null ? null : String(row.explanation),
    status,
    created_by: actorOf(row.created_by),
    corrected_by: agentOf(row.corrected_by),
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
  };
}

function asAssignment(row: Record<string, unknown>): Assignment {
  const status: AssignmentStatus =
    row.status === "submitted" || row.status === "reviewed" ? row.status : "assigned";
  return {
    id: String(row.id),
    title: String(row.title ?? ""),
    instructions: String(row.instructions ?? ""),
    due_on: row.due_on == null ? null : String(row.due_on),
    answer: row.answer == null ? null : String(row.answer),
    feedback: row.feedback == null ? null : String(row.feedback),
    status,
    created_by: actorOf(row.created_by, "tutor"),
    reviewed_by: agentOf(row.reviewed_by),
    submitted_at: row.submitted_at == null ? null : String(row.submitted_at),
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
  };
}

async function loadLive(): Promise<Result> {
  const sb = client();
  const [expressions, resources, questions, essays, assignments] = await Promise.all([
    sb.from("eng_expressions").select("*").order("learned_on", { ascending: false }).limit(2000),
    sb.from("eng_resources").select("*").order("recorded_on", { ascending: false }).limit(2000),
    sb.from("eng_questions").select("*").order("created_at", { ascending: false }).limit(1000),
    sb.from("eng_essays").select("*").order("created_at", { ascending: false }).limit(500),
    sb.from("eng_assignments").select("*").order("created_at", { ascending: false }).limit(500),
  ]);
  const error = expressions.error || resources.error || questions.error || essays.error || assignments.error;
  if (error) return { ok: false, error: humanError(error) };
  state.expressions = ((expressions.data ?? []) as Record<string, unknown>[]).map(asExpression);
  state.resources = ((resources.data ?? []) as Record<string, unknown>[]).map(asResource);
  state.questions = ((questions.data ?? []) as Record<string, unknown>[]).map(asQuestion);
  state.essays = ((essays.data ?? []) as Record<string, unknown>[]).map(asEssay);
  state.assignments = ((assignments.data ?? []) as Record<string, unknown>[]).map(asAssignment);
  state.connected = true;
  state.loadError = null;
  return { ok: true };
}

function subscribeRealtime(): void {
  if (realtimeChannel) return;
  const sb = client();
  const channel = sb.channel("english-study");
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
    if (typing || state.dialog) {
      queueReload();
      return;
    }
    void reloadSilent();
  }, 280);
}

export async function reloadSilent(): Promise<void> {
  if (state.mode !== "live" || !state.email) return;
  const result = await loadLive();
  if (!result.ok) {
    state.connected = false;
    state.loadError = result.error;
  }
  emit();
}

function redirectTo(): string {
  return new URL("./", window.location.href).href;
}

function clearLiveData(): void {
  state.expressions = [];
  state.resources = [];
  state.questions = [];
  state.essays = [];
  state.assignments = [];
}

export async function boot(): Promise<void> {
  try {
    await bootInner();
  } catch (err) {
    console.error(err);
    state.booting = false;
    state.mode = "live";
    state.connected = false;
    state.loadError = "接続できませんでした。予定のアプリと同じ config.js を確認してください";
    emit();
  }
}

async function bootInner(): Promise<void> {
  const cfg = readConfig();
  if (!cfg.live) {
    applyBundle(loadEnglishDemo());
    state.mode = "demo";
    state.connected = true;
    state.booting = false;
    state.loadError = null;
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
      clearLiveData();
      emit();
      return;
    }
    if (event === "SIGNED_IN") {
      const email = session?.user.email ?? null;
      if (state.email === email && state.expressions.length + state.assignments.length > 0) return;
      state.email = email;
      void reloadSilent().then(() => subscribeRealtime());
    }
  });

  const { data } = await supabase.auth.getSession();
  authReady = true;
  state.email = data.session?.user.email ?? null;
  if (data.session) {
    const result = await loadLive();
    if (!result.ok) state.loadError = result.error;
    subscribeRealtime();
  }
  state.booting = false;
  emit();
}

export async function signInPassword(email: string, password: string): Promise<Result> {
  if (!supabase) return { ok: false, error: "Supabaseが未設定です" };
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { ok: false, error: authError(error.message) };
  state.email = email;
  state.authNotice = null;
  const loaded = await loadLive();
  if (!loaded.ok) {
    state.loadError = loaded.error;
    return loaded;
  }
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
  if (realtimeChannel && supabase) {
    await supabase.removeChannel(realtimeChannel);
    realtimeChannel = null;
  }
  await supabase?.auth.signOut();
  state.email = null;
  state.authNotice = null;
  clearLiveData();
}

export function resetEnglishDemo(): void {
  clearEnglishDemo();
  applyBundle(seedEnglish());
  saveEnglishDemo(bundleFromState());
}

export type ExpressionInput = {
  term: string;
  meaning: string;
  example: string | null;
  tags: string[];
  learned_on: string;
};

export async function saveExpression(id: string | null, input: ExpressionInput): Promise<Result> {
  const gated = guard();
  if (!gated.ok) return gated;
  if (state.mode === "demo") {
    const stamp = nowIso();
    if (id) {
      const current = state.expressions.find((row) => row.id === id);
      if (!current) return { ok: false, error: "表現が見つかりません" };
      Object.assign(current, input, { updated_at: stamp });
    } else {
      state.expressions.unshift({
        id: crypto.randomUUID(),
        ...input,
        created_by: "app",
        created_at: stamp,
        updated_at: stamp,
      });
    }
    persist();
    return { ok: true };
  }
  if (id) {
    const { data, error } = await client().from("eng_expressions").update(input).eq("id", id).select("*").single();
    if (error) return { ok: false, error: humanError(error) };
    const current = state.expressions.find((row) => row.id === id);
    if (current) Object.assign(current, asExpression(data as Record<string, unknown>));
    return { ok: true };
  }
  const { data, error } = await client()
    .from("eng_expressions")
    .insert({ ...input, created_by: "app" })
    .select("*")
    .single();
  if (error) return { ok: false, error: humanError(error) };
  state.expressions.unshift(asExpression(data as Record<string, unknown>));
  return { ok: true };
}

export type ResourceInput = {
  url: string;
  title: string;
  kind: ResourceKind;
  note: string | null;
  recorded_on: string;
};

export async function saveResource(id: string | null, input: ResourceInput): Promise<Result> {
  const gated = guard();
  if (!gated.ok) return gated;
  if (state.mode === "demo") {
    const stamp = nowIso();
    if (id) {
      const current = state.resources.find((row) => row.id === id);
      if (!current) return { ok: false, error: "教材が見つかりません" };
      Object.assign(current, input, { updated_at: stamp });
    } else {
      state.resources.unshift({
        id: crypto.randomUUID(),
        ...input,
        added_by: "app",
        created_by: "app",
        created_at: stamp,
        updated_at: stamp,
      });
    }
    persist();
    return { ok: true };
  }
  if (id) {
    const { data, error } = await client().from("eng_resources").update(input).eq("id", id).select("*").single();
    if (error) return { ok: false, error: humanError(error) };
    const current = state.resources.find((row) => row.id === id);
    if (current) Object.assign(current, asResource(data as Record<string, unknown>));
    return { ok: true };
  }
  const { data, error } = await client()
    .from("eng_resources")
    .insert({ ...input, added_by: "app", created_by: "app" })
    .select("*")
    .single();
  if (error) return { ok: false, error: humanError(error) };
  state.resources.unshift(asResource(data as Record<string, unknown>));
  return { ok: true };
}

export async function saveQuestion(id: string | null, question: string): Promise<Result> {
  const gated = guard();
  if (!gated.ok) return gated;
  if (id) {
    const current = state.questions.find((row) => row.id === id);
    if (!current) return { ok: false, error: "質問が見つかりません" };
    if (current.status !== "open") return { ok: false, error: "回答済みの質問は編集できません" };
  }
  if (state.mode === "demo") {
    const stamp = nowIso();
    if (id) {
      const current = state.questions.find((row) => row.id === id);
      if (!current) return { ok: false, error: "質問が見つかりません" };
      current.question = question;
      current.updated_at = stamp;
    } else {
      state.questions.unshift({
        id: crypto.randomUUID(),
        question,
        answer: null,
        status: "open",
        created_by: "app",
        answered_by: null,
        created_at: stamp,
        updated_at: stamp,
      });
    }
    persist();
    return { ok: true };
  }
  if (id) {
    const { data, error } = await client().from("eng_questions").update({ question }).eq("id", id).select("*").single();
    if (error) return { ok: false, error: humanError(error) };
    const current = state.questions.find((row) => row.id === id);
    if (current) Object.assign(current, asQuestion(data as Record<string, unknown>));
    return { ok: true };
  }
  const { data, error } = await client()
    .from("eng_questions")
    .insert({ question, status: "open", created_by: "app" })
    .select("*")
    .single();
  if (error) return { ok: false, error: humanError(error) };
  state.questions.unshift(asQuestion(data as Record<string, unknown>));
  return { ok: true };
}

export type EssayInput = { title: string; original_text: string };

export async function saveEssay(id: string | null, input: EssayInput): Promise<Result> {
  const gated = guard();
  if (!gated.ok) return gated;
  if (id) {
    const current = state.essays.find((row) => row.id === id);
    if (!current) return { ok: false, error: "作文が見つかりません" };
    if (current.status !== "pending") return { ok: false, error: "添削済みの作文は編集できません" };
  }
  if (state.mode === "demo") {
    const stamp = nowIso();
    if (id) {
      const current = state.essays.find((row) => row.id === id);
      if (!current) return { ok: false, error: "作文が見つかりません" };
      Object.assign(current, input, { updated_at: stamp });
    } else {
      state.essays.unshift({
        id: crypto.randomUUID(),
        ...input,
        corrected_text: null,
        explanation: null,
        status: "pending",
        created_by: "app",
        corrected_by: null,
        created_at: stamp,
        updated_at: stamp,
      });
    }
    persist();
    return { ok: true };
  }
  if (id) {
    const { data, error } = await client().from("eng_essays").update(input).eq("id", id).select("*").single();
    if (error) return { ok: false, error: humanError(error) };
    const current = state.essays.find((row) => row.id === id);
    if (current) Object.assign(current, asEssay(data as Record<string, unknown>));
    return { ok: true };
  }
  const { data, error } = await client()
    .from("eng_essays")
    .insert({ ...input, status: "pending", created_by: "app" })
    .select("*")
    .single();
  if (error) return { ok: false, error: humanError(error) };
  state.essays.unshift(asEssay(data as Record<string, unknown>));
  return { ok: true };
}

export async function submitAssignment(id: string, answer: string): Promise<Result> {
  const gated = guard();
  if (!gated.ok) return gated;
  const current = state.assignments.find((row) => row.id === id);
  if (!current) return { ok: false, error: "課題が見つかりません" };
  if (current.status === "reviewed") return { ok: false, error: "レビュー済みの課題は変更できません" };
  const submitted_at = current.submitted_at ?? nowIso();
  const next: Pick<Assignment, "answer" | "status" | "submitted_at"> = {
    answer,
    status: "submitted",
    submitted_at,
  };
  if (state.mode === "demo") {
    Object.assign(current, next, { updated_at: nowIso() });
    persist();
    return { ok: true };
  }
  const { data, error } = await client().from("eng_assignments").update(next).eq("id", id).select("*").single();
  if (error) return { ok: false, error: humanError(error) };
  Object.assign(current, asAssignment(data as Record<string, unknown>));
  return { ok: true };
}

export async function deleteEnglish(target: "expression" | "resource" | "question" | "essay" | "assignment", id: string): Promise<Result> {
  const gated = guard();
  if (!gated.ok) return gated;
  const table =
    target === "expression"
      ? "eng_expressions"
      : target === "resource"
        ? "eng_resources"
        : target === "question"
          ? "eng_questions"
          : target === "essay"
            ? "eng_essays"
            : "eng_assignments";
  if (state.mode === "demo") {
    if (target === "expression") state.expressions = state.expressions.filter((row) => row.id !== id);
    if (target === "resource") state.resources = state.resources.filter((row) => row.id !== id);
    if (target === "question") state.questions = state.questions.filter((row) => row.id !== id);
    if (target === "essay") state.essays = state.essays.filter((row) => row.id !== id);
    if (target === "assignment") state.assignments = state.assignments.filter((row) => row.id !== id);
    persist();
    return { ok: true };
  }
  const { error } = await client().from(table).delete().eq("id", id);
  if (error) return { ok: false, error: humanError(error) };
  if (target === "expression") state.expressions = state.expressions.filter((row) => row.id !== id);
  if (target === "resource") state.resources = state.resources.filter((row) => row.id !== id);
  if (target === "question") state.questions = state.questions.filter((row) => row.id !== id);
  if (target === "essay") state.essays = state.essays.filter((row) => row.id !== id);
  if (target === "assignment") state.assignments = state.assignments.filter((row) => row.id !== id);
  return { ok: true };
}
