import { eq, gte, lt } from "./db.ts";
import { deleteOwned, defined, getOwned, insertOwned, listOwned, listed, ok, updateOwned } from "./query.ts";
import {
  CATEGORIES,
  ToolError,
  WISH_CATEGORIES,
  clockToMinutes,
  estimatedMinutes,
  nullableDate,
  optionalBool,
  optionalDate,
  optionalEnum,
  optionalInt,
  optionalText,
  readClock,
  readEnum,
  readInt,
  readLimit,
  readText,
  readTimestamp,
  readUuid,
  requireConfirm,
  requireDate,
  tokyoDayBounds,
  type Json,
} from "./validate.ts";
import type { Tool } from "./tool.ts";

const MARK = "MCP が追加した行は source=app、created_by=mcp です。朝の組み直しでも、アプリで入れた予定と同じく残ります。 / Rows created here use source=app and created_by=mcp, so the morning planner keeps them.";

const confirm = {
  type: "boolean",
  const: true,
  description: "本当に削除するときだけ true / Must be true to delete",
};
const limitProp = { type: "integer", minimum: 1, maximum: 100, description: "最大件数。省略時は50 / Max rows, default 50" };
const idProp = { type: "string", format: "uuid", description: "対象の id / Row id" };
const dateProp = { type: "string", description: "東京の日付 YYYY-MM-DD / Tokyo calendar date" };
const notesProp = { type: "string", description: "メモ。空なら消すときは null / Notes. Pass null to clear" };

function schema(properties: Record<string, unknown>, required: string[]): Record<string, unknown> {
  return { type: "object", additionalProperties: false, properties, required };
}

function stampArgs(args: Json, now: Date): string {
  if (!Object.prototype.hasOwnProperty.call(args, "logged_at") || args.logged_at == null) return now.toISOString();
  return readTimestamp(args.logged_at, now);
}

export const lifeTools: Tool[] = [
  {
    name: "list_todos",
    description: "Todo を読む。rank の A が最も緊急。 / List todos. Rank A is the most urgent.",
    scope: "read",
    inputSchema: schema(
      {
        status: { type: "string", enum: ["open", "done"], description: "open か done / Filter by status" },
        rank: { type: "string", enum: ["A", "B", "C"], description: "A が最も緊急 / Rank filter" },
        due_date: dateProp,
        limit: limitProp,
      },
      [],
    ),
    async handle(args, ctx) {
      const filters = [];
      const status = optionalEnum(args, "status", ["open", "done"] as const);
      const rank = optionalEnum(args, "rank", ["A", "B", "C"] as const);
      const due = optionalDate(args, "due_date");
      if (status) filters.push(eq("status", status));
      if (rank) filters.push(eq("rank", rank));
      if (due) filters.push(eq("due_date", due));
      const limit = readLimit(args);
      const rows = await listOwned(ctx, "todos", filters, [{ column: "rank", ascending: true }, { column: "due_date", ascending: true }], limit);
      return listed(rows, limit);
    },
  },
  {
    name: "get_todo",
    description: "Todo を1件読む。 / Get one todo.",
    scope: "read",
    inputSchema: schema({ id: idProp }, ["id"]),
    async handle(args, ctx) {
      return ok(await getOwned(ctx, "todos", readUuid(args)));
    },
  },
  {
    name: "create_todo",
    description: `Todo を追加する。所要時間は10分単位。${MARK} / Create a todo. Estimated minutes are multiples of 10.`,
    scope: "write",
    inputSchema: schema(
      {
        title: { type: "string", description: "1〜500文字 / Title" },
        rank: { type: "string", enum: ["A", "B", "C"], description: "A が最も緊急 / Rank" },
        due_date: { ...dateProp, type: ["string", "null"] },
        estimated_minutes: { type: ["integer", "null"], description: "10〜600の10の倍数、または null / Minutes" },
        notes: notesProp,
      },
      ["title", "rank"],
    ),
    async handle(args, ctx) {
      const row = await insertOwned(ctx, "todos", {
        title: readText(args, "title", 1, 500),
        rank: readEnum(args, "rank", ["A", "B", "C"] as const),
        due_date: nullableDate(args, "due_date") ?? null,
        estimated_minutes: estimatedMinutes(optionalInt(args, "estimated_minutes", 10, 600) ?? null),
        notes: optionalText(args, "notes", 4000) ?? null,
        status: "open",
        source: "app",
        created_by: "mcp",
      });
      return ok(row);
    },
  },
  {
    name: "update_todo",
    description: "Todo を更新する。渡した項目だけ変わる。 / Update a todo. Only the fields you send change.",
    scope: "write",
    inputSchema: schema(
      {
        id: idProp,
        title: { type: "string" },
        rank: { type: "string", enum: ["A", "B", "C"] },
        due_date: { type: ["string", "null"] },
        estimated_minutes: { type: ["integer", "null"] },
        notes: { type: ["string", "null"] },
        status: { type: "string", enum: ["open", "done"] },
      },
      ["id"],
    ),
    async handle(args, ctx) {
      const minutes = optionalInt(args, "estimated_minutes", 10, 600);
      const row = await updateOwned(ctx, "todos", readUuid(args), defined({
        title: has(args, "title") ? readText(args, "title", 1, 500) : undefined,
        rank: optionalEnum(args, "rank", ["A", "B", "C"] as const),
        due_date: nullableDate(args, "due_date"),
        estimated_minutes: minutes === undefined ? undefined : estimatedMinutes(minutes),
        notes: optionalText(args, "notes", 4000),
        status: optionalEnum(args, "status", ["open", "done"] as const),
      }));
      return ok(row);
    },
  },
  {
    name: "complete_todo",
    description: "Todo を完了にする。 / Mark a todo done.",
    scope: "write",
    inputSchema: schema({ id: idProp }, ["id"]),
    async handle(args, ctx) {
      return ok(await updateOwned(ctx, "todos", readUuid(args), { status: "done" }));
    },
  },
  {
    name: "delete_todo",
    description: "Todo を削除する。confirm が true のときだけ消える。 / Delete a todo only when confirm is true.",
    scope: "write",
    inputSchema: schema({ id: idProp, confirm }, ["id", "confirm"]),
    async handle(args, ctx) {
      requireConfirm(args);
      return ok(await deleteOwned(ctx, "todos", readUuid(args)));
    },
  },
  {
    name: "list_schedule_blocks",
    description: "ある日の予定を、開始時刻の順に読む。日付は東京のカレンダー日。 / List schedule blocks for one Tokyo date, ordered by start time.",
    scope: "read",
    inputSchema: schema({ date: dateProp, limit: limitProp }, ["date"]),
    async handle(args, ctx) {
      const limit = readLimit(args);
      const rows = await listOwned(
        ctx,
        "schedule_blocks",
        [eq("date", requireDate(args, "date"))],
        [{ column: "start_time", ascending: true }],
        limit,
      );
      return listed(rows, limit);
    },
  },
  {
    name: "get_schedule_block",
    description: "予定を1件読む。 / Get one schedule block.",
    scope: "read",
    inputSchema: schema({ id: idProp }, ["id"]),
    async handle(args, ctx) {
      return ok(await getOwned(ctx, "schedule_blocks", readUuid(args)));
    },
  },
  {
    name: "create_schedule_block",
    description: `予定を追加する。開始と終了は10分単位。終了だけ 24:00 を使える。${MARK} / Create a schedule block. Times are 10-minute steps. Only the end may be 24:00.`,
    scope: "write",
    inputSchema: schema(
      {
        date: dateProp,
        start_time: { type: "string", description: "09:00 の形。10分単位 / Start, 10-minute step" },
        end_time: { type: "string", description: "開始より後。終わりだけ 24:00 可 / End after start" },
        title: { type: "string" },
        category: { type: "string", enum: [...CATEGORIES] },
        notes: notesProp,
        status: { type: "string", enum: ["planned", "done", "skipped"] },
      },
      ["date", "start_time", "end_time", "title", "category"],
    ),
    async handle(args, ctx) {
      const times = blockTimes(args);
      const row = await insertOwned(ctx, "schedule_blocks", {
        date: requireDate(args, "date"),
        ...times,
        title: readText(args, "title", 1, 500),
        category: readEnum(args, "category", CATEGORIES),
        notes: optionalText(args, "notes", 4000) ?? null,
        status: optionalEnum(args, "status", ["planned", "done", "skipped"] as const) ?? "planned",
        source: "app",
        created_by: "mcp",
      });
      return ok(row);
    },
  },
  {
    name: "update_schedule_block",
    description: "予定を更新する。時刻を変えるときは開始と終了を両方送る。 / Update a schedule block. Send both times when changing either.",
    scope: "write",
    inputSchema: schema(
      {
        id: idProp,
        date: dateProp,
        start_time: { type: "string" },
        end_time: { type: "string" },
        title: { type: "string" },
        category: { type: "string", enum: [...CATEGORIES] },
        notes: { type: ["string", "null"] },
        status: { type: "string", enum: ["planned", "done", "skipped"] },
      },
      ["id"],
    ),
    async handle(args, ctx) {
      const times = has(args, "start_time") || has(args, "end_time") ? blockTimes(args) : {};
      const row = await updateOwned(ctx, "schedule_blocks", readUuid(args), defined({
        date: optionalDate(args, "date"),
        ...times,
        title: has(args, "title") ? readText(args, "title", 1, 500) : undefined,
        category: optionalEnum(args, "category", CATEGORIES),
        notes: optionalText(args, "notes", 4000),
        status: optionalEnum(args, "status", ["planned", "done", "skipped"] as const),
      }));
      return ok(row);
    },
  },
  {
    name: "complete_schedule_block",
    description: "予定を完了にする。 / Mark a schedule block done.",
    scope: "write",
    inputSchema: schema({ id: idProp }, ["id"]),
    async handle(args, ctx) {
      return ok(await updateOwned(ctx, "schedule_blocks", readUuid(args), { status: "done" }));
    },
  },
  {
    name: "delete_schedule_block",
    description: "予定を1件削除する。confirm が true のときだけ消える。その日の予定をまとめては消さない。 / Delete one schedule block only when confirm is true.",
    scope: "write",
    inputSchema: schema({ id: idProp, confirm }, ["id", "confirm"]),
    async handle(args, ctx) {
      requireConfirm(args);
      return ok(await deleteOwned(ctx, "schedule_blocks", readUuid(args)));
    },
  },
  {
    name: "list_wishes",
    description: "小さなやりたいことを読む。 / List wishes.",
    scope: "read",
    inputSchema: schema(
      {
        done: { type: "boolean", description: "true は済ませたもの / Filter by done" },
        category: { type: "string", enum: [...WISH_CATEGORIES] },
        limit: limitProp,
      },
      [],
    ),
    async handle(args, ctx) {
      const filters = [];
      const done = optionalBool(args, "done");
      const category = optionalEnum(args, "category", WISH_CATEGORIES);
      if (done != null) filters.push(eq("done", String(done)));
      if (category) filters.push(eq("category", category));
      const limit = readLimit(args);
      const rows = await listOwned(ctx, "wishes", filters, [{ column: "created_at", ascending: false }], limit);
      return listed(rows, limit);
    },
  },
  {
    name: "get_wish",
    description: "やりたいことを1件読む。 / Get one wish.",
    scope: "read",
    inputSchema: schema({ id: idProp }, ["id"]),
    async handle(args, ctx) {
      return ok(await getOwned(ctx, "wishes", readUuid(args)));
    },
  },
  {
    name: "create_wish",
    description: `やりたいことを追加する。${MARK} / Create a wish.`,
    scope: "write",
    inputSchema: schema(
      {
        title: { type: "string" },
        category: { type: "string", enum: [...WISH_CATEGORIES] },
        notes: notesProp,
      },
      ["title"],
    ),
    async handle(args, ctx) {
      const row = await insertOwned(ctx, "wishes", {
        title: readText(args, "title", 1, 500),
        category: optionalEnum(args, "category", WISH_CATEGORIES) ?? "other",
        notes: optionalText(args, "notes", 4000) ?? null,
        done: false,
        source: "app",
        created_by: "mcp",
      });
      return ok(row);
    },
  },
  {
    name: "update_wish",
    description: "やりたいことを更新する。 / Update a wish.",
    scope: "write",
    inputSchema: schema(
      {
        id: idProp,
        title: { type: "string" },
        category: { type: "string", enum: [...WISH_CATEGORIES] },
        notes: { type: ["string", "null"] },
        done: { type: "boolean" },
      },
      ["id"],
    ),
    async handle(args, ctx) {
      const row = await updateOwned(ctx, "wishes", readUuid(args), defined({
        title: has(args, "title") ? readText(args, "title", 1, 500) : undefined,
        category: optionalEnum(args, "category", WISH_CATEGORIES),
        notes: optionalText(args, "notes", 4000),
        done: optionalBool(args, "done"),
      }));
      return ok(row);
    },
  },
  {
    name: "complete_wish",
    description: "やりたいことを済ませたことにする。 / Mark a wish done.",
    scope: "write",
    inputSchema: schema({ id: idProp }, ["id"]),
    async handle(args, ctx) {
      return ok(await updateOwned(ctx, "wishes", readUuid(args), { done: true }));
    },
  },
  {
    name: "delete_wish",
    description: "やりたいことを削除する。confirm が true のときだけ消える。 / Delete a wish only when confirm is true.",
    scope: "write",
    inputSchema: schema({ id: idProp, confirm }, ["id", "confirm"]),
    async handle(args, ctx) {
      requireConfirm(args);
      return ok(await deleteOwned(ctx, "wishes", readUuid(args)));
    },
  },
  {
    name: "list_wake_sleep",
    description: "起床と就寝の記録を新しい順に読む。date を付けるとその東京の日だけ。 / List wake and sleep logs, newest first. Pass date for one Tokyo day.",
    scope: "read",
    inputSchema: schema({ date: dateProp, limit: limitProp }, []),
    async handle(args, ctx) {
      const filters = [];
      const date = optionalDate(args, "date");
      if (date) {
        const bounds = tokyoDayBounds(date);
        filters.push(gte("logged_at", bounds.start), lt("logged_at", bounds.end));
      }
      const limit = readLimit(args);
      const rows = await listOwned(ctx, "wake_sleep_logs", filters, [{ column: "logged_at", ascending: false }], limit);
      return listed(rows, limit);
    },
  },
  {
    name: "get_wake_sleep",
    description: "起床または就寝の記録を1件読む。 / Get one wake or sleep log.",
    scope: "read",
    inputSchema: schema({ id: idProp }, ["id"]),
    async handle(args, ctx) {
      return ok(await getOwned(ctx, "wake_sleep_logs", readUuid(args)));
    },
  },
  {
    name: "log_wake_sleep",
    description: `起床または就寝を記録する。logged_at を省略すると今。タイムゾーンが無ければ東京。未来は記録できない。${MARK} / Log wake or sleep. Omit logged_at for now. A missing offset means Tokyo. Future times are rejected.`,
    scope: "write",
    inputSchema: schema(
      {
        type: { type: "string", enum: ["wake", "sleep"] },
        logged_at: { type: "string", description: "2026-11-26T07:10:00+09:00 / Timestamp" },
        notes: notesProp,
      },
      ["type"],
    ),
    async handle(args, ctx) {
      const row = await insertOwned(ctx, "wake_sleep_logs", {
        type: readEnum(args, "type", ["wake", "sleep"] as const),
        logged_at: stampArgs(args, ctx.now),
        notes: optionalText(args, "notes", 2000) ?? null,
        source: "app",
        created_by: "mcp",
      });
      return ok(row);
    },
  },
  {
    name: "update_wake_sleep",
    description: "起床または就寝の記録を更新する。 / Update a wake or sleep log.",
    scope: "write",
    inputSchema: schema(
      {
        id: idProp,
        type: { type: "string", enum: ["wake", "sleep"] },
        logged_at: { type: "string" },
        notes: { type: ["string", "null"] },
      },
      ["id"],
    ),
    async handle(args, ctx) {
      const row = await updateOwned(ctx, "wake_sleep_logs", readUuid(args), defined({
        type: optionalEnum(args, "type", ["wake", "sleep"] as const),
        logged_at: has(args, "logged_at") ? readTimestamp(args.logged_at, ctx.now) : undefined,
        notes: optionalText(args, "notes", 2000),
      }));
      return ok(row);
    },
  },
  {
    name: "delete_wake_sleep",
    description: "起床または就寝の記録を削除する。confirm が true のときだけ消える。 / Delete a wake or sleep log only when confirm is true.",
    scope: "write",
    inputSchema: schema({ id: idProp, confirm }, ["id", "confirm"]),
    async handle(args, ctx) {
      requireConfirm(args);
      return ok(await deleteOwned(ctx, "wake_sleep_logs", readUuid(args)));
    },
  },
  {
    name: "list_change_requests",
    description: "予定変更の要望を読む。省略すると未対応（open）だけ。返事は reply_change_request。 / List change requests. Defaults to open. Reply with reply_change_request.",
    scope: "read",
    inputSchema: schema(
      {
        status: { type: "string", enum: ["open", "handled", "all"] },
        limit: limitProp,
      },
      [],
    ),
    async handle(args, ctx) {
      const status = optionalEnum(args, "status", ["open", "handled", "all"] as const) ?? "open";
      const filters = status === "all" ? [] : [eq("status", status)];
      const limit = readLimit(args);
      const rows = await listOwned(ctx, "change_requests", filters, [{ column: "created_at", ascending: true }], limit);
      return listed(rows, limit);
    },
  },
  {
    name: "get_change_request",
    description: "変更要望を1件読む。 / Get one change request.",
    scope: "read",
    inputSchema: schema({ id: idProp }, ["id"]),
    async handle(args, ctx) {
      return ok(await getOwned(ctx, "change_requests", readUuid(args)));
    },
  },
  {
    name: "reply_change_request",
    description: "未対応の変更要望に返事を書き、status を handled にする。対応済みには上書きしない。 / Reply to an open change request and mark it handled. Does not overwrite a handled request.",
    scope: "write",
    inputSchema: schema(
      {
        id: idProp,
        response: { type: "string", description: "本人に見せる返事。1〜4000文字 / Reply shown to the owner" },
      },
      ["id", "response"],
    ),
    async handle(args, ctx) {
      const id = readUuid(args);
      const current = await getOwned(ctx, "change_requests", id);
      if (current.status === "handled") throw new ToolError("すでに対応済みです / Already handled");
      const row = await updateOwned(ctx, "change_requests", id, {
        status: "handled",
        bot_response: readText(args, "response", 1, 4000),
      });
      return ok(row);
    },
  },
  {
    name: "list_travel_times",
    description: "場所から場所への移動分数を読む。 / List travel times.",
    scope: "read",
    inputSchema: schema({ limit: limitProp }, []),
    async handle(args, ctx) {
      const limit = readLimit(args);
      const rows = await listOwned(
        ctx,
        "travel_times",
        [],
        [{ column: "from_place", ascending: true }, { column: "to_place", ascending: true }],
        limit,
      );
      return listed(rows, limit);
    },
  },
  {
    name: "get_travel_time",
    description: "移動時間を1件読む。 / Get one travel time.",
    scope: "read",
    inputSchema: schema({ id: idProp }, ["id"]),
    async handle(args, ctx) {
      return ok(await getOwned(ctx, "travel_times", readUuid(args)));
    },
  },
  {
    name: "create_travel_time",
    description: `移動時間を追加する。同じ区間があるときは update_travel_time を使う。${MARK} / Create a travel time. If the route exists, update it instead.`,
    scope: "write",
    inputSchema: schema(
      {
        from_place: { type: "string", description: "出発。1〜80文字 / Origin" },
        to_place: { type: "string", description: "到着。出発と同じは不可 / Destination" },
        minutes: { type: "integer", minimum: 1, maximum: 1440 },
        notes: notesProp,
      },
      ["from_place", "to_place", "minutes"],
    ),
    async handle(args, ctx) {
      const places = travelPlaces(args);
      try {
        const row = await insertOwned(ctx, "travel_times", {
          ...places,
          minutes: readInt(args, "minutes", 1, 1440),
          notes: optionalText(args, "notes", 2000) ?? null,
          source: "app",
          created_by: "mcp",
        });
        return ok(row);
      } catch (err) {
        const message = err instanceof Error ? err.message : "";
        if (/travel_times_route|duplicate key/i.test(message)) {
          throw new ToolError("同じ区間がすでにあります。update_travel_time を使ってください / That route already exists. Use update_travel_time.");
        }
        throw err;
      }
    },
  },
  {
    name: "update_travel_time",
    description: "移動時間を更新する。 / Update a travel time.",
    scope: "write",
    inputSchema: schema(
      {
        id: idProp,
        from_place: { type: "string" },
        to_place: { type: "string" },
        minutes: { type: "integer", minimum: 1, maximum: 1440 },
        notes: { type: ["string", "null"] },
      },
      ["id"],
    ),
    async handle(args, ctx) {
      const from = has(args, "from_place") ? readText(args, "from_place", 1, 80) : undefined;
      const to = has(args, "to_place") ? readText(args, "to_place", 1, 80) : undefined;
      if (from != null && to != null && from === to) {
        throw new ToolError("出発と到着が同じです / Origin and destination are the same");
      }
      const row = await updateOwned(ctx, "travel_times", readUuid(args), defined({
        from_place: from,
        to_place: to,
        minutes: has(args, "minutes") ? readInt(args, "minutes", 1, 1440) : undefined,
        notes: optionalText(args, "notes", 2000),
      }));
      return ok(row);
    },
  },
  {
    name: "delete_travel_time",
    description: "移動時間を削除する。confirm が true のときだけ消える。 / Delete a travel time only when confirm is true.",
    scope: "write",
    inputSchema: schema({ id: idProp, confirm }, ["id", "confirm"]),
    async handle(args, ctx) {
      requireConfirm(args);
      return ok(await deleteOwned(ctx, "travel_times", readUuid(args)));
    },
  },
  {
    name: "get_settings",
    description: "ボットが予定を組むときに読む設定を見る。このツールでは変更できない。タイムゾーンは Asia/Tokyo。 / Read scheduling settings. This tool does not change them. Timezone is Asia/Tokyo.",
    scope: "read",
    inputSchema: schema({}, []),
    async handle(_args, ctx) {
      const rows = await listOwned(ctx, "settings", [], [], 1);
      return ok({ settings: rows[0] ?? null, timezone: "Asia/Tokyo" });
    },
  },
];

function has(args: Json, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(args, key);
}

function blockTimes(args: Json): { start_time: string; end_time: string } {
  const start = readClock(args.start_time, false);
  const end = readClock(args.end_time, true);
  if (clockToMinutes(end) <= clockToMinutes(start)) {
    throw new ToolError("終了は開始より後にしてください / End must be after start");
  }
  return { start_time: start, end_time: end };
}

function travelPlaces(args: Json): { from_place: string; to_place: string } {
  const from = readText(args, "from_place", 1, 80);
  const to = readText(args, "to_place", 1, 80);
  if (from === to) throw new ToolError("出発と到着が同じです / Origin and destination are the same");
  return { from_place: from, to_place: to };
}
