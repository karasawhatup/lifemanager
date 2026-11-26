export class ToolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ToolError";
  }
}

export type Json = Record<string, unknown>;

export const CATEGORIES = [
  "prep",
  "class",
  "club",
  "travel",
  "meal",
  "bath",
  "laundry",
  "english",
  "moodle",
  "todo",
  "wish",
  "free",
  "buffer",
] as const;

export const WISH_CATEGORIES = ["restaurant", "karaoke", "game", "shopping", "outing", "other"] as const;

export const ACTORS = ["app", "tutor", "writer", "researcher"] as const;
export type Actor = (typeof ACTORS)[number];

const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g;

export function clean(value: string): string {
  return value.replace(CONTROL, "").trim();
}

export function tokyoDate(now = new Date()): string {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const out: Record<string, string> = {};
  for (const part of fmt.formatToParts(now)) {
    if (part.type !== "literal") out[part.type] = part.value;
  }
  return `${out.year}-${out.month}-${out.day}`;
}

export function addDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const utc = new Date(Date.UTC(y, (m ?? 1) - 1, (d ?? 1) + days));
  const year = utc.getUTCFullYear();
  const month = String(utc.getUTCMonth() + 1).padStart(2, "0");
  const day = String(utc.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function tokyoDayBounds(isoDate: string): { start: string; end: string } {
  return { start: `${isoDate}T00:00:00+09:00`, end: `${addDays(isoDate, 1)}T00:00:00+09:00` };
}

export function isoDate(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [y, m, d] = value.split("-").map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d));
  if (utc.getUTCFullYear() !== y || utc.getUTCMonth() !== m - 1 || utc.getUTCDate() !== d) return null;
  return value;
}

export function requireDate(args: Json, key: string): string {
  const value = args[key];
  if (typeof value !== "string" || !isoDate(value)) {
    throw new ToolError(`${key} は東京の日付 YYYY-MM-DD です / ${key} must be a Tokyo date YYYY-MM-DD`);
  }
  return value;
}

export function optionalDate(args: Json, key: string): string | undefined {
  if (!Object.prototype.hasOwnProperty.call(args, key) || args[key] == null) return undefined;
  return requireDate(args, key);
}

export function nullableDate(args: Json, key: string): string | null | undefined {
  if (!Object.prototype.hasOwnProperty.call(args, key)) return undefined;
  if (args[key] === null) return null;
  return requireDate(args, key);
}

export function clockToMinutes(value: string): number {
  const [h, m] = value.split(":");
  return Number(h) * 60 + Number(m);
}

export function readClock(value: unknown, allow24: boolean): string {
  if (typeof value !== "string") {
    throw new ToolError("時刻は 09:00 のように書いてください / Use a time like 09:00");
  }
  const matched = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(value.trim());
  if (!matched) throw new ToolError("時刻は 09:00 のように書いてください / Use a time like 09:00");
  const hour = Number(matched[1]);
  const minute = Number(matched[2]);
  const second = Number(matched[3] ?? "0");
  if (second !== 0 || minute % 10 !== 0) {
    throw new ToolError("時刻は10分単位です / Times must be on a 10-minute step");
  }
  if (hour === 24 && minute === 0 && allow24) return "24:00:00";
  if (hour < 0 || hour > 23) throw new ToolError("時刻が範囲外です / Time is out of range");
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`;
}

export function readText(args: Json, key: string, min: number, max: number): string {
  const value = args[key];
  if (typeof value !== "string") throw new ToolError(`${key} は文字列です / ${key} must be a string`);
  const text = clean(value);
  if (text.length < min || text.length > max) {
    throw new ToolError(`${key} は${min}〜${max}文字です / ${key} must be ${min}-${max} characters`);
  }
  return text;
}

export function optionalText(args: Json, key: string, max: number): string | null | undefined {
  if (!Object.prototype.hasOwnProperty.call(args, key)) return undefined;
  if (args[key] === null) return null;
  if (typeof args[key] !== "string") throw new ToolError(`${key} は文字列です / ${key} must be a string`);
  const text = clean(String(args[key]));
  if (text.length > max) throw new ToolError(`${key} は${max}文字までです / ${key} must be at most ${max} characters`);
  return text.length ? text : null;
}

export function readEnum<T extends string>(args: Json, key: string, allowed: readonly T[]): T {
  const value = args[key];
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new ToolError(`${key} は ${allowed.join(" / ")} のいずれかです / ${key} must be one of ${allowed.join(", ")}`);
  }
  return value as T;
}

export function optionalEnum<T extends string>(args: Json, key: string, allowed: readonly T[]): T | undefined {
  if (!Object.prototype.hasOwnProperty.call(args, key) || args[key] == null) return undefined;
  return readEnum(args, key, allowed);
}

export function readUuid(args: Json, key = "id"): string {
  const value = args[key];
  if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    throw new ToolError(`${key} は uuid です / ${key} must be a uuid`);
  }
  return value.toLowerCase();
}

export function readLimit(args: Json, fallback = 50, max = 100): number {
  if (!Object.prototype.hasOwnProperty.call(args, "limit")) return fallback;
  const value = args.limit;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > max) {
    throw new ToolError(`limit は 1 から ${max} の整数です / limit must be an integer from 1 to ${max}`);
  }
  return value;
}

export function requireConfirm(args: Json): void {
  if (args.confirm !== true) {
    throw new ToolError(
      "削除には confirm: true が必要です。本当に消すときだけ true にしてください / Set confirm to true to delete.",
    );
  }
}

export function readInt(args: Json, key: string, min: number, max: number): number {
  const value = args[key];
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) {
    throw new ToolError(`${key} は ${min} から ${max} の整数です / ${key} must be an integer from ${min} to ${max}`);
  }
  return value;
}

export function optionalInt(args: Json, key: string, min: number, max: number): number | null | undefined {
  if (!Object.prototype.hasOwnProperty.call(args, key)) return undefined;
  if (args[key] === null) return null;
  return readInt(args, key, min, max);
}

export function estimatedMinutes(value: number | null): number | null {
  if (value == null) return null;
  if (value < 10 || value > 600 || value % 10 !== 0) {
    throw new ToolError("所要時間は10分単位で、10から600までです / estimated_minutes must be a multiple of 10 from 10 to 600");
  }
  return value;
}

export function readTags(value: unknown): string[] {
  if (value == null) return [];
  if (!Array.isArray(value) || value.length > 16) {
    throw new ToolError("タグは16個までです / Up to 16 tags");
  }
  return value.map((tag) => {
    if (typeof tag !== "string") throw new ToolError("タグは文字列です / Tags must be strings");
    const text = clean(tag);
    if (text.length < 1 || text.length > 40) {
      throw new ToolError("タグは1〜40文字です / Each tag is 1-40 characters");
    }
    if (/[{},*]/.test(text)) throw new ToolError("タグに {} , * は使えません / Tags cannot contain braces, commas, or stars");
    return text;
  });
}

export function readUrl(value: unknown): string {
  if (typeof value !== "string") throw new ToolError("url は文字列です / url must be a string");
  const text = clean(value);
  if (text.length < 1 || text.length > 2000 || !/^https?:\/\//i.test(text)) {
    throw new ToolError("URL は http:// か https:// で始め、2000文字までです / URL must start with http:// or https://");
  }
  try {
    const url = new URL(text);
    if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("bad");
  } catch {
    throw new ToolError("URL の形が正しくありません / URL is not valid");
  }
  return text;
}

export function readTimestamp(value: unknown, now: Date): string {
  if (typeof value !== "string") {
    throw new ToolError("時刻は 2026-11-26T07:10:00+09:00 の形です / Use an ISO timestamp");
  }
  const matched = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?(Z|[+-]\d{2}:\d{2})?$/.exec(value.trim());
  if (!matched || !isoDate(matched[1])) {
    throw new ToolError("時刻は 2026-11-26T07:10:00+09:00 の形です / Use an ISO timestamp");
  }
  const hour = Number(matched[2]);
  const minute = Number(matched[3]);
  const second = Number(matched[4] ?? "0");
  if (hour > 23 || minute > 59 || second > 59) {
    throw new ToolError("時刻が範囲外です / Time is out of range");
  }
  const offset = matched[5] ?? "+09:00";
  const iso = `${matched[1]}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:${String(second).padStart(2, "0")}${offset}`;
  const parsed = Date.parse(iso);
  if (!Number.isFinite(parsed)) throw new ToolError("時刻を読めません / Could not read the timestamp");
  if (parsed > now.getTime() + 5 * 60 * 1000) {
    throw new ToolError("これからの時刻には記録できません / Future times are not allowed");
  }
  return new Date(parsed).toISOString();
}

export function optionalBool(args: Json, key: string): boolean | undefined {
  if (!Object.prototype.hasOwnProperty.call(args, key)) return undefined;
  if (typeof args[key] !== "boolean") throw new ToolError(`${key} は true か false です / ${key} must be true or false`);
  return args[key] as boolean;
}

export function humanDbError(err: unknown): string {
  const raw = err instanceof Error ? err.message : "";
  const known: [RegExp, string][] = [
    [/schedule_blocks_ten_min|schedule_blocks_order/i, "時刻は10分単位で、終了は開始より後です / Times must be 10-minute steps and end after start."],
    [/todos_minutes/i, "所要時間は10分単位（10〜600）です / estimated_minutes must be a multiple of 10 from 10 to 600."],
    [/travel_times_route|duplicate key/i, "同じ区間がすでにあります / That route already exists."],
    [/eng_resources_url/i, "URL は http:// か https:// で始めてください / URL must start with http:// or https://."],
    [/eng_questions_answer_pair/i, "回答は status・answer・answered_by を一度に書きます / Answer status, text, and answered_by together."],
    [/eng_essays_corrected_pair/i, "添削は status・corrected_text・explanation・corrected_by を一度に書きます / Save the correction fields together."],
    [/eng_assignments_flow/i, "課題の状態の組み合わせが保存できません / Assignment status fields do not match."],
    [/mcp token fields are immutable|revoked tokens stay revoked/i, "取り消したトークンは戻せません / A revoked token stays revoked."],
    [/schema cache|does not exist|PGRST205|Could not find the table/i, "表がまだありません。supabase の SQL を一度実行してください / A table is missing. Run the SQL once."],
    [/not configured/i, "サーバーのデータベース設定がありません / The server database is not configured."],
  ];
  for (const [pattern, message] of known) {
    if (pattern.test(raw)) return message;
  }
  return "保存できませんでした。入力を確認してもう一度試してください / Could not save. Check the input and try again.";
}

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
