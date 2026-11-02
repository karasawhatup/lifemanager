import { saveExpression } from "./api";
import {
  frequentProblems,
  isPreviewId,
  LEVELS,
  levelLabel,
  mmss,
  samplePronunciation,
  sampleSpeakingSession,
  SCENARIOS,
  scenarioLabel,
  scoreBand,
  scoreText,
  SPEAK_MINUTES,
  starterById,
  STARTER_SENTENCES,
  tipsForAttempt,
  errorLabel,
} from "./catalog";
import { cancelPronunciation, startPronunciation } from "./pronounce";
import { abortSpeaking, micSupported, speakingBusy, startSpeaking, stopSpeaking } from "./realtime";
import { emit, state } from "./state";
import { showToast } from "./toast";
import { formatStamp, shortMonthDay, tokyoDate } from "../time";
import type { PronunciationAttempt, SpeakingSession, TranscriptLine } from "./types";

function esc(value: string | null | undefined): string {
  return (value ?? "").replace(/[&<>"']/g, (ch) =>
    ch === "&" ? "&amp;" : ch === "<" ? "&lt;" : ch === ">" ? "&gt;" : ch === '"' ? "&quot;" : "&#39;",
  );
}

function busy(): boolean {
  return speakingBusy();
}

function byNewest<T extends { started_at?: string; created_at: string }>(rows: T[], key: "started_at" | "created_at"): T[] {
  return [...rows].sort((a, b) => {
    const left = key === "started_at" ? (a.started_at ?? a.created_at) : a.created_at;
    const right = key === "started_at" ? (b.started_at ?? b.created_at) : b.created_at;
    return left < right ? 1 : left > right ? -1 : 0;
  });
}

function sessions(): SpeakingSession[] {
  const rows = state.mode === "demo" || state.speakingSchema ? state.speakingSessions : [sampleSpeakingSession()];
  return byNewest(rows, "started_at");
}

function attempts(): PronunciationAttempt[] {
  const rows = state.mode === "demo" || state.speakingSchema ? state.pronunciationAttempts : samplePronunciation();
  return byNewest(rows, "created_at");
}

function chip(action: string, id: string, label: string, on: boolean, disabled: boolean): string {
  return `<button type="button" class="chip${on ? " on" : ""}" data-action="${action}" data-value="${esc(id)}" aria-pressed="${on ? "true" : "false"}"${disabled ? " disabled" : ""}>${esc(label)}</button>`;
}

export function speakingPage(): string {
  const locked = busy();
  const lines = state.speakLines;
  const showLive = locked || state.speakPhase === "error" || lines.length > 0;
  return `<section class="section">
    <h2>AIと話す</h2>
    <p class="supporting">声で英語を続けます。目立つ誤りは一度だけ直して、会話は止めません。終了後に、よかった点と覚える表現が残ります。</p>
    ${banners("speak")}
    <p class="field-label">場面</p>
    <div class="chips" role="toolbar">
      ${SCENARIOS.map((item) => chip("pick-scenario", item.id, item.label, state.speakScenario === item.id, locked)).join("")}
    </div>
    <label class="text-field">
      <textarea id="speak-topic" rows="2" maxlength="200" placeholder=" "${locked ? " disabled" : ""}>${esc(state.speakTopic)}</textarea>
      <span>話題（自分で決めるときは必須）</span>
    </label>
    <p class="field-label">レベル</p>
    <div class="chips" role="toolbar">
      ${LEVELS.map((item) => chip("pick-level", item.id, item.label, state.speakLevel === item.id, locked)).join("")}
    </div>
    <p class="field-label">上限</p>
    <div class="chips" role="toolbar">
      ${SPEAK_MINUTES.map((minutes) => chip("pick-minutes", String(minutes), `${minutes}分`, state.speakMaxMinutes === minutes, locked)).join("")}
    </div>
    <p class="hint">初期値は10分です。過ぎると自動で終わり、マイクも止まります。OpenAI の音声は使った分だけ課金されます。iPhone は Safari で開いてください。</p>
    ${locked ? "" : `<button type="button" class="btn filled" data-action="speak-start">${state.mode === "demo" ? "見本の会話を見る" : "会話を始める"}</button>`}
    ${showLive ? livePanel(lines, locked) : ""}
    ${state.speakShowSample && (state.mode === "demo" || state.speakingSchema) ? sessionCard(sampleSpeakingSession(), true) : ""}
    <h2 class="later">これまでの会話</h2>
    ${sessions().length ? sessions().map((row) => sessionCard(row, isPreviewId(row.id))).join("") : `<p class="supporting">まだ会話の記録はありません。</p>`}
  </section>`;
}

function banners(which: "speak" | "pron"): string {
  const parts: string[] = [];
  if (state.mode === "live" && !state.speakingSchema) {
    parts.push(
      `<p class="banner">会話と発音の表がまだありません。Supabase の SQL Editor で english_speaking_schema.sql を一度実行してください。下は結果の見本です。</p>`,
    );
  }
  if (which === "speak" && state.speakNotice) parts.push(`<p class="banner">${esc(state.speakNotice)}</p>`);
  if (which === "speak" && state.speakError) parts.push(`<p class="banner error">${esc(state.speakError)}</p>`);
  if (which === "pron" && state.pronError) parts.push(`<p class="banner error">${esc(state.pronError)}</p>`);
  if (which === "pron" && state.mode === "demo") {
    parts.push(`<p class="banner">デモモードです。マイクと Azure にはつながりません。ボタンを押すと、採点結果の見本が出ます。</p>`);
  }
  if (which === "speak" && state.mode === "live" && !micSupported()) {
    parts.push(`<p class="banner error">このブラウザはマイクか WebRTC に対応していません。iPhone は Safari で開いてください。</p>`);
  }
  return parts.join("");
}

function livePanel(lines: TranscriptLine[], locked: boolean): string {
  const empty = lines.length ? "" : `<p class="supporting">ここに、自分と AI の英語が出ます。</p>`;
  return `<article class="card live-card">
    <div class="meta-row">
      <span class="status wait" data-speak-status>${esc(state.speakStatus || (locked ? "接続しています" : ""))}</span>
      <span class="timer" data-speak-elapsed>${esc(mmss(state.speakElapsed))} / ${esc(mmss(state.speakMaxMinutes * 60))}</span>
    </div>
    <div class="transcript" aria-live="polite">
      ${empty}
      ${lines.map((line) => lineHtml(line, false, null)).join("")}
      <p class="line partial" data-speak-partial${state.speakPartial ? "" : " hidden"}>${esc(state.speakPartial)}</p>
    </div>
    ${locked ? `<div class="card-actions"><button type="button" class="btn filled" data-action="speak-stop"${state.speakPhase === "wrapping" ? " disabled" : ""}>${state.speakPhase === "wrapping" ? "まとめています" : "終了"}</button></div>` : `<p class="hint">自分の文の発音は、下の記録からチェックできます。会話の音声はそのまま採点せず、もう一度読みます。</p>`}
  </article>`;
}

function lineHtml(line: TranscriptLine, check: boolean, sessionId: string | null): string {
  const who = line.role === "user" ? "自分" : "AI";
  const button =
    check && line.role === "user"
      ? `<button type="button" class="btn text" data-action="check-line" data-session="${esc(sessionId ?? "")}" data-text="${esc(line.text)}">発音をチェック</button>`
      : "";
  return `<div class="line ${line.role}"><span class="who">${who}</span><p>${esc(line.text)}</p>${button}</div>`;
}

function sessionCard(row: SpeakingSession, preview: boolean): string {
  const open = state.speakOpenId === row.id || preview;
  const when = row.started_at ? formatStamp(row.started_at) : "";
  const duration = row.duration_seconds == null ? "" : mmss(row.duration_seconds);
  return `<article class="card" id="item-${esc(row.id)}">
    <h3>${esc(scenarioLabel(row.scenario))}${row.topic ? ` · ${esc(row.topic)}` : ""}</h3>
    <div class="meta-row">
      ${preview ? `<span class="status">見本</span>` : ""}
      <span class="status">${esc(levelLabel(row.level))}</span>
      <span class="status">${esc(when)}</span>
      ${duration ? `<span class="status">${esc(duration)} / ${esc(mmss(row.max_minutes * 60))}</span>` : ""}
    </div>
    <div class="card-actions">
      <button type="button" class="btn text" data-action="toggle-session" data-id="${esc(row.id)}">${open ? "閉じる" : "記録を見る"}</button>
      ${preview ? "" : `<button type="button" class="btn text error" data-action="open-delete" data-target="speaking" data-id="${esc(row.id)}" data-label="この会話">削除</button>`}
    </div>
    ${open ? sessionBody(row, preview) : ""}
  </article>`;
}

function sessionBody(row: SpeakingSession, preview: boolean): string {
  const feedback = row.feedback;
  return `<div class="transcript">
      ${row.transcript.map((line) => lineHtml(line, !speakingBusy(), preview ? null : row.id)).join("")}
    </div>
    ${
      feedback
        ? `<div class="explain">
            ${feedback.good_points.length ? `<h4>よかった点</h4><ul class="tips">${feedback.good_points.map((item) => `<li>${esc(item)}</li>`).join("")}</ul>` : ""}
            ${
              feedback.mistakes.length
                ? `<h4>誤り</h4>${feedback.mistakes
                    .map(
                      (item) => `<p class="prose"><del>${esc(item.original)}</del><br><ins>${esc(item.correction)}</ins></p>${item.note ? `<p class="supporting">${esc(item.note)}</p>` : ""}`,
                    )
                    .join("")}`
                : ""
            }
            ${
              feedback.expressions.length
                ? `<h4>覚える表現</h4>${feedback.expressions
                    .map((item, index) => phraseBlock(item.term, item.meaning, item.example, row.id, index, preview))
                    .join("")}`
                : ""
            }
          </div>`
        : `<p class="supporting">今回はフィードバックを作れませんでした。会話の記録は残しています。</p>`
    }`;
}

function phraseBlock(term: string, meaning: string, example: string, sessionId: string, index: number, preview: boolean): string {
  const saved = state.expressions.some((row) => row.term.trim().toLowerCase() === term.trim().toLowerCase());
  return `<div class="phrase">
    <p class="prose"><strong>${esc(term)}</strong><br>${esc(meaning)}</p>
    ${example ? `<p class="prose example">${esc(example)}</p>` : ""}
    <button type="button" class="btn tonal" data-action="save-phrase" data-from="${preview ? "preview" : "session"}" data-id="${esc(sessionId)}" data-index="${index}"${saved ? " disabled" : ""}>${saved ? "追加済み" : "表現メモに追加"}</button>
  </div>`;
}

export function pronunciationPage(): string {
  const rows = attempts();
  const latest = rows.find((row) => row.id === state.pronLatestId) ?? rows[0] ?? null;
  const rest = latest ? rows.filter((row) => row.id !== latest.id) : [];
  const recording = state.pronPhase === "recording";
  return `<section class="section">
    <h2>発音</h2>
    <p class="supporting">正確さ、流暢さ、完全さ、抑揚と、単語・音素ごとの点数を見ます。日本語話者が迷いやすい音の文を入れてあります。</p>
    ${banners("pron")}
    <div class="segment" role="radiogroup" aria-label="採点のしかた">
      <button type="button" data-action="pick-pron-mode" data-value="read_aloud" aria-pressed="${state.pronMode === "read_aloud" ? "true" : "false"}"${recording ? " disabled" : ""}>読み上げ</button>
      <button type="button" data-action="pick-pron-mode" data-value="unscripted" aria-pressed="${state.pronMode === "unscripted" ? "true" : "false"}"${recording ? " disabled" : ""}>自由に話す</button>
    </div>
    ${state.pronMode === "read_aloud" ? readAloudSetup(recording) : `<p class="supporting">台本はありません。話した内容について、正確さ・流暢さ・抑揚を採点します。完全さは出ないことがあります。言い終えて少し黙ると止まります。</p>`}
    <p class="hint">Azure の発音評価は使った分だけ課金されます。無料枠を超えると有料になることがあります。iPhone は Safari で開き、アプリ内ブラウザではマイクが使えないことがあります。</p>
    ${
      recording
        ? `<button type="button" class="btn filled" data-action="pron-cancel">録音を止める</button><p class="supporting">聞いています。言い終えて少し黙ると採点が始まります。</p>`
        : `<button type="button" class="btn filled" data-action="pron-start">${state.mode === "demo" ? "見本の採点を見る" : "録音して採点"}</button>`
    }
    ${latest ? attemptDetail(latest, isPreviewId(latest.id)) : ""}
    <h2 class="later">点数の推移</h2>
    ${chart(rows)}
    <h2 class="later">よくずれる音</h2>
    ${problemList(rows)}
    ${rest.length ? `<h2 class="later">前の記録</h2>${rest.map((row) => attemptCompact(row)).join("")}` : ""}
  </section>`;
}

function readAloudSetup(recording: boolean): string {
  return `<div class="sentence-list">
      ${STARTER_SENTENCES.map((sentence) => {
        const on = state.pronSentenceId === sentence.id;
        return `<button type="button" class="sentence${on ? " on" : ""}" data-action="pick-sentence" data-id="${esc(sentence.id)}" aria-pressed="${on ? "true" : "false"}"${recording ? " disabled" : ""}>
          <span class="kicker">${esc(sentence.focus)}</span>
          <span class="what">${esc(sentence.text)}</span>
        </button>`;
      }).join("")}
    </div>
    <label class="text-field">
      <textarea id="pron-reference" rows="3" maxlength="500" placeholder=" "${recording ? " disabled" : ""}>${esc(state.pronReference)}</textarea>
      <span>読み上げる文</span>
    </label>
    <p class="hint">文を選ぶか、自分で入力します。500文字までです。</p>`;
}

function attemptDetail(row: PronunciationAttempt, preview: boolean): string {
  const tips = tipsForAttempt(row);
  return `<article class="card" id="item-${esc(row.id)}">
    <div class="meta-row">
      ${preview ? `<span class="status">見本</span>` : ""}
      <span class="status">${row.mode === "unscripted" ? "自由に話す" : "読み上げ"}</span>
      ${row.focus ? `<span class="status">${esc(row.focus)}</span>` : ""}
      <span class="status">${esc(shortMonthDay(row.recorded_on || tokyoDate(row.created_at)))}</span>
      ${row.source === "conversation" ? `<span class="status">会話から</span>` : ""}
    </div>
    ${scoreGrid(row)}
    ${row.reference_text ? `<h4 class="diff-heading">読んだ文</h4><p class="prose">${esc(row.reference_text)}</p>` : ""}
    ${row.recognized_text ? `<h4 class="diff-heading">聞き取った文</h4><p class="prose">${esc(row.recognized_text)}</p>` : ""}
    <div class="words">${row.words.map(wordHtml).join("")}</div>
    ${tips.length ? `<ul class="tips">${tips.map((tip) => `<li>${esc(tip)}</li>`).join("")}</ul>` : ""}
    ${row.mode === "unscripted" ? `<p class="hint">台本がないので、完全さは出ないことがあります。音素は en-US です。</p>` : ""}
    ${preview ? "" : `<div class="card-actions"><button type="button" class="btn text error" data-action="open-delete" data-target="pronunciation" data-id="${esc(row.id)}" data-label="この採点">削除</button></div>`}
  </article>`;
}

function attemptCompact(row: PronunciationAttempt): string {
  const preview = isPreviewId(row.id);
  return `<article class="card" id="item-${esc(row.id)}">
    <div class="meta-row">
      <span class="status">${row.mode === "unscripted" ? "自由に話す" : "読み上げ"}</span>
      <span class="status">${esc(shortMonthDay(row.recorded_on || tokyoDate(row.created_at)))}</span>
      <span class="status ${scoreBand(row.accuracy)}">正確さ ${esc(scoreText(row.accuracy))}</span>
      <span class="status">流暢さ ${esc(scoreText(row.fluency))}</span>
      <span class="status">抑揚 ${esc(scoreText(row.prosody))}</span>
    </div>
    <p class="prose">${esc(row.reference_text || row.recognized_text)}</p>
    <div class="words">${row.words.map(wordHtml).join("")}</div>
    ${preview ? "" : `<div class="card-actions"><button type="button" class="btn text error" data-action="open-delete" data-target="pronunciation" data-id="${esc(row.id)}" data-label="この採点">削除</button></div>`}
  </article>`;
}

function scoreGrid(row: PronunciationAttempt): string {
  const cells: [string, number | null][] = [
    ["正確さ", row.accuracy],
    ["流暢さ", row.fluency],
    ["完全さ", row.completeness],
    ["抑揚", row.prosody],
    ["総合", row.pronunciation],
  ];
  return `<div class="score-grid">${cells
    .map(
      ([label, value]) =>
        `<div class="score-cell ${scoreBand(value)}"><span class="score-num">${esc(scoreText(value))}</span><span class="score-label">${esc(label)}</span></div>`,
    )
    .join("")}</div>`;
}

function wordHtml(word: PronunciationAttempt["words"][number]): string {
  const flag = errorLabel(word.error_type);
  const band = word.error_type === "Omission" || word.error_type === "Mispronunciation" ? "bad" : word.error_type === "Insertion" ? "mid" : scoreBand(word.accuracy);
  const phones = word.phonemes
    .map(
      (phoneme) =>
        `<span class="phon ${scoreBand(phoneme.accuracy)}">${esc(phoneme.phoneme)} ${esc(scoreText(phoneme.accuracy))}</span>`,
    )
    .join("");
  return `<span class="score-word ${band}"><span class="score-word-text">${esc(word.word)}</span><span class="score-word-num">${esc(scoreText(word.accuracy))}${flag ? ` ${esc(flag)}` : ""}</span>${phones ? `<span class="phones">${phones}</span>` : ""}</span>`;
}

function chart(rows: PronunciationAttempt[]): string {
  const series = [...rows].reverse().slice(-12);
  if (!series.length) return `<p class="supporting">まだ点数がありません。</p>`;
  const width = 320;
  const height = 150;
  const left = 28;
  const right = 8;
  const top = 12;
  const bottom = 22;
  const innerW = width - left - right;
  const innerH = height - top - bottom;
  const x = (index: number) => left + (series.length === 1 ? innerW / 2 : (index / (series.length - 1)) * innerW);
  const y = (score: number) => top + innerH - (Math.max(0, Math.min(100, score)) / 100) * innerH;
  const line = (key: "accuracy" | "fluency" | "prosody") =>
    series
      .map((row, index) => {
        const value = row[key];
        if (value == null) return "";
        return `${x(index).toFixed(1)},${y(value).toFixed(1)}`;
      })
      .filter(Boolean)
      .join(" ");
  const grids = [0, 50, 100]
    .map((score) => {
      const yy = y(score).toFixed(1);
      return `<line class="grid" x1="${left}" y1="${yy}" x2="${width - right}" y2="${yy}"></line><text class="axis" x="0" y="${Number(yy) + 4}">${score}</text>`;
    })
    .join("");
  const first = series[0];
  const last = series[series.length - 1];
  return `<div class="chart-wrap">
    <svg class="chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="正確さ、流暢さ、抑揚の推移">
      ${grids}
      <polyline class="series accuracy" points="${line("accuracy")}"></polyline>
      <polyline class="series fluency" points="${line("fluency")}"></polyline>
      <polyline class="series prosody" points="${line("prosody")}"></polyline>
    </svg>
    <p class="legend chart-legend">
      <span class="swatch accuracy">正確さ</span>
      <span class="swatch fluency">流暢さ</span>
      <span class="swatch prosody">抑揚</span>
      <span>${esc(shortMonthDay(first.recorded_on))} → ${esc(shortMonthDay(last.recorded_on))}</span>
    </p>
  </div>`;
}

function problemList(rows: PronunciationAttempt[]): string {
  const problems = frequentProblems(rows);
  if (!problems.words.length && !problems.phonemes.length) {
    return `<p class="supporting">まだ目立つ誤りはありません。70点未満の単語と音素を数えます。</p>`;
  }
  const words = problems.words.map((item) => `<li><strong>${esc(item.label)}</strong> ${item.count}回</li>`).join("");
  const phonemes = problems.phonemes
    .map((item) => `<li><strong>${esc(item.label)}</strong> ${item.count}回${item.tip ? `<span class="supporting"> ${esc(item.tip)}</span>` : ""}</li>`)
    .join("");
  return `${words ? `<h3 class="subhead">単語</h3><ul class="tips">${words}</ul>` : ""}${phonemes ? `<h3 class="subhead">音素</h3><ul class="tips">${phonemes}</ul>` : ""}`;
}

function go(screen: "speaking" | "pronunciation"): void {
  state.screen = screen;
  state.menuOpen = false;
  state.dialog = null;
  const next = `#/${screen}`;
  if (location.hash !== next) location.hash = next;
  emit();
}

export function bindSpeaking(): void {
  document.addEventListener("input", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLTextAreaElement)) return;
    if (target.id === "speak-topic") state.speakTopic = target.value;
    if (target.id === "pron-reference") {
      state.pronReference = target.value;
      if (starterById(state.pronSentenceId)?.text !== target.value) state.pronSentenceId = "";
    }
  });
  window.addEventListener("pagehide", () => abortSpeaking());
}

export async function handleSpeakingAction(action: string, el: HTMLElement): Promise<boolean> {
  if (action === "pick-scenario") {
    const value = el.dataset.value ?? "";
    if (!SCENARIOS.some((item) => item.id === value) || busy()) return true;
    state.speakScenario = value as SpeakingSession["scenario"];
    emit();
    return true;
  }
  if (action === "pick-level") {
    const value = el.dataset.value ?? "";
    if (!LEVELS.some((item) => item.id === value) || busy()) return true;
    state.speakLevel = value as SpeakingSession["level"];
    emit();
    return true;
  }
  if (action === "pick-minutes") {
    const minutes = Number(el.dataset.value);
    if (!SPEAK_MINUTES.some((item) => item === minutes) || busy()) return true;
    state.speakMaxMinutes = minutes;
    emit();
    return true;
  }
  if (action === "speak-start") {
    await startSpeaking();
    return true;
  }
  if (action === "speak-stop") {
    await stopSpeaking("user");
    return true;
  }
  if (action === "toggle-session") {
    const id = el.dataset.id ?? "";
    state.speakOpenId = state.speakOpenId === id ? null : id;
    emit();
    return true;
  }
  if (action === "save-phrase") {
    await savePhrase(el);
    return true;
  }
  if (action === "check-line") {
    if (speakingBusy()) {
      showToast("先に会話を終了してください");
      return true;
    }
    const text = (el.dataset.text ?? "").trim();
    if (!text) return true;
    state.pronMode = "read_aloud";
    state.pronReference = text.slice(0, 500);
    state.pronSentenceId = "";
    const sessionId = el.dataset.session ?? "";
    state.pronSessionId = sessionId && !isPreviewId(sessionId) ? sessionId : null;
    go("pronunciation");
    showToast("この文を、もう一度マイクに向かって読んでください");
    return true;
  }
  if (action === "pick-pron-mode") {
    const value = el.dataset.value;
    if ((value !== "read_aloud" && value !== "unscripted") || state.pronPhase === "recording") return true;
    state.pronMode = value;
    emit();
    return true;
  }
  if (action === "pick-sentence") {
    if (state.pronPhase === "recording") return true;
    const sentence = starterById(el.dataset.id ?? "");
    if (!sentence) return true;
    state.pronSentenceId = sentence.id;
    state.pronReference = sentence.text;
    state.pronSessionId = null;
    emit();
    return true;
  }
  if (action === "pron-start") {
    await startPronunciation();
    return true;
  }
  if (action === "pron-cancel") {
    cancelPronunciation();
    return true;
  }
  return false;
}

async function savePhrase(el: HTMLElement): Promise<void> {
  const index = Number(el.dataset.index);
  const session =
    el.dataset.from === "preview" ? sampleSpeakingSession() : state.speakingSessions.find((row) => row.id === el.dataset.id);
  const phrase = session?.feedback?.expressions[index];
  if (!phrase) return;
  if (state.expressions.some((row) => row.term.trim().toLowerCase() === phrase.term.trim().toLowerCase())) {
    showToast("すでに表現メモにあります");
    emit();
    return;
  }
  const result = await saveExpression(null, {
    term: phrase.term,
    meaning: phrase.meaning,
    example: phrase.example || null,
    tags: ["会話"],
    learned_on: state.today,
  });
  if (!result.ok) {
    showToast(result.error);
    return;
  }
  emit();
  showToast("表現メモに追加しました");
}
