export type DiffPart = { kind: "same" | "del" | "ins"; text: string };

const MAX_CELLS = 800_000;

function lcs(a: string[], b: string[]): DiffPart[] {
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    const row = dp[i];
    const next = dp[i + 1];
    for (let j = m - 1; j >= 0; j--) {
      row[j] = a[i] === b[j] ? next[j + 1] + 1 : Math.max(next[j], row[j + 1]);
    }
  }
  const out: DiffPart[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ kind: "same", text: a[i] });
      i += 1;
      j += 1;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push({ kind: "del", text: a[i] });
      i += 1;
    } else {
      out.push({ kind: "ins", text: b[j] });
      j += 1;
    }
  }
  while (i < n) {
    out.push({ kind: "del", text: a[i] });
    i += 1;
  }
  while (j < m) {
    out.push({ kind: "ins", text: b[j] });
    j += 1;
  }
  return out;
}

function merge(parts: DiffPart[]): DiffPart[] {
  const merged: DiffPart[] = [];
  for (const part of parts) {
    const last = merged[merged.length - 1];
    if (last && last.kind === part.kind) last.text += part.text;
    else merged.push({ ...part });
  }
  return merged;
}

function tokens(text: string): string[] {
  return text.split(/(\s+|[.,!?;:()"'“”「」])/).filter((part) => part.length > 0);
}

/** 単語単位の差分。長い文章は行単位に落とす。 */
export function diffText(before: string, after: string): DiffPart[] {
  const wordsA = tokens(before);
  const wordsB = tokens(after);
  if (wordsA.length * wordsB.length > MAX_CELLS) {
    return merge(lcs(before.split(/(\n)/), after.split(/(\n)/)));
  }
  return merge(lcs(wordsA, wordsB));
}
