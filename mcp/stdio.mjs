import fs from "node:fs";
import readline from "node:readline";
import { runStdio } from "../supabase/functions/_shared/mcp/stdio.ts";

const file = new URL("../.env.mcp", import.meta.url);
if (fs.existsSync(file)) {
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index < 1) continue;
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] == null || process.env[key] === "") process.env[key] = value;
  }
}

const lines = readline.createInterface({ input: process.stdin, crlfDelay: Infinity, terminal: false });
await runStdio({
  lines,
  write: (chunk) => {
    process.stdout.write(chunk);
  },
  error: (chunk) => {
    process.stderr.write(chunk);
  },
  env: {
    supabaseUrl: process.env.SUPABASE_URL,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    accessToken: process.env.LIFEMANAGER_MCP_TOKEN,
  },
});
