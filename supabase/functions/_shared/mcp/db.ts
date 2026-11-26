export type Filter = { column: string; op: "eq" | "gte" | "lt" | "is" | "cs"; value: string };

export type Order = { column: string; ascending: boolean };

export type SelectOpts = {
  filters?: Filter[];
  orIlike?: { columns: string[]; query: string };
  order?: Order[];
  limit?: number;
  columns?: string;
};

export type Row = Record<string, unknown>;

export type Store = {
  select(table: string, opts?: SelectOpts): Promise<Row[]>;
  insert(table: string, row: Row): Promise<Row>;
  update(table: string, filters: Filter[], patch: Row): Promise<Row[]>;
  remove(table: string, filters: Filter[]): Promise<Row[]>;
};

export function eq(column: string, value: string): Filter {
  return { column, op: "eq", value };
}

export function gte(column: string, value: string): Filter {
  return { column, op: "gte", value };
}

export function lt(column: string, value: string): Filter {
  return { column, op: "lt", value };
}

export function isNull(column: string): Filter {
  return { column, op: "is", value: "null" };
}

export function contains(column: string, value: string): Filter {
  return { column, op: "cs", value: `{${value}}` };
}

const TABLES = new Set([
  "schedule_blocks",
  "todos",
  "wishes",
  "wake_sleep_logs",
  "change_requests",
  "travel_times",
  "settings",
  "eng_expressions",
  "eng_resources",
  "eng_questions",
  "eng_essays",
  "eng_assignments",
  "eng_speaking_sessions",
  "eng_pronunciation_attempts",
  "mcp_access_tokens",
  "mcp_oauth_clients",
  "mcp_oauth_codes",
  "mcp_oauth_refresh",
]);

export type Env = {
  supabaseUrl: string;
  serviceRoleKey: string;
  anonKey: string;
};

function ident(value: string, label: string): string {
  if (!/^[a-z_]+$/.test(value)) throw new Error(`bad ${label}`);
  return value;
}

function encodeFilter(filter: Filter): string {
  const column = ident(filter.column, "column");
  if (filter.op === "is") {
    if (filter.value !== "null") throw new Error("bad is");
    return `${column}=is.null`;
  }
  if (filter.op !== "eq" && filter.op !== "gte" && filter.op !== "lt" && filter.op !== "cs") {
    throw new Error("bad op");
  }
  return `${column}=${filter.op}.${encodeURIComponent(filter.value)}`;
}

function orIlike(spec: { columns: string[]; query: string }): string | null {
  const query = spec.query.replace(/[*,.()\\%_,]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
  if (!query) return null;
  const parts = spec.columns.map((column) => `${ident(column, "column")}.ilike.*${encodeURIComponent(query)}*`);
  return `or=(${parts.join(",")})`;
}

function queryString(opts: SelectOpts | undefined, filters: Filter[]): string {
  const parts = filters.map(encodeFilter);
  const or = opts?.orIlike ? orIlike(opts.orIlike) : null;
  if (or) parts.push(or);
  if (opts?.order?.length) {
    parts.push(
      "order=" +
        opts.order
          .map((item) => `${ident(item.column, "order")}.${item.ascending ? "asc" : "desc"}`)
          .join(","),
    );
  }
  const limit = opts?.limit ?? 0;
  if (limit > 0) parts.push(`limit=${Math.min(500, Math.floor(limit))}`);
  if (opts?.columns) {
    if (!/^[a-z_,]+$/.test(opts.columns)) throw new Error("bad columns");
    parts.push(`select=${opts.columns}`);
  }
  return parts.join("&");
}

export function createRestStore(env: Env, fetchImpl: typeof fetch = fetch): Store {
  const base = env.supabaseUrl.replace(/\/$/, "");

  async function call(table: string, method: string, filters: Filter[], body: Row | null, opts?: SelectOpts): Promise<Row[]> {
    if (!TABLES.has(table)) throw new Error("bad table");
    if (!env.supabaseUrl || !env.serviceRoleKey) throw new Error("server database is not configured");
    const qs = queryString(opts, filters);
    const url = `${base}/rest/v1/${table}${qs ? `?${qs}` : ""}`;
    const headers: Record<string, string> = {
      apikey: env.serviceRoleKey,
      Authorization: `Bearer ${env.serviceRoleKey}`,
      Accept: "application/json",
    };
    if (body) headers["Content-Type"] = "application/json";
    if (method !== "GET") headers.Prefer = "return=representation";
    const res = await fetchImpl(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15000),
    });
    const text = await res.text();
    if (!res.ok) {
      let message = "database error";
      try {
        const parsed = JSON.parse(text) as { message?: string };
        if (parsed.message) message = parsed.message.slice(0, 300);
      } catch {
        message = "database error";
      }
      throw new Error(message);
    }
    if (!text) return [];
    const parsed = JSON.parse(text) as unknown;
    if (Array.isArray(parsed)) return parsed as Row[];
    if (parsed && typeof parsed === "object") return [parsed as Row];
    return [];
  }

  return {
    select(table, opts) {
      return call(table, "GET", opts?.filters ?? [], null, opts);
    },
    async insert(table, row) {
      const rows = await call(table, "POST", [], row);
      if (rows.length !== 1) throw new Error("unexpected insert result");
      return rows[0];
    },
    update(table, filters, patch) {
      return call(table, "PATCH", filters, patch);
    },
    remove(table, filters) {
      return call(table, "DELETE", filters, null);
    },
  };
}

export function resourceUrl(env: Env): string {
  return `${env.supabaseUrl.replace(/\/$/, "")}/functions/v1/mcp`;
}
