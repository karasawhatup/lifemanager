import {
  deleteEnglish,
  reloadSilent,
  resetEnglishDemo,
  saveEssay,
  saveExpression,
  saveQuestion,
  saveResource,
  signInMagic,
  signInPassword,
  signOut,
  submitAssignment,
} from "./api";
import { diffText } from "./diff";
import {
  actorLabel,
  assignmentStatusLabel,
  essayStatusLabel,
  kindLabel,
  questionStatusLabel,
} from "./labels";
import { emit, state } from "./state";
import { scenarioLabel } from "./catalog";
import { bindSpeaking, handleSpeakingAction, pronunciationPage, speakingPage } from "./speaking-ui";
import { stopSpeaking } from "./realtime";
import { paintToast, showToast } from "./toast";
import { addDays, formatStamp, shortMonthDay, tokyoDate, weekdayOf } from "../time";
import type {
  Actor,
  Assignment,
  DeleteTarget,
  Dialog,
  EngScreen,
  Essay,
  Expression,
  Question,
  Resource,
  ResourceKind,
} from "./types";
import { isEngScreen } from "./types";

const ICONS: Record<string, string> = {
  home: "M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z",
  book: "M18 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM6 4h5v8l-2.5-1.5L6 12V4z",
  link: "M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z",
  chat: "M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z",
  edit: "M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34a.996.996 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z",
  assignment:
    "M19 3h-4.18C14.4 1.84 13.3 1 12 1c-1.3 0-2.4.84-2.82 2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 0c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zm2 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z",
  mic: "M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.49 6-3.31 6-6.72h-1.7z",
  wave: "M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z",
  add: "M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z",
  more: "M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z",
  calendar:
    "M20 3h-1V1h-2v2H7V1H5v2H4c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 18H4V8h16v13z",
};

const NAV: { id: EngScreen; label: string; icon: string }[] = [
  { id: "home", label: "ホーム", icon: "home" },
  { id: "speaking", label: "会話", icon: "mic" },
  { id: "pronunciation", label: "発音", icon: "wave" },
  { id: "expressions", label: "表現", icon: "book" },
  { id: "resources", label: "教材", icon: "link" },
  { id: "questions", label: "質問", icon: "chat" },
  { id: "essays", label: "作文", icon: "edit" },
  { id: "assignments", label: "課題", icon: "assignment" },
];

const scrollTops = new Map<string, number>();
let lastDialogKey = "";

function icon(name: string): string {
  const path = ICONS[name] ?? "";
  return `<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path fill="currentColor" d="${path}"/></svg>`;
}

function esc(value: string | null | undefined): string {
  return (value ?? "").replace(/[&<>"']/g, (ch) =>
    ch === "&" ? "&amp;" : ch === "<" ? "&lt;" : ch === ">" ? "&gt;" : ch === '"' ? "&quot;" : "&#39;",
  );
}

function clip(text: string, max: number): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}

function value(id: string): string {
  const el = document.getElementById(id);
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
    return el.value;
  }
  return "";
}

function dateLabel(isoDate: string): string {
  if (isoDate === state.today) return "今日";
  if (isoDate === addDays(state.today, -1)) return "昨日";
  return `${shortMonthDay(isoDate)}（${weekdayOf(isoDate)}）`;
}

function dueLabel(due: string | null, status: Assignment["status"]): { text: string; late: boolean } {
  if (!due) return { text: "期限なし", late: false };
  const late = status === "assigned" && due < state.today;
  if (late) return { text: `期限超過 ${dateLabel(due)}`, late: true };
  if (due === state.today) return { text: "今日が期限", late: false };
  return { text: `期限 ${dateLabel(due)}`, late: false };
}

function safeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "https:" || parsed.protocol === "http:") return parsed.href;
  } catch {
    /* リンクにしない */
  }
  return "";
}

function attention(screen: EngScreen): boolean {
  if (screen === "questions") return state.questions.some((row) => row.status === "open");
  if (screen === "essays") return state.essays.some((row) => row.status === "pending");
  if (screen === "assignments") return state.assignments.some((row) => row.status === "assigned");
  return false;
}

function barTitle(screen: EngScreen): string {
  if (screen === "home") return "英語学習";
  return NAV.find((item) => item.id === screen)?.label ?? "英語学習";
}

function dialogKey(dialog: Dialog): string {
  if (!dialog) return "";
  if (dialog.kind === "confirm-delete") return `confirm:${dialog.target}:${dialog.id}`;
  if (dialog.kind === "add-menu") return "add-menu";
  if (dialog.kind === "answer") return `answer:${dialog.id}`;
  return `${dialog.kind}:${dialog.id ?? "new"}`;
}


function setBusy(busy: boolean): void {
  document.querySelectorAll<HTMLButtonElement>("#app button").forEach((btn) => {
    btn.disabled = busy;
  });
}

export function syncScreenFromHash(): void {
  const name = location.hash.replace(/^#\/?/, "");
  state.screen = name && isEngScreen(name) ? name : "home";
}

function setScreen(screen: EngScreen): void {
  state.screen = screen;
  state.menuOpen = false;
  state.dialog = null;
  const next = screen === "home" ? "#/" : `#/${screen}`;
  if (location.hash !== next && !(screen === "home" && (location.hash === "" || location.hash === "#"))) {
    location.hash = next;
  }
  emit();
}

export function render(): void {
  const root = document.getElementById("app");
  if (!root) return;
  const old = root.querySelector<HTMLElement>("[data-keep-scroll]");
  if (old?.dataset.keepScroll) scrollTops.set(old.dataset.keepScroll, old.scrollTop);
  root.innerHTML = state.booting ? splash() : page();
  const next = root.querySelector<HTMLElement>("[data-keep-scroll]");
  const followLive = state.screen === "speaking" && (state.speakPhase === "live" || state.speakPhase === "wrapping" || state.speakPhase === "connecting");
  if (next) next.scrollTop = followLive ? next.scrollHeight : (scrollTops.get(next.dataset.keepScroll ?? "") ?? 0);
  if (state.highlightId) {
    document.getElementById(`item-${state.highlightId}`)?.scrollIntoView({ block: "center" });
    state.highlightId = null;
  }
  const key = dialogKey(state.dialog);
  if (key && key !== lastDialogKey) {
    window.setTimeout(() => {
      document.querySelector<HTMLElement>(".dialog input, .dialog textarea")?.focus();
    }, 30);
  }
  lastDialogKey = key;
  document.title = state.screen === "home" || state.booting ? "英語学習" : `${barTitle(state.screen)} · 英語学習`;
  paintToast();
}

function splash(): string {
  return `<div class="splash" role="status"><div class="progress" aria-hidden="true"></div><p class="title">英語学習</p></div>`;
}

function page(): string {
  if (state.mode === "live" && !state.email) return loginPage();
  return `<div class="shell"><div class="frame">${rail()}${workspace()}</div>${bar()}${fab()}${menuLayer()}${dialogHtml()}</div>`;
}

function workspace(): string {
  return `<div class="workspace">${topBar()}<main class="content" data-keep-scroll="${state.screen}">${banners()}${body()}</main></div>`;
}

function banners(): string {
  const parts: string[] = [];
  if (state.mode === "demo") {
    parts.push(`<p class="banner">デモモードです。この端末の中だけに保存されます。サーバーには送られません。</p>`);
  }
  if (state.loadError) parts.push(`<p class="banner error">${esc(state.loadError)}</p>`);
  else if (state.mode === "live" && !state.connected) {
    parts.push(`<p class="banner error">同期が止まっています。メニューの「読み直す」を押してください。</p>`);
  }
  return parts.join("");
}

function topBar(): string {
  return `<header class="top-app-bar">
    <a class="icon-btn" href="../" aria-label="予定に戻る">${icon("calendar")}</a>
    <h1>${esc(barTitle(state.screen))}</h1>
    <button type="button" class="icon-btn" data-action="menu" aria-label="メニュー" aria-expanded="${state.menuOpen}" aria-haspopup="menu">${icon("more")}</button>
  </header>`;
}

function menu(): string {
  const items: string[] = [];
  if (state.mode === "live") {
    items.push(`<button type="button" role="menuitem" data-action="reload">読み直す</button>`);
    items.push(`<button type="button" role="menuitem" data-action="sign-out">ログアウト</button>`);
  } else {
    items.push(`<button type="button" role="menuitem" data-action="reset-demo">サンプルに戻す</button>`);
  }
  items.push(`<a role="menuitem" href="../">LIFEMANAGERを開く</a>`);
  const who = state.mode === "demo" ? "デモ" : (state.email ?? "");
  return `<div class="menu" role="menu">
    <p class="menu-who">${esc(who)}</p>
    ${items.join("")}
  </div>`;
}

function menuLayer(): string {
  if (!state.menuOpen) return "";
  return `<div class="menu-layer"><button type="button" class="menu-backdrop" data-action="close-menu" aria-label="メニューを閉じる"></button>${menu()}</div>`;
}

function navButton(item: (typeof NAV)[number], className: string): string {
  const current = state.screen === item.id;
  const dot = attention(item.id) ? `<span class="dot"></span>` : "";
  return `<button type="button" class="${className}" data-action="go" data-screen="${item.id}" aria-current="${current ? "page" : "false"}">
    <span class="indicator">${icon(item.icon)}${dot}</span>
    <span class="label">${item.label}</span>
  </button>`;
}

function rail(): string {
  return `<nav class="nav-rail" aria-label="英語学習">${NAV.map((item) => navButton(item, "rail-item")).join("")}</nav>`;
}

function bar(): string {
  return `<nav class="nav-bar" aria-label="英語学習">${NAV.map((item) => navButton(item, "bar-item")).join("")}</nav>`;
}

function fab(): string {
  if (state.screen === "assignments" || state.screen === "speaking" || state.screen === "pronunciation") return "";
  const label =
    state.screen === "home"
      ? "追加"
      : state.screen === "expressions"
        ? "表現を追加"
        : state.screen === "resources"
          ? "教材を追加"
          : state.screen === "questions"
            ? "質問を追加"
            : "英作文を追加";
  return `<button type="button" class="fab" data-action="fab" aria-label="${label}">${icon("add")}</button>`;
}

function body(): string {
  if (state.screen === "home") return home();
  if (state.screen === "speaking") return speakingPage();
  if (state.screen === "pronunciation") return pronunciationPage();
  if (state.screen === "expressions") return expressionsPage();
  if (state.screen === "resources") return resourcesPage();
  if (state.screen === "questions") return questionsPage();
  if (state.screen === "essays") return essaysPage();
  return assignmentsPage();
}

function home(): string {
  const todaySpeak = state.speakingSessions.filter((row) => tokyoDate(row.started_at) === state.today).length;
  const todayPron = state.pronunciationAttempts.filter((row) => row.recorded_on === state.today).length;
  const todayExpr = state.expressions.filter((row) => row.learned_on === state.today).length;
  const todayRes = state.resources.filter((row) => row.recorded_on === state.today).length;
  const todayQ = state.questions.filter((row) => tokyoDate(row.created_at) === state.today).length;
  const todayE = state.essays.filter((row) => tokyoDate(row.created_at) === state.today).length;
  const openQ = state.questions.filter((row) => row.status === "open").length;
  const pendingE = state.essays.filter((row) => row.status === "pending").length;
  const waiting = state.assignments.filter((row) => row.status === "submitted").length;
  const pendingSum = openQ + pendingE + waiting;
  const openAssignments = state.assignments
    .filter((row) => row.status === "assigned")
    .sort((a, b) => (a.due_on ?? "9999-99-99").localeCompare(b.due_on ?? "9999-99-99"));
  const activities = todayActivity();
  return `<section class="section">
      <h2>今日の学習</h2>
      <p class="supporting">${esc(shortMonthDay(state.today))}（${esc(weekdayOf(state.today))}） · 目標は毎日1時間以上。単語、英作文、リスニング、スピーキング。</p>
      <div class="launch">
        <button type="button" class="btn filled" data-action="go" data-screen="speaking">会話する</button>
        <button type="button" class="btn tonal" data-action="go" data-screen="pronunciation">発音をチェック</button>
      </div>
      <div class="stat-grid">
        ${stat("speaking", String(todaySpeak), "今日の会話")}
        ${stat("pronunciation", String(todayPron), "今日の発音")}
        ${stat("expressions", String(todayExpr), "今日の表現")}
        ${stat("resources", String(todayRes), "今日の教材")}
        ${stat("questions", String(todayQ), "今日の質問")}
        ${stat("essays", String(todayE), "今日の作文")}
      </div>
      ${
        activities.length
          ? activities
              .map(
                (item) => `<button type="button" class="activity" data-action="go" data-reset="1" data-screen="${item.screen}" data-id="${esc(item.id)}">
              <span class="kicker">${esc(item.kicker)}</span>
              <span class="what">${esc(item.title)}</span>
            </button>`,
              )
              .join("")
          : `<p class="supporting">今日の記録はまだありません。右下の＋から、表現や作文を残せます。</p>`
      }
    </section>
    <section class="section">
      <h2>未対応</h2>
      <p class="supporting">エージェントの返事を待っているものが ${pendingSum} 件あります。</p>
      <div class="stat-grid three">
        ${stat("questions", String(openQ), "未回答の質問")}
        ${stat("essays", String(pendingE), "添削待ちの作文")}
        ${stat("assignments", String(waiting), "フィードバック待ち")}
      </div>
    </section>
    <section class="section">
      <h2>未提出の課題</h2>
      ${
        openAssignments.length
          ? openAssignments.map(assignmentCard).join("")
          : `<p class="supporting">未提出の課題はありません。</p>`
      }
    </section>`;
}

function stat(screen: EngScreen, num: string, label: string): string {
  return `<button type="button" class="stat" data-action="go" data-reset="1" data-screen="${screen}">
    <span class="stat-num">${esc(num)}</span>
    <span class="stat-label">${esc(label)}</span>
  </button>`;
}

function todayActivity(): { id: string; screen: EngScreen; kicker: string; title: string; at: string }[] {
  const items: { id: string; screen: EngScreen; kicker: string; title: string; at: string }[] = [];
  for (const row of state.speakingSessions) {
    if (tokyoDate(row.started_at) === state.today) {
      items.push({
        id: row.id,
        screen: "speaking",
        kicker: "会話",
        title: row.topic || scenarioLabel(row.scenario),
        at: row.started_at,
      });
    }
  }
  for (const row of state.pronunciationAttempts) {
    if (row.recorded_on === state.today) {
      items.push({
        id: row.id,
        screen: "pronunciation",
        kicker: "発音",
        title: row.reference_text || row.recognized_text || "発音",
        at: row.created_at,
      });
    }
  }
  for (const row of state.expressions) {
    if (row.learned_on === state.today) {
      items.push({ id: row.id, screen: "expressions", kicker: "表現", title: row.term, at: row.created_at });
    }
  }
  for (const row of state.resources) {
    if (row.recorded_on === state.today) {
      items.push({ id: row.id, screen: "resources", kicker: "教材", title: row.title, at: row.created_at });
    }
  }
  for (const row of state.questions) {
    if (tokyoDate(row.created_at) === state.today) {
      items.push({ id: row.id, screen: "questions", kicker: "質問", title: clip(row.question, 48), at: row.created_at });
    }
  }
  for (const row of state.essays) {
    if (tokyoDate(row.created_at) === state.today) {
      items.push({ id: row.id, screen: "essays", kicker: "作文", title: row.title || clip(row.original_text, 48), at: row.created_at });
    }
  }
  items.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
  return items;
}

function chips(group: string, options: { id: string; label: string }[], current: string): string {
  return `<div class="chips" role="toolbar">${options
    .map(
      (opt) =>
        `<button type="button" class="chip${opt.id === current ? " on" : ""}" data-action="filter" data-group="${group}" data-value="${opt.id}" aria-pressed="${opt.id === current ? "true" : "false"}">${esc(opt.label)}</button>`,
    )
    .join("")}</div>`;
}

function actorChip(actor: Actor | null): string {
  if (!actor) return "";
  const kind = actor === "app" ? "self" : actor;
  return `<span class="assist ${kind}">${esc(actorLabel(actor))}</span>`;
}

function expressionsPage(): string {
  const rows = [...state.expressions]
    .filter((row) => state.expressionFilter === "all" || row.learned_on === state.today)
    .sort((a, b) => (a.learned_on === b.learned_on ? (a.created_at < b.created_at ? 1 : -1) : a.learned_on < b.learned_on ? 1 : -1));
  return `${chips("expression", [{ id: "all", label: "すべて" }, { id: "today", label: "今日" }], state.expressionFilter)}
    ${rows.length ? rows.map(expressionCard).join("") : empty("表現はまだありません。", "表現を追加", "open-expression")}`;
}

function expressionCard(row: Expression): string {
  return `<article class="card" id="item-${esc(row.id)}">
    <h3>${esc(row.term)}</h3>
    <p class="prose">${esc(row.meaning)}</p>
    ${row.example ? `<p class="prose example">${esc(row.example)}</p>` : ""}
    <div class="meta-row">
      ${row.tags.map((tag) => `<span class="tag">${esc(tag)}</span>`).join("")}
      <span class="status">${esc(dateLabel(row.learned_on))}</span>
      ${actorChip(row.created_by)}
    </div>
    <div class="card-actions">
      <button type="button" class="btn text" data-action="open-expression" data-id="${esc(row.id)}">編集</button>
      <button type="button" class="btn text error" data-action="open-delete" data-target="expression" data-id="${esc(row.id)}" data-label="${esc(row.term)}">削除</button>
    </div>
  </article>`;
}

function resourcesPage(): string {
  const rows = [...state.resources]
    .filter((row) => {
      if (state.resourceFilter === "today") return row.recorded_on === state.today;
      if (state.resourceFilter === "all") return true;
      return row.kind === state.resourceFilter;
    })
    .sort((a, b) => (a.recorded_on === b.recorded_on ? (a.created_at < b.created_at ? 1 : -1) : a.recorded_on < b.recorded_on ? 1 : -1));
  return `${chips(
    "resource",
    [
      { id: "all", label: "すべて" },
      { id: "today", label: "今日" },
      { id: "article", label: "記事" },
      { id: "video", label: "動画" },
      { id: "other", label: "その他" },
    ],
    state.resourceFilter,
  )}
    ${rows.length ? rows.map(resourceCard).join("") : empty("教材のURLはまだありません。", "URLを追加", "open-resource")}`;
}

function resourceCard(row: Resource): string {
  const href = safeUrl(row.url);
  const title = href
    ? `<a class="resource-link" href="${esc(href)}" target="_blank" rel="noopener noreferrer">${esc(row.title)}</a>`
    : esc(row.title);
  return `<article class="card" id="item-${esc(row.id)}">
    <h3>${title}</h3>
    <div class="meta-row">
      <span class="status">${esc(kindLabel(row.kind))}</span>
      <span class="status">${esc(dateLabel(row.recorded_on))}</span>
      ${actorChip(row.added_by)}
    </div>
    ${row.note ? `<p class="prose">${esc(row.note)}</p>` : ""}
    <p class="url-line">${esc(row.url)}</p>
    <div class="card-actions">
      <button type="button" class="btn text" data-action="open-resource" data-id="${esc(row.id)}">編集</button>
      <button type="button" class="btn text error" data-action="open-delete" data-target="resource" data-id="${esc(row.id)}" data-label="${esc(row.title)}">削除</button>
    </div>
  </article>`;
}

function questionsPage(): string {
  const rows = [...state.questions]
    .filter((row) => state.questionFilter === "all" || row.status === state.questionFilter)
    .sort((a, b) => {
      if (a.status !== b.status) return a.status === "open" ? -1 : 1;
      return a.created_at < b.created_at ? 1 : -1;
    });
  return `${chips(
    "question",
    [
      { id: "all", label: "すべて" },
      { id: "open", label: "未回答" },
      { id: "answered", label: "回答済み" },
    ],
    state.questionFilter,
  )}
    ${rows.length ? rows.map(questionCard).join("") : empty("質問はまだありません。", "質問する", "open-question")}`;
}

function questionCard(row: Question): string {
  return `<article class="card" id="item-${esc(row.id)}">
    <div class="meta-row">
      <span class="status ${row.status === "open" ? "wait" : "done"}">${esc(questionStatusLabel(row.status))}</span>
      <span class="status">${esc(dateLabel(tokyoDate(row.created_at)))}</span>
      ${actorChip(row.created_by)}
      ${row.answered_by ? actorChip(row.answered_by) : ""}
    </div>
    <p class="prose">${esc(row.question)}</p>
    ${
      row.answer
        ? `<div class="explain"><h4>回答</h4><p class="prose">${esc(row.answer)}</p></div>`
        : `<p class="supporting">チューターの回答を待っています。</p>`
    }
    <div class="card-actions">
      ${row.status === "open" ? `<button type="button" class="btn text" data-action="open-question" data-id="${esc(row.id)}">編集</button>` : ""}
      <button type="button" class="btn text error" data-action="open-delete" data-target="question" data-id="${esc(row.id)}" data-label="この質問">削除</button>
    </div>
  </article>`;
}

function essaysPage(): string {
  const rows = [...state.essays]
    .filter((row) => state.essayFilter === "all" || row.status === state.essayFilter)
    .sort((a, b) => {
      if (a.status !== b.status) return a.status === "pending" ? -1 : 1;
      return a.created_at < b.created_at ? 1 : -1;
    });
  return `${chips(
    "essay",
    [
      { id: "all", label: "すべて" },
      { id: "pending", label: "添削待ち" },
      { id: "corrected", label: "添削済み" },
    ],
    state.essayFilter,
  )}
    ${rows.length ? rows.map(essayCard).join("") : empty("英作文はまだありません。", "作文を書く", "open-essay")}`;
}

function essayCard(row: Essay): string {
  const corrected = row.status === "corrected" && row.corrected_text;
  return `<article class="card" id="item-${esc(row.id)}">
    <h3>${esc(row.title || clip(row.original_text, 28))}</h3>
    <div class="meta-row">
      <span class="status ${row.status === "pending" ? "wait" : "done"}">${esc(essayStatusLabel(row.status))}</span>
      <span class="status">${esc(dateLabel(tokyoDate(row.created_at)))}</span>
      ${actorChip(row.created_by)}
      ${row.corrected_by ? actorChip(row.corrected_by) : ""}
    </div>
    ${
      corrected
        ? `<div class="compare">
            <section><h4>原文</h4><p class="prose">${esc(row.original_text)}</p></section>
            <section><h4>添削</h4><p class="prose">${esc(row.corrected_text)}</p></section>
          </div>
          <h4 class="diff-heading">差分</h4>
          <p class="legend"><del>削除</del><ins>追加</ins></p>
          ${renderDiff(row.original_text, row.corrected_text ?? "")}
          ${row.explanation ? `<div class="explain"><h4>説明</h4><p class="prose">${esc(row.explanation)}</p></div>` : ""}`
        : `<p class="prose">${esc(row.original_text)}</p><p class="supporting">ライターの添削を待っています。</p>`
    }
    <div class="card-actions">
      ${row.status === "pending" ? `<button type="button" class="btn text" data-action="open-essay" data-id="${esc(row.id)}">編集</button>` : ""}
      <button type="button" class="btn text error" data-action="open-delete" data-target="essay" data-id="${esc(row.id)}" data-label="${esc(row.title || "この作文")}">削除</button>
    </div>
  </article>`;
}

function renderDiff(before: string, after: string): string {
  const parts = diffText(before, after);
  let html = "";
  for (let i = 0; i < parts.length; i += 1) {
    const part = parts[i];
    const prev = parts[i - 1];
    const needsGap =
      !!prev &&
      prev.kind !== "same" &&
      part.kind !== "same" &&
      prev.kind !== part.kind &&
      !/\s$/.test(prev.text) &&
      !/^\s/.test(part.text);
    if (needsGap) html += " ";
    const text = esc(part.text);
    if (part.kind === "del") html += `<del>${text}</del>`;
    else if (part.kind === "ins") html += `<ins>${text}</ins>`;
    else html += text;
  }
  return `<p class="diff">${html}</p>`;
}

function assignmentsPage(): string {
  const rank = { assigned: 0, submitted: 1, reviewed: 2 };
  const rows = [...state.assignments]
    .filter((row) => state.assignmentFilter === "all" || row.status === state.assignmentFilter)
    .sort((a, b) => {
      if (a.status !== b.status) return rank[a.status] - rank[b.status];
      if (a.status === "assigned") return (a.due_on ?? "9999-99-99").localeCompare(b.due_on ?? "9999-99-99");
      return a.created_at < b.created_at ? 1 : -1;
    });
  const body = rows.length
    ? rows.map(assignmentCard).join("")
    : `<div class="empty"><p>課題はまだありません。</p><p class="supporting">課題はチューターが作ります。届くとここに出ます。</p></div>`;
  return `${chips(
    "assignment",
    [
      { id: "all", label: "すべて" },
      { id: "assigned", label: "未提出" },
      { id: "submitted", label: "提出済み" },
      { id: "reviewed", label: "レビュー済み" },
    ],
    state.assignmentFilter,
  )}${body}`;
}

function assignmentCard(row: Assignment): string {
  const due = dueLabel(row.due_on, row.status);
  const submitLabel = row.status === "assigned" ? "提出する" : "答えを直す";
  return `<article class="card" id="item-${esc(row.id)}">
    <h3>${esc(row.title)}</h3>
    <div class="meta-row">
      <span class="status ${row.status === "reviewed" ? "done" : "wait"}">${esc(assignmentStatusLabel(row.status))}</span>
      <span class="status${due.late ? " late" : ""}">${esc(due.text)}</span>
      ${actorChip(row.created_by)}
      ${row.reviewed_by && row.reviewed_by !== row.created_by ? actorChip(row.reviewed_by) : ""}
    </div>
    <p class="prose">${esc(row.instructions)}</p>
    ${row.answer ? `<div class="answer-box"><h4>提出した答え</h4><p class="prose">${esc(row.answer)}</p>${row.submitted_at ? `<p class="supporting">${esc(formatStamp(row.submitted_at))} に提出</p>` : ""}</div>` : ""}
    ${row.feedback ? `<div class="explain"><h4>フィードバック</h4><p class="prose">${esc(row.feedback)}</p></div>` : ""}
    ${row.status === "submitted" && !row.feedback ? `<p class="supporting">フィードバックを待っています。</p>` : ""}
    <div class="card-actions">
      ${row.status !== "reviewed" ? `<button type="button" class="btn tonal" data-action="open-answer" data-id="${esc(row.id)}">${submitLabel}</button>` : ""}
      <button type="button" class="btn text error" data-action="open-delete" data-target="assignment" data-id="${esc(row.id)}" data-label="${esc(row.title)}">削除</button>
    </div>
  </article>`;
}

function empty(message: string, action: string, name: string): string {
  return `<div class="empty"><p>${esc(message)}</p><button type="button" class="btn filled" data-action="${name}">${esc(action)}</button></div>`;
}

function loginPage(): string {
  return `<div class="login">
    <a class="btn text" href="../">予定に戻る</a>
    <div class="login-card">
      <h1>英語学習</h1>
      <p class="supporting">LIFEMANAGER と同じメールアドレスとパスワードです。一度入れば、予定の画面と共通です。</p>
      ${state.authNotice ? `<p class="banner">${esc(state.authNotice)}</p>` : ""}
      ${state.loadError ? `<p class="banner error">${esc(state.loadError)}</p>` : ""}
      <form data-form="login">
        <label class="text-field"><input id="auth-email" type="email" name="email" autocomplete="username" required placeholder=" " value="${esc(state.authEmail)}" /><span>メールアドレス</span></label>
        <label class="text-field"><input id="auth-password" type="password" name="password" autocomplete="current-password" required placeholder=" " /><span>パスワード</span></label>
        <button class="btn filled block" type="submit">ログイン</button>
      </form>
      <button type="button" class="btn text block" data-action="magic">メールのリンクでログイン</button>
    </div>
  </div>`;
}

function textField(id: string, label: string, valueText: string, opts: { multiline?: boolean; maxlength?: number; rows?: number }): string {
  const max = opts.maxlength ? ` maxlength="${opts.maxlength}"` : "";
  const control = opts.multiline
    ? `<textarea id="${id}" name="${id}" rows="${opts.rows ?? 4}"${max} placeholder=" ">${esc(valueText)}</textarea>`
    : `<input id="${id}" name="${id}" type="text"${max} value="${esc(valueText)}" placeholder=" " autocomplete="off" />`;
  return `<label class="text-field">${control}<span>${esc(label)}</span></label>`;
}

function dateField(id: string, label: string, valueText: string): string {
  return `<label class="date-field"><span>${esc(label)}</span><input id="${id}" name="${id}" type="date" required value="${esc(valueText)}" /></label>`;
}

function dialogHtml(): string {
  if (!state.dialog) return "";
  return `<div class="scrim-layer"><button type="button" class="scrim" data-action="close" aria-label="閉じる"></button>${dialogInner(state.dialog)}</div>`;
}

function dialogInner(dialog: Exclude<Dialog, null>): string {
  if (dialog.kind === "add-menu") {
    return `<div class="dialog" role="dialog" aria-modal="true" aria-labelledby="dlg-title">
      <h2 id="dlg-title">追加</h2>
      <button type="button" class="menu-row" data-action="open-expression">表現・単語</button>
      <button type="button" class="menu-row" data-action="open-resource">教材のURL</button>
      <button type="button" class="menu-row" data-action="open-question">質問</button>
      <button type="button" class="menu-row" data-action="open-essay">英作文</button>
      <div class="dialog-actions"><button type="button" class="btn text" data-action="close">閉じる</button></div>
    </div>`;
  }
  if (dialog.kind === "confirm-delete") {
    return `<div class="dialog" role="dialog" aria-modal="true" aria-labelledby="dlg-title">
      <h2 id="dlg-title">削除しますか</h2>
      <p class="supporting">${esc(dialog.label)} を削除します。元に戻せません。</p>
      <div class="dialog-actions">
        <button type="button" class="btn text" data-action="close">キャンセル</button>
        <button type="button" class="btn text error" data-action="confirm-delete">削除</button>
      </div>
    </div>`;
  }
  if (dialog.kind === "expression") return expressionForm(dialog.id);
  if (dialog.kind === "resource") return resourceForm(dialog.id);
  if (dialog.kind === "question") return questionForm(dialog.id);
  if (dialog.kind === "essay") return essayForm(dialog.id);
  return answerForm(dialog.id);
}

function expressionForm(id: string | null): string {
  const row = id ? state.expressions.find((item) => item.id === id) : undefined;
  return `<form class="dialog" data-form="expression" role="dialog" aria-modal="true" aria-labelledby="dlg-title">
    <h2 id="dlg-title">${id ? "表現を編集" : "表現を追加"}</h2>
    ${textField("ex-term", "表現・単語", row?.term ?? "", { maxlength: 200 })}
    ${textField("ex-meaning", "意味", row?.meaning ?? "", { maxlength: 1000 })}
    ${textField("ex-example", "例文", row?.example ?? "", { multiline: true, maxlength: 2000, rows: 4 })}
    ${textField("ex-tags", "タグ", (row?.tags ?? []).join(", "), { maxlength: 400 })}
    <p class="hint">カンマ（,）または読点（、）で区切ります。16個まで。</p>
    ${dateField("ex-date", "日付", row?.learned_on ?? state.today)}
    <div class="dialog-actions">
      <button type="button" class="btn text" data-action="close">キャンセル</button>
      <button class="btn filled" type="submit">保存</button>
    </div>
  </form>`;
}

function resourceForm(id: string | null): string {
  const row = id ? state.resources.find((item) => item.id === id) : undefined;
  const kind = row?.kind ?? "article";
  const option = (idKind: ResourceKind, label: string) =>
    `<button type="button" data-action="pick-kind" data-kind="${idKind}" aria-pressed="${kind === idKind ? "true" : "false"}">${label}</button>`;
  return `<form class="dialog" data-form="resource" role="dialog" aria-modal="true" aria-labelledby="dlg-title">
    <h2 id="dlg-title">${id ? "教材を編集" : "教材を追加"}</h2>
    ${textField("rs-url", "URL", row?.url ?? "", { maxlength: 2000 })}
    ${textField("rs-title", "タイトル", row?.title ?? "", { maxlength: 300 })}
    <p class="field-label" id="kind-label">種類</p>
    <div class="segment" role="radiogroup" aria-labelledby="kind-label">
      ${option("article", "記事")}
      ${option("video", "動画")}
      ${option("other", "その他")}
    </div>
    <input id="rs-kind" type="hidden" value="${kind}" />
    ${textField("rs-note", "メモ", row?.note ?? "", { multiline: true, maxlength: 2000, rows: 3 })}
    ${dateField("rs-date", "日付", row?.recorded_on ?? state.today)}
    <div class="dialog-actions">
      <button type="button" class="btn text" data-action="close">キャンセル</button>
      <button class="btn filled" type="submit">保存</button>
    </div>
  </form>`;
}

function questionForm(id: string | null): string {
  const row = id ? state.questions.find((item) => item.id === id) : undefined;
  return `<form class="dialog" data-form="question" role="dialog" aria-modal="true" aria-labelledby="dlg-title">
    <h2 id="dlg-title">${id ? "質問を編集" : "質問する"}</h2>
    <p class="supporting">文法や表現で分からないことを書きます。答えはチューターが後から入れます。</p>
    ${textField("q-body", "質問", row?.question ?? "", { multiline: true, maxlength: 4000, rows: 6 })}
    <div class="dialog-actions">
      <button type="button" class="btn text" data-action="close">キャンセル</button>
      <button class="btn filled" type="submit">${id ? "保存" : "送る"}</button>
    </div>
  </form>`;
}

function essayForm(id: string | null): string {
  const row = id ? state.essays.find((item) => item.id === id) : undefined;
  return `<form class="dialog" data-form="essay" role="dialog" aria-modal="true" aria-labelledby="dlg-title">
    <h2 id="dlg-title">${id ? "作文を編集" : "英作文を書く"}</h2>
    <p class="supporting">英文を送ると、ライターが添削と日本語の説明を書きます。</p>
    ${textField("es-title", "タイトル", row?.title ?? "", { maxlength: 80 })}
    ${textField("es-body", "英文", row?.original_text ?? "", { multiline: true, maxlength: 8000, rows: 8 })}
    <div class="dialog-actions">
      <button type="button" class="btn text" data-action="close">キャンセル</button>
      <button class="btn filled" type="submit">${id ? "保存" : "提出"}</button>
    </div>
  </form>`;
}

function answerForm(id: string): string {
  const row = state.assignments.find((item) => item.id === id);
  return `<form class="dialog" data-form="answer" role="dialog" aria-modal="true" aria-labelledby="dlg-title">
    <h2 id="dlg-title">${esc(row?.title ?? "課題")}</h2>
    <p class="prose">${esc(row?.instructions ?? "")}</p>
    ${textField("as-answer", "答え", row?.answer ?? "", { multiline: true, maxlength: 8000, rows: 8 })}
    <div class="dialog-actions">
      <button type="button" class="btn text" data-action="close">キャンセル</button>
      <button class="btn filled" type="submit">提出</button>
    </div>
  </form>`;
}

function parseTags(raw: string): string[] | string {
  const tags: string[] = [];
  for (const part of raw.split(/[,、]/)) {
    const tag = part.trim();
    if (!tag || tags.includes(tag)) continue;
    if (tag.length > 24) return "タグは1つ24文字までです";
    tags.push(tag);
  }
  if (tags.length > 16) return "タグは16個までです";
  return tags;
}

function isDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isKind(value: string): value is ResourceKind {
  return value === "article" || value === "video" || value === "other";
}

function openTarget(action: string, id: string | null): void {
  if (action === "open-expression") state.dialog = { kind: "expression", id };
  else if (action === "open-resource") state.dialog = { kind: "resource", id };
  else if (action === "open-question") state.dialog = { kind: "question", id };
  else state.dialog = { kind: "essay", id };
  state.menuOpen = false;
  emit();
}

export function bindEnglish(): void {
  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const el = target.closest<HTMLElement>("[data-action]");
    if (!el) return;
    void onAction(el.dataset.action ?? "", el);
  });
  document.addEventListener("submit", (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;
    if (!form.dataset.form) return;
    event.preventDefault();
    void onSubmit(form.dataset.form);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (state.dialog) {
      state.dialog = null;
      emit();
      return;
    }
    if (state.menuOpen) {
      state.menuOpen = false;
      emit();
    }
  });
  bindSpeaking();
  window.addEventListener("hashchange", () => {
    const name = location.hash.replace(/^#\/?/, "") || "home";
    if (!isEngScreen(name) || name === state.screen) return;
    state.screen = name;
    state.menuOpen = false;
    state.dialog = null;
    emit();
  });
}

async function onAction(action: string, el: HTMLElement): Promise<void> {
  if (await handleSpeakingAction(action, el)) return;
  if (action === "menu") {
    state.menuOpen = !state.menuOpen;
    emit();
    return;
  }
  if (action === "close-menu") {
    state.menuOpen = false;
    emit();
    return;
  }
  if (action === "close") {
    state.dialog = null;
    emit();
    return;
  }
  if (action === "go") {
    const screen = el.dataset.screen ?? "";
    if (!isEngScreen(screen)) return;
    if (el.dataset.reset === "1") {
      state.expressionFilter = "all";
      state.resourceFilter = "all";
      state.questionFilter = "all";
      state.essayFilter = "all";
      state.assignmentFilter = "all";
    }
    state.highlightId = el.dataset.id ?? null;
    setScreen(screen);
    return;
  }
  if (action === "filter") {
    setFilter(el.dataset.group ?? "", el.dataset.value ?? "");
    return;
  }
  if (action === "fab") {
    if (state.screen === "home") state.dialog = { kind: "add-menu" };
    else if (state.screen === "expressions") state.dialog = { kind: "expression", id: null };
    else if (state.screen === "resources") state.dialog = { kind: "resource", id: null };
    else if (state.screen === "questions") state.dialog = { kind: "question", id: null };
    else if (state.screen === "essays") state.dialog = { kind: "essay", id: null };
    state.menuOpen = false;
    emit();
    return;
  }
  if (action === "open-expression" || action === "open-resource" || action === "open-question" || action === "open-essay") {
    openTarget(action, el.dataset.id || null);
    return;
  }
  if (action === "open-answer") {
    state.dialog = { kind: "answer", id: el.dataset.id ?? "" };
    emit();
    return;
  }
  if (action === "open-delete") {
    const target = el.dataset.target;
    if (!isDeleteTarget(target)) return;
    state.dialog = { kind: "confirm-delete", target, id: el.dataset.id ?? "", label: el.dataset.label ?? "これ" };
    emit();
    return;
  }
  if (action === "confirm-delete") {
    const dialog = state.dialog;
    if (!dialog || dialog.kind !== "confirm-delete") return;
    setBusy(true);
    const result = await deleteEnglish(dialog.target, dialog.id);
    setBusy(false);
    if (!result.ok) return showToast(result.error);
    state.dialog = null;
    emit();
    showToast("削除しました");
    return;
  }
  if (action === "pick-kind") {
    const kind = el.dataset.kind ?? "other";
    const hidden = document.getElementById("rs-kind");
    if (hidden instanceof HTMLInputElement) hidden.value = kind;
    document.querySelectorAll<HTMLButtonElement>('[data-action="pick-kind"]').forEach((btn) => {
      btn.setAttribute("aria-pressed", btn.dataset.kind === kind ? "true" : "false");
    });
    return;
  }
  if (action === "reset-demo") {
    resetEnglishDemo();
    state.dialog = null;
    state.menuOpen = false;
    setScreen("home");
    showToast("サンプルに戻しました");
    return;
  }
  if (action === "magic") {
    const email = value("auth-email").trim();
    state.authEmail = email;
    if (!email) return showToast("先にメールアドレスを入れてください");
    setBusy(true);
    const result = await signInMagic(email);
    setBusy(false);
    state.authNotice = result.ok ? "ログイン用のメールを送りました。届いたリンクを開いてください。" : result.error;
    emit();
    return;
  }
  if (action === "sign-out") {
    await stopSpeaking("leave");
    await signOut();
    state.menuOpen = false;
    emit();
    showToast("ログアウトしました");
    return;
  }
  if (action === "reload") {
    state.menuOpen = false;
    await reloadSilent();
    showToast(state.connected && !state.loadError ? "読み直しました" : "読み直せませんでした");
  }
}

function setFilter(group: string, valueText: string): void {
  if (group === "expression" && (valueText === "all" || valueText === "today")) state.expressionFilter = valueText;
  else if (
    group === "resource" &&
    (valueText === "all" || valueText === "today" || valueText === "article" || valueText === "video" || valueText === "other")
  ) {
    state.resourceFilter = valueText;
  } else if (group === "question" && (valueText === "all" || valueText === "open" || valueText === "answered")) {
    state.questionFilter = valueText;
  } else if (group === "essay" && (valueText === "all" || valueText === "pending" || valueText === "corrected")) {
    state.essayFilter = valueText;
  } else if (
    group === "assignment" &&
    (valueText === "all" || valueText === "assigned" || valueText === "submitted" || valueText === "reviewed")
  ) {
    state.assignmentFilter = valueText;
  } else return;
  emit();
}

function isDeleteTarget(value: string | undefined): value is DeleteTarget {
  return (
    value === "expression" ||
    value === "resource" ||
    value === "question" ||
    value === "essay" ||
    value === "assignment" ||
    value === "speaking" ||
    value === "pronunciation"
  );
}

async function onSubmit(form: string): Promise<void> {
  if (form === "login") {
    const email = value("auth-email").trim();
    const password = value("auth-password");
    state.authEmail = email;
    if (!email || !password) return showToast("メールアドレスとパスワードを入れてください");
    setBusy(true);
    const result = await signInPassword(email, password);
    setBusy(false);
    if (!result.ok) {
      state.authNotice = result.error;
      emit();
      return;
    }
    emit();
    showToast("ログインしました");
    return;
  }
  if (form === "expression") {
    const term = value("ex-term").trim();
    const meaning = value("ex-meaning").trim();
    const example = value("ex-example").trim();
    const learned = value("ex-date");
    const tags = parseTags(value("ex-tags"));
    if (!term || !meaning) return showToast("表現と意味を入力してください");
    if (term.length > 200 || meaning.length > 1000) return showToast("表現は200文字、意味は1000文字までです");
    if (example.length > 2000) return showToast("例文は2000文字までです");
    if (!isDate(learned)) return showToast("日付を選んでください");
    if (typeof tags === "string") return showToast(tags);
    const id = state.dialog && state.dialog.kind === "expression" ? state.dialog.id : null;
    setBusy(true);
    const result = await saveExpression(id, { term, meaning, example: example || null, tags, learned_on: learned });
    setBusy(false);
    if (!result.ok) return showToast(result.error);
    state.dialog = null;
    emit();
    showToast("保存しました");
    return;
  }
  if (form === "resource") {
    const url = value("rs-url").trim();
    const title = value("rs-title").trim();
    const kind = value("rs-kind");
    const note = value("rs-note").trim();
    const recorded = value("rs-date");
    if (!url || !title) return showToast("URLとタイトルを入力してください");
    if (!/^https?:\/\/\S+$/i.test(url) || url.length > 2000) return showToast("URLは http:// または https:// で始めてください");
    if (title.length > 300) return showToast("タイトルは300文字までです");
    if (note.length > 2000) return showToast("メモは2000文字までです");
    if (!isKind(kind) || !isDate(recorded)) return showToast("種類と日付を確認してください");
    const id = state.dialog && state.dialog.kind === "resource" ? state.dialog.id : null;
    setBusy(true);
    const result = await saveResource(id, { url, title, kind, note: note || null, recorded_on: recorded });
    setBusy(false);
    if (!result.ok) return showToast(result.error);
    state.dialog = null;
    emit();
    showToast("保存しました");
    return;
  }
  if (form === "question") {
    const question = value("q-body").trim();
    if (!question) return showToast("質問を入力してください");
    if (question.length > 4000) return showToast("質問は4000文字までです");
    const id = state.dialog && state.dialog.kind === "question" ? state.dialog.id : null;
    setBusy(true);
    const result = await saveQuestion(id, question);
    setBusy(false);
    if (!result.ok) return showToast(result.error);
    state.dialog = null;
    emit();
    showToast(id ? "保存しました" : "質問を送りました");
    return;
  }
  if (form === "essay") {
    const title = value("es-title").trim();
    const original = value("es-body").trim();
    if (!title || !original) return showToast("タイトルと英文を入力してください");
    if (title.length > 80) return showToast("タイトルは80文字までです");
    if (original.length > 8000) return showToast("英文は8000文字までです");
    const id = state.dialog && state.dialog.kind === "essay" ? state.dialog.id : null;
    setBusy(true);
    const result = await saveEssay(id, { title, original_text: original });
    setBusy(false);
    if (!result.ok) return showToast(result.error);
    state.dialog = null;
    emit();
    showToast(id ? "保存しました" : "作文を提出しました");
    return;
  }
  if (form === "answer") {
    const answer = value("as-answer").trim();
    if (!answer) return showToast("答えを入力してください");
    if (answer.length > 8000) return showToast("答えは8000文字までです");
    const id = state.dialog && state.dialog.kind === "answer" ? state.dialog.id : "";
    if (!id) return;
    setBusy(true);
    const result = await submitAssignment(id, answer);
    setBusy(false);
    if (!result.ok) return showToast(result.error);
    state.dialog = null;
    emit();
    showToast("提出しました");
  }
}
