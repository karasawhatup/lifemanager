import { eq, type Filter, type Order, type Row, type Store } from "./db.ts";
import { ToolError } from "./validate.ts";

export type Ctx = {
  db: Store;
  ownerId: string;
  now: Date;
};

const CLIP_KEYS = new Set([
  "original_text",
  "corrected_text",
  "explanation",
  "question",
  "answer",
  "instructions",
  "feedback",
  "note",
  "notes",
  "body",
  "bot_response",
  "meaning",
  "example",
  "recognized_text",
  "reference_text",
]);

export function ok(data: unknown): { text: string } {
  return { text: JSON.stringify(data, null, 2) };
}

export function clipRow(row: Row, max = 400): Row {
  const out: Row = {};
  let clipped = false;
  for (const [key, value] of Object.entries(row)) {
    if (typeof value === "string" && CLIP_KEYS.has(key) && value.length > max) {
      out[key] = `${value.slice(0, max)}…`;
      clipped = true;
    } else if (key === "transcript" || key === "words") {
      continue;
    } else {
      out[key] = value;
    }
  }
  if (clipped) out._clipped = true;
  return out;
}

export async function listOwned(
  ctx: Ctx,
  table: string,
  filters: Filter[],
  order: Order[],
  limit: number,
  extra?: { orIlike?: { columns: string[]; query: string } },
): Promise<Row[]> {
  return ctx.db.select(table, {
    filters: [eq("owner_id", ctx.ownerId), ...filters],
    order,
    limit,
    orIlike: extra?.orIlike,
  });
}

export function listed(rows: Row[], limit: number, map: (row: Row) => Row = (row) => row): { text: string } {
  const items = rows.map(map);
  const body: Record<string, unknown> = { items, count: items.length };
  if (items.length >= limit) {
    body.note = "件数の上限に達しました。条件を狭めるか limit を上げてください / Result hit the limit.";
  }
  return ok(body);
}

export async function getOwned(ctx: Ctx, table: string, id: string): Promise<Row> {
  const rows = await ctx.db.select(table, {
    filters: [eq("owner_id", ctx.ownerId), eq("id", id)],
    limit: 1,
  });
  if (rows.length === 0) throw new ToolError("見つかりません / Not found");
  return rows[0];
}

export async function insertOwned(ctx: Ctx, table: string, row: Row): Promise<Row> {
  return ctx.db.insert(table, { ...row, owner_id: ctx.ownerId });
}

export async function updateOwned(ctx: Ctx, table: string, id: string, patch: Row): Promise<Row> {
  if (Object.keys(patch).length === 0) {
    throw new ToolError("変更する項目がありません / Nothing to update");
  }
  const rows = await ctx.db.update(table, [eq("owner_id", ctx.ownerId), eq("id", id)], patch);
  if (rows.length === 0) throw new ToolError("見つかりません / Not found");
  return rows[0];
}

export async function deleteOwned(ctx: Ctx, table: string, id: string): Promise<Row> {
  const rows = await ctx.db.remove(table, [eq("owner_id", ctx.ownerId), eq("id", id)]);
  if (rows.length === 0) throw new ToolError("見つかりません / Not found");
  return rows[0];
}

export function defined(patch: Row): Row {
  const out: Row = {};
  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined) out[key] = value;
  }
  return out;
}
