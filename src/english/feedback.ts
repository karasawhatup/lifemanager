import type { SpeakingFeedback, SpeakingMistake, SpeakingPhrase } from "./types";

function text(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

function phrases(value: unknown): SpeakingPhrase[] {
  if (!Array.isArray(value)) return [];
  const out: SpeakingPhrase[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const term = text(row.term, 200);
    const meaning = text(row.meaning, 1000);
    if (!term || !meaning) continue;
    out.push({ term, meaning, example: text(row.example, 2000) });
    if (out.length >= 8) break;
  }
  return out;
}

function mistakes(value: unknown): SpeakingMistake[] {
  if (!Array.isArray(value)) return [];
  const out: SpeakingMistake[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const original = text(row.original, 300);
    const correction = text(row.correction, 300);
    if (!original || !correction) continue;
    out.push({ original, correction, note: text(row.note, 400) });
    if (out.length >= 8) break;
  }
  return out;
}

export function normalizeFeedback(value: unknown): SpeakingFeedback | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const good = Array.isArray(row.good_points) ? row.good_points.map((item) => text(item, 300)).filter(Boolean).slice(0, 6) : [];
  const feedback: SpeakingFeedback = {
    good_points: good,
    mistakes: mistakes(row.mistakes),
    expressions: phrases(row.expressions),
  };
  if (!feedback.good_points.length && !feedback.mistakes.length && !feedback.expressions.length) return null;
  return feedback;
}

export function parseFeedback(raw: string): SpeakingFeedback | null {
  const trimmed = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return normalizeFeedback(JSON.parse(trimmed.slice(start, end + 1)) as unknown);
  } catch {
    return null;
  }
}
