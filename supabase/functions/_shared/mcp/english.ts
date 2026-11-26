import { contains, eq, gte, lt } from "./db.ts";
import { clipRow, deleteOwned, getOwned, insertOwned, listOwned, listed, ok, updateOwned, type Ctx } from "./query.ts";
import type { Tool } from "./tool.ts";
import {
  ACTORS,
  ToolError,
  clockToMinutes,
  optionalDate,
  optionalEnum,
  optionalText,
  readLimit,
  readTags,
  readText,
  readUrl,
  readUuid,
  requireConfirm,
  requireDate,
  tokyoDate,
  tokyoDayBounds,
  type Json,
} from "./validate.ts";

const ROLES = "役割は app（本人）/ tutor（チューター）/ writer（ライター）/ researcher（リサーチャー）。 / Roles are app, tutor, writer, or researcher.";

const confirm = {
  type: "boolean",
  const: true,
  description: "本当に削除するときだけ true / Must be true to delete",
};
const idProp = { type: "string", format: "uuid", description: "対象の id / Row id" };
const dateProp = { type: "string", description: "東京の日付 YYYY-MM-DD。省略すると今日 / Tokyo date. Defaults to today" };
const limitProp = { type: "integer", minimum: 1, maximum: 50, description: "最大件数 / Max rows" };

function schema(properties: Record<string, unknown>, required: string[]): Record<string, unknown> {
  return { type: "object", additionalProperties: false, properties, required };
}

function actor(args: Json, key: string, allowed: readonly string[], fallback: string): string {
  if (!Object.prototype.hasOwnProperty.call(args, key) || args[key] == null) return fallback;
  const value = args[key];
  if (typeof value !== "string" || !allowed.includes(value)) {
    throw new ToolError(`${key} は ${allowed.join(" / ")} のいずれかです / ${key} must be one of ${allowed.join(", ")}`);
  }
  return value;
}

export const englishTools: Tool[] = [
  {
    name: "add_expression",
    description: `単語や表現を追加する。learned_on は東京の日付。${ROLES} / Add a vocabulary item or phrase.`,
    scope: "write",
    inputSchema: schema(
      {
        term: { type: "string", description: "表現。1〜200文字 / Term" },
        meaning: { type: "string", description: "意味。1〜1000文字 / Meaning" },
        example: { type: "string", description: "例文。無くてよい / Example" },
        tags: { type: "array", items: { type: "string" }, maxItems: 16, description: "16個まで / Up to 16 tags" },
        learned_on: dateProp,
        created_by: { type: "string", enum: [...ACTORS], description: "省略すると tutor / Defaults to tutor" },
      },
      ["term", "meaning"],
    ),
    async handle(args, ctx) {
      const row = await insertOwned(ctx, "eng_expressions", {
        term: readText(args, "term", 1, 200),
        meaning: readText(args, "meaning", 1, 1000),
        example: optionalText(args, "example", 2000) ?? null,
        tags: readTags(args.tags),
        learned_on: optionalDate(args, "learned_on") ?? tokyoDate(ctx.now),
        created_by: actor(args, "created_by", ACTORS, "tutor"),
      });
      return ok(row);
    },
  },
  {
    name: "search_expressions",
    description: "単語や表現を、表現・意味・例文から探す。一覧は長い文を切り詰める。全文は get_expression。 / Search vocabulary and phrases. Lists are clipped; get_expression returns the full row.",
    scope: "read",
    inputSchema: schema(
      {
        query: { type: "string", description: "空なら新しい順 / Empty lists the newest" },
        learned_on: dateProp,
        tag: { type: "string", description: "このタグを含むもの / Rows containing this tag" },
        limit: limitProp,
      },
      [],
    ),
    async handle(args, ctx) {
      const filters = [];
      const learned = optionalDate(args, "learned_on");
      if (learned) filters.push(eq("learned_on", learned));
      const tag = optionalText(args, "tag", 40);
      if (tag) filters.push(contains("tags", tag));
      const query = optionalText(args, "query", 80) ?? undefined;
      const limit = readLimit(args, 20, 50);
      const rows = await listOwned(
        ctx,
        "eng_expressions",
        filters,
        [{ column: "learned_on", ascending: false }, { column: "created_at", ascending: false }],
        limit,
        query ? { orIlike: { columns: ["term", "meaning", "example"], query } } : undefined,
      );
      return listed(rows, limit, clipRow);
    },
  },
  {
    name: "get_expression",
    description: "表現を1件、全文で読む。 / Get one expression in full.",
    scope: "read",
    inputSchema: schema({ id: idProp }, ["id"]),
    async handle(args, ctx) {
      return ok(await getOwned(ctx, "eng_expressions", readUuid(args)));
    },
  },
  {
    name: "delete_expression",
    description: "表現を削除する。confirm が true のときだけ消える。 / Delete an expression only when confirm is true.",
    scope: "write",
    inputSchema: schema({ id: idProp, confirm }, ["id", "confirm"]),
    async handle(args, ctx) {
      requireConfirm(args);
      return ok(await deleteOwned(ctx, "eng_expressions", readUuid(args)));
    },
  },
  {
    name: "log_study_resource",
    description: `教材の URL を記録する。kind は article（記事）/ video（動画）/ other。${ROLES} 省略すると researcher。 / Log a study URL. Defaults the role to researcher.`,
    scope: "write",
    inputSchema: schema(
      {
        url: { type: "string", description: "http:// か https:// / Study URL" },
        title: { type: "string" },
        kind: { type: "string", enum: ["article", "video", "other"], description: "article / video / other" },
        note: { type: "string", description: "メモ / Notes" },
        recorded_on: dateProp,
        added_by: { type: "string", enum: [...ACTORS], description: "省略すると researcher / Defaults to researcher" },
      },
      ["url", "title"],
    ),
    async handle(args, ctx) {
      const who = actor(args, "added_by", ACTORS, "researcher");
      const row = await insertOwned(ctx, "eng_resources", {
        url: readUrl(args.url),
        title: readText(args, "title", 1, 300),
        kind: optionalEnum(args, "kind", ["article", "video", "other"] as const) ?? "other",
        note: optionalText(args, "note", 2000) ?? null,
        recorded_on: optionalDate(args, "recorded_on") ?? tokyoDate(ctx.now),
        added_by: who,
        created_by: who,
      });
      return ok(row);
    },
  },
  {
    name: "list_study_resources",
    description: "記録した教材 URL を読む。長いメモは切り詰める。全文は get_study_resource。 / List study resources. Long notes are clipped.",
    scope: "read",
    inputSchema: schema(
      {
        query: { type: "string" },
        kind: { type: "string", enum: ["article", "video", "other"] },
        recorded_on: dateProp,
        limit: limitProp,
      },
      [],
    ),
    async handle(args, ctx) {
      const filters = [];
      const kind = optionalEnum(args, "kind", ["article", "video", "other"] as const);
      const recorded = optionalDate(args, "recorded_on");
      if (kind) filters.push(eq("kind", kind));
      if (recorded) filters.push(eq("recorded_on", recorded));
      const query = optionalText(args, "query", 80) ?? undefined;
      const limit = readLimit(args, 20, 50);
      const rows = await listOwned(
        ctx,
        "eng_resources",
        filters,
        [{ column: "recorded_on", ascending: false }, { column: "created_at", ascending: false }],
        limit,
        query ? { orIlike: { columns: ["title", "url", "note"], query } } : undefined,
      );
      return listed(rows, limit, clipRow);
    },
  },
  {
    name: "get_study_resource",
    description: "教材を1件、全文で読む。 / Get one study resource in full.",
    scope: "read",
    inputSchema: schema({ id: idProp }, ["id"]),
    async handle(args, ctx) {
      return ok(await getOwned(ctx, "eng_resources", readUuid(args)));
    },
  },
  {
    name: "delete_study_resource",
    description: "教材を削除する。confirm が true のときだけ消える。 / Delete a study resource only when confirm is true.",
    scope: "write",
    inputSchema: schema({ id: idProp, confirm }, ["id", "confirm"]),
    async handle(args, ctx) {
      requireConfirm(args);
      return ok(await deleteOwned(ctx, "eng_resources", readUuid(args)));
    },
  },
  {
    name: "log_grammar_question",
    description: `文法や表現の質問を未回答で記録する。答えは answer_grammar_question で、status と answer と answered_by を一度に書く。${ROLES} / Log an open grammar question. Answer it later in one update.`,
    scope: "write",
    inputSchema: schema(
      {
        question: { type: "string", description: "1〜4000文字 / Question" },
        created_by: { type: "string", enum: [...ACTORS], description: "省略すると app（本人） / Defaults to app" },
      },
      ["question"],
    ),
    async handle(args, ctx) {
      const row = await insertOwned(ctx, "eng_questions", {
        question: readText(args, "question", 1, 4000),
        status: "open",
        created_by: actor(args, "created_by", ACTORS, "app"),
      });
      return ok(row);
    },
  },
  {
    name: "list_grammar_questions",
    description: "文法の質問を読む。省略すると未回答。長い文は切り詰める。全文は get_grammar_question。 / List grammar questions. Defaults to open. Lists are clipped.",
    scope: "read",
    inputSchema: schema(
      {
        status: { type: "string", enum: ["open", "answered", "all"] },
        limit: limitProp,
      },
      [],
    ),
    async handle(args, ctx) {
      const status = optionalEnum(args, "status", ["open", "answered", "all"] as const) ?? "open";
      const filters = status === "all" ? [] : [eq("status", status)];
      const limit = readLimit(args, 20, 50);
      const rows = await listOwned(ctx, "eng_questions", filters, [{ column: "created_at", ascending: true }], limit);
      return listed(rows, limit, clipRow);
    },
  },
  {
    name: "get_grammar_question",
    description: "質問を1件、全文で読む。 / Get one grammar question in full.",
    scope: "read",
    inputSchema: schema({ id: idProp }, ["id"]),
    async handle(args, ctx) {
      return ok(await getOwned(ctx, "eng_questions", readUuid(args)));
    },
  },
  {
    name: "answer_grammar_question",
    description: "質問に答える。status・answer・answered_by を一度に保存する。片方だけではデータベースが受け付けない。 / Answer a question. Status, answer, and answered_by are saved together.",
    scope: "write",
    inputSchema: schema(
      {
        id: idProp,
        answer: { type: "string", description: "1〜8000文字 / Answer" },
        answered_by: { type: "string", enum: ["tutor", "writer", "researcher"], description: "省略すると tutor / Defaults to tutor" },
      },
      ["id", "answer"],
    ),
    async handle(args, ctx) {
      const row = await updateOwned(ctx, "eng_questions", readUuid(args), {
        status: "answered",
        answer: readText(args, "answer", 1, 8000),
        answered_by: actor(args, "answered_by", ["tutor", "writer", "researcher"], "tutor"),
      });
      return ok(row);
    },
  },
  {
    name: "submit_composition",
    description: `英作文を未添削で提出する。添削は correct_composition。${ROLES} 省略すると app。 / Submit an English composition for correction. Defaults the author to app.`,
    scope: "write",
    inputSchema: schema(
      {
        title: { type: "string", description: "無くてよい。200文字まで / Optional title" },
        original_text: { type: "string", description: "本人の英文。1〜8000文字 / The learner's English" },
        created_by: { type: "string", enum: [...ACTORS], description: "省略すると app / Defaults to app" },
      },
      ["original_text"],
    ),
    async handle(args, ctx) {
      const row = await insertOwned(ctx, "eng_essays", {
        title: optionalText(args, "title", 200) ?? "",
        original_text: readText(args, "original_text", 1, 8000),
        status: "pending",
        created_by: actor(args, "created_by", ACTORS, "app"),
      });
      return ok(row);
    },
  },
  {
    name: "list_compositions",
    description: "英作文を読む。省略すると未添削。一覧は冒頭だけ。全文は get_composition。 / List compositions. Defaults to pending. Lists are previews.",
    scope: "read",
    inputSchema: schema(
      {
        status: { type: "string", enum: ["pending", "corrected", "all"] },
        limit: limitProp,
      },
      [],
    ),
    async handle(args, ctx) {
      const status = optionalEnum(args, "status", ["pending", "corrected", "all"] as const) ?? "pending";
      const filters = status === "all" ? [] : [eq("status", status)];
      const limit = readLimit(args, 10, 20);
      const rows = await listOwned(ctx, "eng_essays", filters, [{ column: "created_at", ascending: true }], limit);
      return listed(rows, limit, clipRow);
    },
  },
  {
    name: "get_composition",
    description: "英作文を1件、全文で読む。添削する前にこれを読む。 / Get one composition in full before correcting it.",
    scope: "read",
    inputSchema: schema({ id: idProp }, ["id"]),
    async handle(args, ctx) {
      return ok(await getOwned(ctx, "eng_essays", readUuid(args)));
    },
  },
  {
    name: "correct_composition",
    description: "英作文を添削する。status・corrected_text・explanation・corrected_by を一度に保存する。説明は日本語。corrected_by は writer か tutor。 / Save a correction in one update. The explanation is Japanese. corrected_by is writer or tutor.",
    scope: "write",
    inputSchema: schema(
      {
        id: idProp,
        corrected_text: { type: "string", description: "添削後の英文。1〜8000文字 / Corrected English" },
        explanation: { type: "string", description: "日本語の説明。1〜8000文字 / Japanese explanation" },
        corrected_by: { type: "string", enum: ["writer", "tutor"], description: "省略すると writer / Defaults to writer" },
      },
      ["id", "corrected_text", "explanation"],
    ),
    async handle(args, ctx) {
      const row = await updateOwned(ctx, "eng_essays", readUuid(args), {
        status: "corrected",
        corrected_text: readText(args, "corrected_text", 1, 8000),
        explanation: readText(args, "explanation", 1, 8000),
        corrected_by: actor(args, "corrected_by", ["writer", "tutor"], "writer"),
      });
      return ok(row);
    },
  },
  {
    name: "create_assignment",
    description: `課題を未提出で作る。答えとフィードバックは入れない。${ROLES} 省略すると tutor。 / Create an assignment that is not yet submitted. Defaults the author to tutor.`,
    scope: "write",
    inputSchema: schema(
      {
        title: { type: "string" },
        instructions: { type: "string", description: "指示。1〜8000文字 / Instructions" },
        due_on: { type: ["string", "null"], description: "東京の日付、または null / Tokyo due date or null" },
        created_by: { type: "string", enum: [...ACTORS], description: "省略すると tutor / Defaults to tutor" },
      },
      ["title", "instructions"],
    ),
    async handle(args, ctx) {
      const due = Object.prototype.hasOwnProperty.call(args, "due_on")
        ? args.due_on === null
          ? null
          : requireDate(args, "due_on")
        : null;
      const row = await insertOwned(ctx, "eng_assignments", {
        title: readText(args, "title", 1, 200),
        instructions: readText(args, "instructions", 1, 8000),
        due_on: due,
        status: "assigned",
        created_by: actor(args, "created_by", ACTORS, "tutor"),
      });
      return ok(row);
    },
  },
  {
    name: "list_assignments",
    description: "課題を読む。status は assigned（未提出）/ submitted / reviewed。一覧は指示の冒頭だけ。 / List assignments. Lists clip the instructions.",
    scope: "read",
    inputSchema: schema(
      {
        status: { type: "string", enum: ["assigned", "submitted", "reviewed", "all"] },
        limit: limitProp,
      },
      [],
    ),
    async handle(args, ctx) {
      const status = optionalEnum(args, "status", ["assigned", "submitted", "reviewed", "all"] as const) ?? "all";
      const filters = status === "all" ? [] : [eq("status", status)];
      const limit = readLimit(args, 20, 50);
      const rows = await listOwned(
        ctx,
        "eng_assignments",
        filters,
        [{ column: "due_on", ascending: true }, { column: "created_at", ascending: false }],
        limit,
      );
      return listed(rows, limit, clipRow);
    },
  },
  {
    name: "get_assignment",
    description: "課題を1件、全文で読む。 / Get one assignment in full.",
    scope: "read",
    inputSchema: schema({ id: idProp }, ["id"]),
    async handle(args, ctx) {
      return ok(await getOwned(ctx, "eng_assignments", readUuid(args)));
    },
  },
  {
    name: "submit_assignment",
    description: "未提出の課題に答えを出す。status を submitted にし、answer と submitted_at を一度に書く。 / Submit an answer for an assignment that is still assigned.",
    scope: "write",
    inputSchema: schema(
      {
        id: idProp,
        answer: { type: "string", description: "1〜8000文字 / Answer" },
      },
      ["id", "answer"],
    ),
    async handle(args, ctx) {
      const id = readUuid(args);
      const current = await getOwned(ctx, "eng_assignments", id);
      if (current.status !== "assigned") {
        throw new ToolError("未提出の課題だけ答えを出せます / Only an assigned task can be submitted");
      }
      const row = await updateOwned(ctx, "eng_assignments", id, {
        status: "submitted",
        answer: readText(args, "answer", 1, 8000),
        submitted_at: ctx.now.toISOString(),
      });
      return ok(row);
    },
  },
  {
    name: "review_assignment",
    description: "提出済みの課題にフィードバックを書く。status・feedback・reviewed_by を一度に保存する。答えと提出時刻は残す。 / Review a submitted assignment. Feedback and reviewed_by are saved together.",
    scope: "write",
    inputSchema: schema(
      {
        id: idProp,
        feedback: { type: "string", description: "1〜8000文字 / Feedback" },
        reviewed_by: {
          type: "string",
          enum: ["tutor", "writer", "researcher"],
          description: "省略すると tutor / Defaults to tutor",
        },
      },
      ["id", "feedback"],
    ),
    async handle(args, ctx) {
      const id = readUuid(args);
      const current = await getOwned(ctx, "eng_assignments", id);
      if (current.status !== "submitted") {
        throw new ToolError("提出済みの課題だけフィードバックできます / Only a submitted assignment can be reviewed");
      }
      const row = await updateOwned(ctx, "eng_assignments", id, {
        status: "reviewed",
        feedback: readText(args, "feedback", 1, 8000),
        reviewed_by: actor(args, "reviewed_by", ["tutor", "writer", "researcher"], "tutor"),
      });
      return ok(row);
    },
  },
  {
    name: "study_log_summary",
    description: "ある東京の日の学習まとめ。表現、教材、質問、作文、課題、予定の英語の分数、保存済みの会話と発音。会話の生成や発音採点はしない。 / Summarize one Tokyo study day, including saved speaking and pronunciation only.",
    scope: "read",
    inputSchema: schema({ date: dateProp }, []),
    async handle(args, ctx) {
      const date = optionalDate(args, "date") ?? tokyoDate(ctx.now);
      const bounds = tokyoDayBounds(date);
      const day = [gte("created_at", bounds.start), lt("created_at", bounds.end)];
      const [expressions, resources, opened, answered, essays, corrected, assignments, submitted, reviewed, blocks, settings, speaking, pronunciation] =
        await Promise.all([
          listOwned(ctx, "eng_expressions", [eq("learned_on", date)], [], 200),
          listOwned(ctx, "eng_resources", [eq("recorded_on", date)], [], 200),
          listOwned(ctx, "eng_questions", day, [], 200),
          listOwned(ctx, "eng_questions", [eq("status", "answered"), gte("updated_at", bounds.start), lt("updated_at", bounds.end)], [], 200),
          listOwned(ctx, "eng_essays", day, [], 200),
          listOwned(ctx, "eng_essays", [eq("status", "corrected"), gte("updated_at", bounds.start), lt("updated_at", bounds.end)], [], 200),
          listOwned(ctx, "eng_assignments", day, [], 200),
          listOwned(ctx, "eng_assignments", [gte("submitted_at", bounds.start), lt("submitted_at", bounds.end)], [], 200),
          listOwned(ctx, "eng_assignments", [eq("status", "reviewed"), gte("updated_at", bounds.start), lt("updated_at", bounds.end)], [], 200),
          listOwned(ctx, "schedule_blocks", [eq("date", date), eq("category", "english")], [], 100),
          listOwned(ctx, "settings", [], [], 1),
          optionalCount(ctx, "eng_speaking_sessions", [gte("started_at", bounds.start), lt("started_at", bounds.end)]),
          optionalCount(ctx, "eng_pronunciation_attempts", [eq("recorded_on", date)]),
        ]);
      const englishMinutes = blocks.reduce((sum, row) => sum + Math.max(0, clockToMinutes(String(row.end_time)) - clockToMinutes(String(row.start_time))), 0);
      const goal = settings[0] ? Number(settings[0].english_minutes_per_day ?? 0) : null;
      const speakingMinutes = speaking
        ? Math.round(speaking.reduce((sum, row) => sum + Number(row.duration_seconds ?? 0), 0) / 60)
        : null;
      const scores = (pronunciation ?? []).map((row) => Number(row.pronunciation)).filter((n) => Number.isFinite(n));
      return ok({
        date,
        timezone: "Asia/Tokyo",
        expressions: expressions.length,
        resources: resources.length,
        questions_opened: opened.length,
        questions_answered: answered.length,
        essays_submitted: essays.length,
        essays_corrected: corrected.length,
        assignments_created: assignments.length,
        assignments_submitted: submitted.length,
        assignments_reviewed: reviewed.length,
        english_schedule_minutes: englishMinutes,
        english_minutes_goal: goal,
        speaking_sessions: speaking ? speaking.length : null,
        speaking_minutes: speakingMinutes,
        pronunciation_attempts: pronunciation ? pronunciation.length : null,
        pronunciation_average: scores.length ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10 : null,
        note: "日付は Asia/Tokyo。会話と発音は保存済みの記録だけです。 / Dates are Asia/Tokyo. Speaking and pronunciation are saved results only.",
      });
    },
  },
  {
    name: "list_speaking_sessions",
    description: "保存済みの英会話を読む。会話の生成はしない。transcript は include_transcript が true のときだけ、直近40発言まで。 / Read saved speaking sessions. This does not start a conversation.",
    scope: "read",
    inputSchema: schema(
      {
        date: dateProp,
        limit: { type: "integer", minimum: 1, maximum: 20 },
        include_transcript: { type: "boolean", description: "true で文字起こしを含める / Include the transcript" },
      },
      [],
    ),
    async handle(args, ctx) {
      const filters = [];
      const date = optionalDate(args, "date");
      if (date) {
        const bounds = tokyoDayBounds(date);
        filters.push(gte("started_at", bounds.start), lt("started_at", bounds.end));
      }
      const limit = readLimit(args, 10, 20);
      const rows = await listOwned(ctx, "eng_speaking_sessions", filters, [{ column: "started_at", ascending: false }], limit);
      const full = args.include_transcript === true;
      return listed(rows, limit, (row) => projectSpeaking(row, full));
    },
  },
  {
    name: "get_speaking_session",
    description: "保存済みの英会話を1件読む。文字起こしとフィードバックを含む。会話の生成はしない。 / Get one saved speaking session, including transcript and feedback. Does not generate speech.",
    scope: "read",
    inputSchema: schema({ id: idProp }, ["id"]),
    async handle(args, ctx) {
      return ok(projectSpeaking(await getOwned(ctx, "eng_speaking_sessions", readUuid(args)), true));
    },
  },
  {
    name: "list_pronunciation_attempts",
    description: "保存済みの発音評価を読む。採点 API は呼ばない。単語と音素の詳細は get_pronunciation_attempt。 / Read saved pronunciation attempts. This does not score audio.",
    scope: "read",
    inputSchema: schema({ date: dateProp, limit: { type: "integer", minimum: 1, maximum: 30 } }, []),
    async handle(args, ctx) {
      const filters = [];
      const date = optionalDate(args, "date");
      if (date) filters.push(eq("recorded_on", date));
      const limit = readLimit(args, 20, 30);
      const rows = await listOwned(
        ctx,
        "eng_pronunciation_attempts",
        filters,
        [{ column: "recorded_on", ascending: false }, { column: "created_at", ascending: false }],
        limit,
      );
      return listed(rows, limit, (row) => projectPronunciation(row, false));
    },
  },
  {
    name: "get_pronunciation_attempt",
    description: "保存済みの発音評価を1件読む。単語と音素を含む。採点 API は呼ばない。 / Get one saved pronunciation attempt, including word and phoneme scores. Does not score audio.",
    scope: "read",
    inputSchema: schema({ id: idProp }, ["id"]),
    async handle(args, ctx) {
      return ok(projectPronunciation(await getOwned(ctx, "eng_pronunciation_attempts", readUuid(args)), true));
    },
  },
];

async function optionalCount(ctx: Ctx, table: string, filters: Parameters<typeof listOwned>[2]): Promise<Record<string, unknown>[] | null> {
  try {
    return await listOwned(ctx, table, filters, [], 100);
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    if (/schema cache|does not exist|PGRST205|Could not find the table/i.test(message)) return null;
    throw err;
  }
}

function projectSpeaking(row: Record<string, unknown>, full: boolean): Record<string, unknown> {
  const out = { ...row };
  if (!full) {
    delete out.transcript;
    return out;
  }
  if (Array.isArray(out.transcript) && out.transcript.length > 40) {
    out.transcript = out.transcript.slice(-40);
    out.transcript_truncated = true;
  }
  return out;
}

function projectPronunciation(row: Record<string, unknown>, full: boolean): Record<string, unknown> {
  const out = { ...row };
  if (!full) {
    delete out.words;
    if (typeof out.recognized_text === "string" && out.recognized_text.length > 300) {
      out.recognized_text = `${out.recognized_text.slice(0, 300)}…`;
      out._clipped = true;
    }
    return out;
  }
  if (Array.isArray(out.words) && out.words.length > 80) {
    out.words = out.words.slice(0, 80);
    out.words_truncated = true;
  }
  return out;
}
