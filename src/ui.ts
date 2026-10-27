import {
  createBlock,
  createRequest,
  deleteBlock,
  deleteLog,
  deleteTodo,
  deleteTravel,
  deleteWish,
  logMark,
  reloadSilent,
  resetDemoData,
  saveSettings,
  saveTodo,
  saveTravel,
  saveWish,
  setBlockStatus,
  setTodoStatus,
  setWishDone,
  signInMagic,
  signInPassword,
  signOut,
  updateBlock,
} from "./api";
import { DEFAULT_SETTINGS } from "./defaults";
import { CATEGORIES, RANKS, WISH_CATEGORIES, categoryLabel, isCategory, statusLabel, wishCategoryLabel } from "./labels";
import { emit, isScreen, state } from "./state";
import {
  DAY_MINUTES,
  ROW_H,
  addDays,
  formatClock,
  formatStamp,
  minutesToTime,
  shortMonthDay,
  timeChoices,
  timeToMinutes,
  todayTokyo,
  tokyoDate,
  tokyoNowMinutes,
  tokyoParts,
  tokyoStamp,
} from "./time";
import type { BlockStatus, Category, ScheduleBlock, Screen, Settings, WakeSleepType } from "./types";

const ICON_MENU =
  '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M4 8.5h16M4 15.5h11" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';
const ICON_CLOSE =
  '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M7 7l10 10M17 7L7 17" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';

const scrollTops = new Map<string, number>();
let toastTimer = 0;
let ignoreClickUntil = 0;

function esc(value: string | null | undefined): string {
  return (value ?? "").replace(/[&<>"']/g, (ch) =>
    ch === "&" ? "&amp;" : ch === "<" ? "&lt;" : ch === ">" ? "&gt;" : ch === '"' ? "&quot;" : "&#39;",
  );
}

function chevron(dir: "left" | "right"): string {
  const d = dir === "left" ? "M14 6 L8 12 L14 18" : "M10 6 L16 12 L10 18";
  return `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="${d}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

function value(id: string): string {
  const el = document.getElementById(id);
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
    return el.value;
  }
  return "";
}

export function showToast(message: string): void {
  state.toast = message;
  paintToast();
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    state.toast = null;
    paintToast();
  }, 2600);
}

function paintToast(): void {
  document.querySelector(".toast")?.remove();
  if (!state.toast) return;
  const el = document.createElement("div");
  el.className = "toast";
  el.setAttribute("role", "status");
  el.textContent = state.toast;
  document.getElementById("app")?.appendChild(el);
}

function setBusy(busy: boolean): void {
  document.querySelectorAll<HTMLButtonElement>("#app button").forEach((btn) => {
    btn.disabled = busy;
  });
}

function preferredScroll(date: string): number {
  const blocks = state.blocks
    .filter((b) => b.date === date)
    .sort((a, b) => timeToMinutes(a.start_time) - timeToMinutes(b.start_time));
  if (date === todayTokyo()) {
    const now = tokyoNowMinutes();
    if (now >= 6 * 60 && now <= 22 * 60 + 30) return Math.max(0, now - 40);
  }
  const wake = state.logs.find((l) => l.type === "wake" && tokyoDate(l.logged_at) === date);
  if (wake) return Math.max(0, timeToMinutes(formatClock(new Date(wake.logged_at))) - 20);
  if (blocks[0]) return Math.max(0, timeToMinutes(blocks[0].start_time) - 40);
  return 7 * 60;
}

function restoreScroll(el: HTMLElement): void {
  const key = el.dataset.keepScroll ?? "";
  if (key === "calendar" && state.jumpNowMinutes != null) {
    el.scrollTop = (state.jumpNowMinutes / 10) * ROW_H;
    state.jumpNowMinutes = null;
    state.pendingAutoScroll = false;
  } else if (key === "calendar" && state.pendingAutoScroll) {
    el.scrollTop = (preferredScroll(state.date) / 10) * ROW_H;
    state.pendingAutoScroll = false;
  } else {
    el.scrollTop = scrollTops.get(key) ?? 0;
  }
  scrollTops.set(key, el.scrollTop);
}

export function render(): void {
  const root = document.getElementById("app");
  if (!root) return;
  const old = root.querySelector<HTMLElement>("[data-keep-scroll]");
  if (old?.dataset.keepScroll) scrollTops.set(old.dataset.keepScroll, old.scrollTop);
  root.innerHTML = state.booting ? splash() : shell();
  const next = root.querySelector<HTMLElement>("[data-keep-scroll]");
  if (next) restoreScroll(next);
  paintToast();
}

function splash(): string {
  return `<div class="splash"><div class="splash-mark">LM</div><div class="splash-name">LIFEMANAGER</div></div>`;
}

function shell(): string {
  return `${state.menuOpen ? '<button type="button" class="backdrop" data-action="close-menu" aria-label="メニューを閉じる"></button>' : ""}${drawer()}${screen()}${sheetHtml()}`;
}

function screen(): string {
  if (state.screen === "calendar") return calendarScreen();
  if (state.screen === "requests") return requestsPage();
  if (state.screen === "wishes") return wishesPage();
  if (state.screen === "todos") return todosPage();
  if (state.screen === "travel") return travelPage();
  return settingsPage();
}

function page(title: string, sub: string, body: string): string {
  return `<section class="screen">
    <header class="top">
      <button type="button" class="icon-btn" data-action="menu" aria-label="メニュー" aria-expanded="${state.menuOpen}" aria-controls="drawer">${ICON_MENU}</button>
      <div><h1>${title}</h1><p>${sub}</p></div>
    </header>
    <div class="page" data-keep-scroll="${state.screen}">${body}</div>
  </section>`;
}

function drawer(): string {
  const name = state.settings?.display_name || "XOLDA";
  const mode =
    state.mode === "demo" ? "デモ" : state.email ? (state.connected ? "同期中" : "未同期") : "未ログイン";
  const openRequests = state.requests.filter((r) => r.status === "open").length;
  const openTodos = state.todos.filter((t) => t.status === "open").length;
  const items: { screen: Screen; title: string; sub: string; badge?: number }[] = [
    { screen: "calendar", title: "今日の予定", sub: "10分ごとの1日" },
    { screen: "requests", title: "修正の要望", sub: "いま変えたいこと", badge: openRequests },
    { screen: "wishes", title: "小さなやりたいこと", sub: "食事、カラオケ、ゲーム" },
    { screen: "todos", title: "Todo", sub: "A・B・C", badge: openTodos },
    { screen: "travel", title: "移動時間", sub: "場所から場所へ" },
    { screen: "settings", title: "設定", sub: "ログインと数字" },
  ];
  return `<nav class="drawer${state.menuOpen ? " open" : ""}" id="drawer" ${state.menuOpen ? "" : "inert"}>
    <div class="drawer-top">
      <div class="word">LIFEMANAGER</div>
      <button type="button" class="icon-btn" data-action="close-menu" aria-label="閉じる">${ICON_CLOSE}</button>
    </div>
    <div class="who">${esc(name)}</div>
    <div class="mode-line">${mode}</div>
    ${items
      .map(
        (item) => `<button type="button" class="nav-item${state.screen === item.screen ? " active" : ""}" data-action="nav" data-screen="${item.screen}">
          <span><strong>${item.title}</strong><small>${item.sub}</small></span>
          ${item.badge ? `<em class="badge">${item.badge}</em>` : ""}
        </button>`,
      )
      .join("")}
    <div class="drawer-foot">Asia/Tokyo</div>
  </nav>`;
}

function calendarScreen(): string {
  const parts = tokyoParts(new Date(`${state.date}T12:00:00+09:00`));
  const isToday = state.date === todayTokyo();
  const blocks = dayBlocks();
  const logs = dayLogs();
  const done = blocks.filter((b) => b.status === "done").length;
  const skipped = blocks.filter((b) => b.status === "skipped").length;
  const wake = latestMark(logs, "wake");
  const sleep = latestMark(logs, "sleep");
  const loggedOut = state.mode === "live" && !state.email;
  return `<section class="screen">
    <header class="cal-head">
      <button type="button" class="icon-btn" data-action="menu" aria-label="メニュー" aria-expanded="${state.menuOpen}" aria-controls="drawer">${ICON_MENU}</button>
      <div class="date-hero">
        <div class="brand">LIFEMANAGER</div>
        <div class="date-row">
          <button type="button" class="arrow" data-action="prev" aria-label="前の日">${chevron("left")}</button>
          <div class="date-nums"><span class="month-num">${Number(parts.month)}</span><span class="slash">/</span><span class="day-num">${Number(parts.day)}</span></div>
          <button type="button" class="arrow" data-action="next" aria-label="次の日">${chevron("right")}</button>
        </div>
        <p class="sub">${esc(parts.year)} · ${esc(parts.weekday)}曜日${isToday ? ` · <button type="button" class="sub-btn" data-action="jump-now" id="now-clock">いま ${formatClock()}</button>` : ""}</p>
      </div>
      <button type="button" class="today-btn" data-action="today">今日</button>
    </header>
    <div class="stats">
      <span>${blocks.length} 予定</span><span>${done} 完了</span><span>${skipped} 見送り</span>
      <span>起床 ${wake ?? "未記録"}</span><span>就寝 ${sleep ?? "未記録"}</span>
    </div>
    <p class="hint">行をタップで起床・就寝。予定をタップでチェック。</p>
    ${
      loggedOut
        ? `<div class="gate" data-keep-scroll="calendar">
            <p class="gate-kicker">LIFEMANAGER</p>
            <h2>ログインすると、予定がここに並びます。</h2>
            <p>Supabaseのユーザーは一人だけです。設定からメールで入ります。</p>
            <button type="button" class="btn primary" data-action="nav" data-screen="settings">ログインへ</button>
          </div>`
        : `<div class="cal-scroll" data-keep-scroll="calendar">${grid(blocks, logs, isToday)}</div>
           <div class="now-actions">
             <button type="button" data-action="wake-now">いま起床</button>
             <button type="button" data-action="sleep-now">いま就寝</button>
           </div>`
    }
  </section>`;
}

function dayBlocks(): ScheduleBlock[] {
  return state.blocks
    .filter((b) => b.date === state.date)
    .sort((a, b) => timeToMinutes(a.start_time) - timeToMinutes(b.start_time));
}

function dayLogs() {
  return state.logs
    .filter((l) => tokyoDate(l.logged_at) === state.date)
    .sort((a, b) => new Date(a.logged_at).getTime() - new Date(b.logged_at).getTime());
}

function latestMark(logs: { type: WakeSleepType; logged_at: string }[], type: WakeSleepType): string | null {
  const found = logs.filter((l) => l.type === type);
  if (!found.length) return null;
  return formatClock(new Date(found[found.length - 1].logged_at));
}

function grid(blocks: ScheduleBlock[], logs: ReturnType<typeof dayLogs>, isToday: boolean): string {
  const hours = Array.from({ length: 24 }, (_, hour) => {
    return `<div class="hour" style="top:${hour * 6 * ROW_H}px">${String(hour).padStart(2, "0")}</div>`;
  }).join("");
  const placed = placeBlocks(blocks);
  const now = tokyoNowMinutes();
  const blockHtml = placed
    .map(({ block, col, cols }) => {
      const start = timeToMinutes(block.start_time);
      const end = timeToMinutes(block.end_time);
      const top = (start / 10) * ROW_H + 2;
      const height = Math.max(((end - start) / 10) * ROW_H - 4, 20);
      const gutter = 58;
      const right = 10;
      const gap = 6;
      const width = `calc((100% - ${gutter + right}px - ${(cols - 1) * gap}px) / ${cols})`;
      const left = `calc(${gutter}px + ${col} * ((100% - ${gutter + right}px - ${(cols - 1) * gap}px) / ${cols} + ${gap}px))`;
      const live = isToday && start <= now && now < end;
      return `<button type="button" class="block st-${block.status}${height < 46 ? " compact" : ""}${live ? " is-now" : ""}" data-cat="${esc(block.category)}" data-action="block" data-id="${esc(block.id)}" style="top:${top}px;height:${height}px;width:${width};left:${left};--edge:${edge(block.category)}" aria-label="${esc(block.title)} ${esc(block.start_time)}から${esc(block.end_time)} ${statusLabel(block.status)}">
        <span class="block-cat">${esc(categoryLabel(block.category))}</span>
        <span class="block-title">${esc(block.title)}</span>
        ${height >= 46 ? `<span class="block-time">${esc(block.start_time)}–${esc(block.end_time)}</span>` : ""}
        ${block.status === "done" ? '<span class="tick">✓</span>' : ""}
      </button>`;
    })
    .join("");
  const used = new Map<number, number>();
  const marks = logs
    .map((log) => {
      const mins = timeToMinutes(formatClock(new Date(log.logged_at)));
      const key = Math.round(mins / 10);
      const lane = used.get(key) ?? 0;
      used.set(key, lane + 1);
      const label = log.type === "wake" ? "起床" : "就寝";
      return `<button type="button" class="mark mark-${log.type}" data-action="mark" data-id="${esc(log.id)}" style="top:${(mins / 10) * ROW_H}px;right:${8 + lane * 78}px">${label} ${esc(formatClock(new Date(log.logged_at)))}</button>`;
    })
    .join("");
  const nowLine = isToday
    ? `<div class="now" id="now-line" style="top:${(now / 10) * ROW_H}px"><span class="now-tag" id="now-tag">${formatClock()}</span></div>`
    : "";
  return `<div class="cal-grid" data-action="grid" style="height:${(DAY_MINUTES / 10) * ROW_H}px;--row:${ROW_H}px">${hours}${blockHtml}${marks}${nowLine}</div><div class="cal-spacer"></div>`;
}

function edge(category: Category): string {
  if (category === "english" || category === "moodle") return "rgba(231,240,255,0.95)";
  if (category === "travel" || category === "buffer" || category === "free") return "rgba(255,255,255,0.28)";
  if (category === "prep" || category === "laundry") return "rgba(255,255,255,0.4)";
  return "rgba(255,255,255,0.72)";
}

function placeBlocks(blocks: ScheduleBlock[]): { block: ScheduleBlock; col: number; cols: number }[] {
  const sorted = [...blocks].sort(
    (a, b) => timeToMinutes(a.start_time) - timeToMinutes(b.start_time) || timeToMinutes(a.end_time) - timeToMinutes(b.end_time),
  );
  const items: { block: ScheduleBlock; col: number; cols: number }[] = [];
  let cluster: { block: ScheduleBlock; col: number }[] = [];
  let colEnds: number[] = [];
  let clusterEnd = -1;
  const flush = () => {
    const cols = Math.max(1, colEnds.length);
    for (const item of cluster) items.push({ ...item, cols });
    cluster = [];
    colEnds = [];
    clusterEnd = -1;
  };
  for (const block of sorted) {
    const start = timeToMinutes(block.start_time);
    const end = timeToMinutes(block.end_time);
    if (cluster.length && start >= clusterEnd) flush();
    let col = colEnds.findIndex((value) => value <= start);
    if (col < 0) {
      col = colEnds.length;
      colEnds.push(end);
    } else colEnds[col] = end;
    cluster.push({ block, col });
    clusterEnd = Math.max(clusterEnd, end);
  }
  flush();
  return items;
}

function sheetHtml(): string {
  const sheet = state.sheet;
  if (!sheet) return "";
  if (sheet.kind === "slot") return wrapSheet(slotSheet(sheet.minutes));
  if (sheet.kind === "block") {
    const block = state.blocks.find((b) => b.id === sheet.id);
    if (!block) return "";
    return wrapSheet(blockSheet(block));
  }
  const log = state.logs.find((l) => l.id === sheet.id);
  if (!log) return "";
  const label = log.type === "wake" ? "起床" : "就寝";
  return wrapSheet(`<h2>${label}</h2><p class="meta">${esc(formatStamp(log.logged_at))}</p>
    <button type="button" class="btn danger" data-action="delete-log" data-id="${esc(log.id)}" data-danger="log:${esc(log.id)}">${state.pendingDelete === `log:${log.id}` ? "本当に消す" : "この記録を消す"}</button>`);
}

function wrapSheet(inner: string): string {
  return `<div class="sheet-wrap" data-action="close-sheet"><div class="sheet" data-action="noop"><div class="handle"></div>${inner}</div></div>`;
}

function slotSheet(minutes: number): string {
  const start = minutesToTime(minutes);
  const end = minutesToTime(Math.min(DAY_MINUTES, Math.max(minutes + 40, minutes + 10)));
  return `<h2>${start}</h2><p class="meta">${esc(state.date)} · この行に記録する</p>
    <button type="button" class="btn" data-action="log-slot" data-type="wake" data-minutes="${minutes}">この時刻を起床にする</button>
    <button type="button" class="btn" data-action="log-slot" data-type="sleep" data-minutes="${minutes}">この時刻を就寝にする</button>
    <h3>予定を入れる</h3>
    ${blockForm(null, start, end, "", "class", "")}`;
}

function blockSheet(block: ScheduleBlock): string {
  const overlap = hasOverlap(block.id, block.date, block.start_time, block.end_time);
  return `<h2>${esc(block.title)}</h2>
    <p class="meta">${esc(block.start_time)}–${esc(block.end_time)} · ${esc(categoryLabel(block.category))} · ${block.source === "bot" ? "ボット" : "自分"} · ${statusLabel(block.status)}</p>
    <div class="seg" role="group" aria-label="できたか">
      <button type="button" data-action="status" data-id="${esc(block.id)}" data-status="done" class="${block.status === "done" ? "on" : ""}">できた</button>
      <button type="button" data-action="status" data-id="${esc(block.id)}" data-status="skipped" class="${block.status === "skipped" ? "on" : ""}">見送った</button>
      <button type="button" data-action="status" data-id="${esc(block.id)}" data-status="planned" class="${block.status === "planned" ? "on" : ""}">まだ</button>
    </div>
    ${overlap ? '<p class="warn">同じ時間に別の予定があります。重なったまま保存できます。</p>' : ""}
    ${block.notes ? `<p class="meta">${esc(block.notes)}</p>` : ""}
    <h3>内容</h3>
    ${blockForm(block.id, block.start_time, block.end_time, block.title, block.category, block.notes ?? "")}
    <button type="button" class="btn danger" data-action="delete-block" data-id="${esc(block.id)}" data-danger="block:${esc(block.id)}">${state.pendingDelete === `block:${block.id}` ? "本当に消す" : "削除"}</button>`;
}

function blockForm(id: string | null, start: string, end: string, title: string, category: string, notes: string): string {
  return `<form data-form="block">
    ${id ? `<input type="hidden" id="block-id" value="${esc(id)}" />` : ""}
    <label class="field"><span>タイトル</span><input id="block-title" value="${esc(title)}" maxlength="500" required /></label>
    <label class="field"><span>種類</span><select id="block-category">${CATEGORIES.map((c) => `<option value="${c.id}"${c.id === category ? " selected" : ""}>${esc(c.label)}</option>`).join("")}</select></label>
    <div class="row-2">
      <label class="field"><span>開始</span><select id="block-start">${timeOptions(false, start)}</select></label>
      <label class="field"><span>終了</span><select id="block-end">${timeOptions(true, end)}</select></label>
    </div>
    <label class="field"><span>メモ</span><textarea id="block-notes" placeholder="教室、持っていくもの">${esc(notes)}</textarea></label>
    <button class="btn primary" type="submit">保存する</button>
  </form>`;
}

function timeOptions(end: boolean, current: string): string {
  return timeChoices(end)
    .map((t) => `<option value="${t}"${t === current ? " selected" : ""}>${t}</option>`)
    .join("");
}

function hasOverlap(id: string | null, date: string, start: string, end: string): boolean {
  const s = timeToMinutes(start);
  const e = timeToMinutes(end);
  return state.blocks.some((b) => b.date === date && b.id !== id && timeToMinutes(b.start_time) < e && s < timeToMinutes(b.end_time));
}

function requestsPage(): string {
  const list = [...state.requests].sort((a, b) => b.created_at.localeCompare(a.created_at));
  const cards = list.length
    ? list
        .map(
          (req) => `<article class="note">
            <div style="display:flex;justify-content:space-between;gap:8px;align-items:center">
              <span class="pill${req.status === "open" ? " open" : ""}">${req.status === "open" ? "未対応" : "対応済"}</span>
              <span class="card-meta">${esc(formatStamp(req.created_at))}</span>
            </div>
            <p>${esc(req.body)}</p>
            ${req.bot_response ? `<div class="reply"><b>BOT</b>${esc(req.bot_response)}</div>` : req.status === "open" ? '<p class="card-meta">まだ返事はありません</p>' : ""}
          </article>`,
        )
        .join("")
    : '<p class="empty">まだ要望はありません。</p>';
  return page(
    "修正の要望",
    "いまの予定を変えたいことを、そのまま書く",
    `<form data-form="request">
      <label class="field"><span>要望</span><textarea id="req-body" placeholder="例: 今日の英語を夜にずらして。サークルが延びそう" required></textarea></label>
      <button class="btn primary" type="submit">送る</button>
    </form>${cards}`,
  );
}

function wishesPage(): string {
  const editing = state.wishes.find((w) => w.id === state.editingWish);
  const open = state.wishes.filter((w) => !w.done);
  const done = state.wishes.filter((w) => w.done);
  return page(
    "小さなやりたいこと",
    "飲食店、一人カラオケ、ゲーム。予定に入れるかはボットが決める",
    `${wishForm(editing?.id ?? "", editing?.title ?? "", editing?.category ?? "restaurant", editing?.notes ?? "")}
    ${wishCards(open)}
    ${done.length ? `<div class="group-head"><h2>できた</h2></div>${wishCards(done)}` : ""}`,
  );
}

function wishForm(id: string, title: string, category: string, notes: string): string {
  return `<form data-form="wish">
    <input type="hidden" id="wish-id" value="${esc(id)}" />
    <label class="field"><span>やりたいこと</span><input id="wish-title" value="${esc(title)}" placeholder="例: 一人カラオケ" required /></label>
    <label class="field"><span>種類</span><select id="wish-category">${WISH_CATEGORIES.map((c) => `<option value="${c.id}"${c.id === category ? " selected" : ""}>${esc(c.label)}</option>`).join("")}</select></label>
    <label class="field"><span>メモ</span><textarea id="wish-notes">${esc(notes)}</textarea></label>
    <button class="btn primary" type="submit">${id ? "更新する" : "追加する"}</button>
    ${id ? '<button type="button" class="btn ghost" data-action="cancel-wish">キャンセル</button>' : ""}
  </form>`;
}

function wishCards(items: typeof state.wishes): string {
  if (!items.length) return '<p class="empty">まだありません。</p>';
  return items
    .map((wish) => {
      const danger = `wish:${wish.id}`;
      return `<article class="card${wish.done ? " is-done" : ""}">
        <button type="button" class="icon-hit" data-action="toggle-wish" data-id="${esc(wish.id)}" aria-label="${wish.done ? "未了に戻す" : "できた"}"><span class="dot-check${wish.done ? " on" : ""}">${wish.done ? "✓" : ""}</span></button>
        <div><div class="card-title">${esc(wish.title)}</div><div class="card-meta">${esc(wishCategoryLabel(wish.category))}${wish.notes ? ` · ${esc(wish.notes)}` : ""}</div></div>
        <div class="card-actions">
          <button type="button" class="text-btn" data-action="edit-wish" data-id="${esc(wish.id)}">編集</button>
          <button type="button" class="text-btn danger" data-action="delete-wish" data-id="${esc(wish.id)}" data-danger="${danger}">${state.pendingDelete === danger ? "本当に消す" : "削除"}</button>
        </div>
      </article>`;
    })
    .join("");
}

function todosPage(): string {
  const editing = state.todos.find((t) => t.id === state.editingTodo);
  const groups = RANKS.map((rank) => {
    const items = state.todos
      .filter((t) => t.rank === rank.id)
      .sort((a, b) => Number(a.status === "done") - Number(b.status === "done") || (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999"));
    return `<div class="group-head"><div class="rank-letter">${rank.id}</div><h2>${rank.hint}</h2><span>${items.filter((t) => t.status === "open").length}</span></div>
      ${items.length ? items.map(todoCard).join("") : '<p class="empty">ありません。</p>'}`;
  }).join("");
  return page("Todo", "A がいま必要。B、C の順であとまわし", `${todoForm(editing)}${groups}`);
}

function todoForm(editing: (typeof state.todos)[number] | undefined): string {
  const rank = editing?.rank ?? "A";
  return `<form data-form="todo">
    <input type="hidden" id="todo-id" value="${esc(editing?.id ?? "")}" />
    <label class="field"><span>やること</span><input id="todo-title" value="${esc(editing?.title ?? "")}" placeholder="例: レポートの参考文献を探す" required /></label>
    <div class="field"><span>ランク</span>
      <div class="seg" role="radiogroup" aria-label="ランク">
        ${RANKS.map((r) => `<button type="button" data-action="pick-rank" data-rank="${r.id}" class="${r.id === rank ? "on" : ""}" aria-pressed="${r.id === rank}">${r.id}</button>`).join("")}
      </div>
      <input type="hidden" id="todo-rank" value="${rank}" />
    </div>
    <p class="field-hint" id="rank-hint">${RANKS.find((r) => r.id === rank)?.hint ?? ""}</p>
    <div class="row-2">
      <label class="field"><span>期限</span><input id="todo-due" type="date" value="${esc(editing?.due_date ?? "")}" /></label>
      <label class="field"><span>分数</span><input id="todo-minutes" type="number" inputmode="numeric" min="10" max="600" step="10" value="${editing?.estimated_minutes ?? ""}" placeholder="40" /></label>
    </div>
    <label class="field"><span>メモ</span><textarea id="todo-notes">${esc(editing?.notes ?? "")}</textarea></label>
    <button class="btn primary" type="submit">${editing ? "更新する" : "追加する"}</button>
    ${editing ? '<button type="button" class="btn ghost" data-action="cancel-todo">キャンセル</button>' : ""}
  </form>`;
}

function todoCard(todo: (typeof state.todos)[number]): string {
  const danger = `todo:${todo.id}`;
  const overdue = todo.due_date && todo.due_date < todayTokyo() && todo.status === "open";
  const bits = [
    todo.due_date ? `${shortMonthDay(todo.due_date)}まで` : "",
    todo.estimated_minutes ? `${todo.estimated_minutes}分` : "",
    todo.notes ?? "",
  ].filter(Boolean);
  return `<article class="card${todo.status === "done" ? " is-done" : ""}">
    <button type="button" class="icon-hit" data-action="toggle-todo" data-id="${esc(todo.id)}" aria-label="${todo.status === "done" ? "未了に戻す" : "できた"}"><span class="dot-check${todo.status === "done" ? " on" : ""}">${todo.status === "done" ? "✓" : ""}</span></button>
    <div><div class="card-title">${esc(todo.title)}</div><div class="card-meta${overdue ? " overdue" : ""}">${esc(bits.join(" · "))}</div></div>
    <div class="card-actions">
      <button type="button" class="text-btn" data-action="edit-todo" data-id="${esc(todo.id)}">編集</button>
      <button type="button" class="text-btn danger" data-action="delete-todo" data-id="${esc(todo.id)}" data-danger="${danger}">${state.pendingDelete === danger ? "本当に消す" : "削除"}</button>
    </div>
  </article>`;
}

function travelPage(): string {
  const editing = state.travels.find((t) => t.id === state.editingTravel);
  const cards = [...state.travels]
    .sort((a, b) => a.from_place.localeCompare(b.from_place, "ja") || a.to_place.localeCompare(b.to_place, "ja"))
    .map((trip) => {
      const danger = `travel:${trip.id}`;
      return `<article class="card travel-card">
        <div><div class="card-title">${esc(trip.from_place)} → ${esc(trip.to_place)}</div><div class="card-meta">${trip.minutes}分${trip.notes ? ` · ${esc(trip.notes)}` : ""}</div></div>
        <div class="card-actions">
          <button type="button" class="text-btn" data-action="edit-travel" data-id="${esc(trip.id)}">編集</button>
          <button type="button" class="text-btn danger" data-action="delete-travel" data-id="${esc(trip.id)}" data-danger="${danger}">${state.pendingDelete === danger ? "本当に消す" : "削除"}</button>
        </div>
      </article>`;
    })
    .join("");
  return page(
    "移動時間",
    "家から大学は20分、サークルは30分が最初の目安",
    `<p class="card-meta">登校前の準備はここではなく、設定の「準備」です。ボットは移動の分数を読んで、予定に移動ブロックを置きます。</p>
    <form data-form="travel">
      <input type="hidden" id="travel-id" value="${esc(editing?.id ?? "")}" />
      <div class="row-2">
        <label class="field"><span>出発</span><input id="travel-from" value="${esc(editing?.from_place ?? "")}" placeholder="家" required /></label>
        <label class="field"><span>到着</span><input id="travel-to" value="${esc(editing?.to_place ?? "")}" placeholder="早稲田大学" required /></label>
      </div>
      <label class="field"><span>分数</span><input id="travel-minutes" type="number" inputmode="numeric" min="1" max="1440" value="${editing?.minutes ?? ""}" required /></label>
      <label class="field"><span>メモ</span><input id="travel-notes" value="${esc(editing?.notes ?? "")}" /></label>
      <button class="btn primary" type="submit">${editing ? "更新する" : "追加する"}</button>
      ${editing ? '<button type="button" class="btn ghost" data-action="cancel-travel">キャンセル</button>' : ""}
    </form>
    ${cards || '<p class="empty">まだ区間がありません。</p>'}`,
  );
}

function settingsPage(): string {
  return page("設定", "ログインと、ボットが読む数字", `${accountCard()}${state.settings ? settingsForm(state.settings) : ""}${installCard()}`);
}

function accountCard(): string {
  if (state.mode === "demo") {
    return `<section class="note"><p class="kicker">DEMO</p><p>サンプルの予定が、この端末の中だけに入っています。Supabaseにつなぐと、スマホとボットが同じデータを使います。手順は README にあります。</p>
      <button type="button" class="btn ghost" data-action="reset-demo">サンプルに戻す</button></section>
      ${state.authNotice ? `<p class="warn">${esc(state.authNotice)}</p>` : ""}`;
  }
  if (!state.email) {
    return `<section class="note"><p class="kicker">LOGIN</p>
      <p>Supabaseで作った、あなた一人のユーザーで入ります。</p>
      ${state.authNotice ? `<p class="warn">${esc(state.authNotice)}</p>` : ""}
      <form data-form="login">
        <label class="field"><span>メール</span><input id="auth-email" type="email" inputmode="email" autocomplete="username" value="${esc(state.authEmail)}" required /></label>
        <label class="field"><span>パスワード</span><input id="auth-password" type="password" autocomplete="current-password" required /></label>
        <button class="btn primary" type="submit">ログイン</button>
      </form>
      <button type="button" class="btn ghost" data-action="magic">メールでログインリンクを送る</button>
      <p class="card-meta">リンクを使うときは、Supabaseの Site URL をこのアプリのURLにしてから開いてください。</p>
    </section>`;
  }
  return `<section class="note"><p class="kicker">${state.connected ? "SYNC" : "OFFLINE"}</p>
    <p>ログイン中<br />${esc(state.email)}</p>
    ${state.authNotice ? `<p class="warn">${esc(state.authNotice)}</p>` : ""}
    <button type="button" class="btn ghost" data-action="reload">読み直す</button>
    <button type="button" class="btn ghost" data-action="sign-out">ログアウト</button>
  </section>`;
}

function settingsForm(settings: Settings): string {
  const fields: { id: string; label: string; value: number; min: number; max: number; step: number }[] = [
    { id: "set-buffer", label: "1日の余白（分）", value: settings.buffer_minutes_per_day, min: 0, max: 1440, step: 10 },
    { id: "set-prep", label: "登校前の準備（分）", value: settings.prep_minutes, min: 0, max: 600, step: 10 },
    { id: "set-english", label: "英語学習（分）", value: settings.english_minutes_per_day, min: 0, max: 600, step: 10 },
    { id: "set-meal", label: "食事（分）", value: settings.meal_minutes, min: 0, max: 300, step: 10 },
    { id: "set-bath", label: "風呂（分）", value: settings.bath_minutes, min: 0, max: 300, step: 10 },
    { id: "set-laundry", label: "洗濯の間隔（日）", value: settings.laundry_interval_days, min: 1, max: 30, step: 1 },
    { id: "set-hours", label: "起床から予定を組む時間", value: settings.day_length_hours, min: 8, max: 24, step: 1 },
  ];
  return `<form data-form="settings">
    <p class="kicker">BOT</p>
    <p class="card-meta">ここにある数字は、ボットが朝の予定を組むときに読みます。移動と準備を除いて、余白をこの分数以上とります。</p>
    <label class="field"><span>表示名</span><input id="set-name" value="${esc(settings.display_name)}" maxlength="40" required /></label>
    <div class="field"><span>タイムゾーン</span><div class="readonly">Asia/Tokyo</div></div>
    ${fields
      .map(
        (field) =>
          `<label class="field"><span>${field.label}</span><input id="${field.id}" type="number" inputmode="numeric" min="${field.min}" max="${field.max}" step="${field.step}" value="${field.value}" required /></label>`,
      )
      .join("")}
    <button class="btn primary" type="submit">保存する</button>
  </form>`;
}

function installCard(): string {
  return `<section class="note"><p class="kicker">IPHONE</p><p>Safariの共有ボタンから「ホーム画面に追加」を選ぶと、全画面のアプリとして開けます。</p></section>`;
}

function isFuture(date: string, minutes: number): boolean {
  const today = todayTokyo();
  if (date > today) return true;
  if (date < today) return false;
  return minutes > tokyoNowMinutes() + 5;
}

function setScreen(screen: Screen): void {
  state.screen = screen;
  state.menuOpen = false;
  state.sheet = null;
  state.pendingDelete = null;
  const next = screen === "calendar" ? "#/" : `#/${screen}`;
  if (location.hash !== next) location.hash = next;
  emit();
}

function shift(delta: number): void {
  state.date = addDays(state.date, delta);
  state.sheet = null;
  state.pendingAutoScroll = true;
  emit();
}

async function onSubmit(kind: string): Promise<void> {
  if (kind === "block") return saveBlockForm();
  if (kind === "request") return saveRequestForm();
  if (kind === "wish") return saveWishForm();
  if (kind === "todo") return saveTodoForm();
  if (kind === "travel") return saveTravelForm();
  if (kind === "settings") return saveSettingsForm();
  if (kind === "login") return loginForm();
}

async function saveBlockForm(): Promise<void> {
  const id = value("block-id");
  const title = value("block-title").trim();
  const category = value("block-category");
  const start = value("block-start");
  const end = value("block-end");
  const notes = value("block-notes").trim();
  if (!title) return showToast("タイトルを入力してください");
  if (!isCategory(category)) return showToast("種類を選び直してください");
  if (timeToMinutes(end) <= timeToMinutes(start)) return showToast("終了は開始よりあとにしてください");
  const input = { date: state.date, start_time: start, end_time: end, title, category, notes: notes || null };
  setBusy(true);
  const result = id ? await updateBlock(id, input) : await createBlock(input);
  setBusy(false);
  if (!result.ok) return showToast(result.error);
  state.sheet = null;
  emit();
  showToast("保存しました");
}

async function saveRequestForm(): Promise<void> {
  const body = value("req-body").trim();
  if (!body) return showToast("要望を書いてください");
  setBusy(true);
  const result = await createRequest(body);
  setBusy(false);
  if (!result.ok) return showToast(result.error);
  emit();
  showToast("送りました");
}

async function saveWishForm(): Promise<void> {
  const id = value("wish-id");
  const title = value("wish-title").trim();
  const category = value("wish-category");
  const notes = value("wish-notes").trim();
  if (!title) return showToast("やりたいことを書いてください");
  setBusy(true);
  const result = await saveWish(id || null, { title, category, notes: notes || null });
  setBusy(false);
  if (!result.ok) return showToast(result.error);
  state.editingWish = null;
  emit();
  showToast(id ? "更新しました" : "追加しました");
}

async function saveTodoForm(): Promise<void> {
  const id = value("todo-id");
  const title = value("todo-title").trim();
  const rank = value("todo-rank");
  const due = value("todo-due");
  const rawMinutes = value("todo-minutes").trim();
  const notes = value("todo-notes").trim();
  if (!title) return showToast("やることを書いてください");
  if (rank !== "A" && rank !== "B" && rank !== "C") return showToast("ランクを選んでください");
  let estimated: number | null = null;
  if (rawMinutes) {
    const n = Number(rawMinutes);
    if (!Number.isInteger(n) || n < 10 || n > 600 || n % 10 !== 0) {
      return showToast("所要時間は10分単位で、10から600までです");
    }
    estimated = n;
  }
  if (due && !/^\d{4}-\d{2}-\d{2}$/.test(due)) return showToast("期限の日付を確認してください");
  setBusy(true);
  const result = await saveTodo(id || null, {
    title,
    rank,
    due_date: due || null,
    estimated_minutes: estimated,
    notes: notes || null,
  });
  setBusy(false);
  if (!result.ok) return showToast(result.error);
  state.editingTodo = null;
  emit();
  showToast(id ? "更新しました" : "追加しました");
}

async function saveTravelForm(): Promise<void> {
  const id = value("travel-id");
  const from = value("travel-from").trim();
  const to = value("travel-to").trim();
  const minutes = Number(value("travel-minutes"));
  const notes = value("travel-notes").trim();
  if (!from || !to) return showToast("出発と到着を入れてください");
  if (from === to) return showToast("出発と到着が同じです");
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440) return showToast("分数は1から1440までです");
  setBusy(true);
  const result = await saveTravel(id || null, { from_place: from, to_place: to, minutes, notes: notes || null });
  setBusy(false);
  if (!result.ok) return showToast(result.error);
  state.editingTravel = null;
  emit();
  showToast(id ? "更新しました" : "追加しました");
}

async function saveSettingsForm(): Promise<void> {
  const name = value("set-name").trim();
  if (!name || name.length > 40) return showToast("表示名は1〜40文字にしてください");
  const read = (id: string, min: number, max: number): number | null => {
    const n = Number(value(id));
    if (!Number.isInteger(n) || n < min || n > max) return null;
    return n;
  };
  const buffer = read("set-buffer", 0, 1440);
  const prep = read("set-prep", 0, 600);
  const english = read("set-english", 0, 600);
  const meal = read("set-meal", 0, 300);
  const bath = read("set-bath", 0, 300);
  const laundry = read("set-laundry", 1, 30);
  const hours = read("set-hours", 8, 24);
  if (buffer == null || prep == null || english == null || meal == null || bath == null || laundry == null || hours == null) {
    return showToast("数字の範囲を確認してください");
  }
  setBusy(true);
  const result = await saveSettings({
    ...DEFAULT_SETTINGS,
    display_name: name,
    timezone: "Asia/Tokyo",
    buffer_minutes_per_day: buffer,
    prep_minutes: prep,
    english_minutes_per_day: english,
    meal_minutes: meal,
    bath_minutes: bath,
    laundry_interval_days: laundry,
    day_length_hours: hours,
  });
  setBusy(false);
  if (!result.ok) return showToast(result.error);
  emit();
  showToast("保存しました");
}

async function loginForm(): Promise<void> {
  const email = value("auth-email").trim();
  const password = value("auth-password");
  state.authEmail = email;
  if (!email || !password) return showToast("メールとパスワードを入れてください");
  setBusy(true);
  const result = await signInPassword(email, password);
  setBusy(false);
  if (!result.ok) {
    state.authNotice = result.error;
    emit();
    return;
  }
  state.authNotice = null;
  state.pendingAutoScroll = true;
  setScreen("calendar");
  showToast("ログインしました");
}

async function addMark(type: WakeSleepType, date: string, minutes: number): Promise<void> {
  if (isFuture(date, minutes)) {
    showToast("これからの時刻には記録できません");
    return;
  }
  setBusy(true);
  const result = await logMark(type, tokyoStamp(date, minutes));
  setBusy(false);
  if (!result.ok) return showToast(result.error);
  state.sheet = null;
  if (date !== state.date) {
    state.date = date;
    state.pendingAutoScroll = true;
  }
  emit();
  showToast(type === "wake" ? "起床を記録しました" : "就寝を記録しました");
}

function armDelete(key: string): boolean {
  if (state.pendingDelete === key) return true;
  state.pendingDelete = key;
  document.querySelectorAll<HTMLButtonElement>("[data-danger]").forEach((btn) => {
    const armed = btn.dataset.danger === key;
    if (btn.dataset.action === "delete-log") btn.textContent = armed ? "本当に消す" : "この記録を消す";
    else btn.textContent = armed ? "本当に消す" : "削除";
  });
  return false;
}

function scrollFormToTop(): void {
  const el = document.querySelector<HTMLElement>("[data-keep-scroll]");
  if (!el) return;
  el.scrollTop = 0;
  if (el.dataset.keepScroll) scrollTops.set(el.dataset.keepScroll, 0);
}

export function bindGlobal(): void {
  document.addEventListener("click", (event) => {
    if (Date.now() < ignoreClickUntil) return;
    pointerY = event.clientY;
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
    if (state.sheet) {
      state.sheet = null;
      emit();
      return;
    }
    if (state.menuOpen) {
      state.menuOpen = false;
      emit();
    }
  });
  window.addEventListener("hashchange", () => {
    const name = location.hash.replace(/^#\/?/, "") || "calendar";
    if (!isScreen(name) || name === state.screen) return;
    state.screen = name;
    state.menuOpen = false;
    state.sheet = null;
    emit();
  });

  let swipe: { x: number; y: number; id: number } | null = null;
  document.addEventListener("pointerdown", (event) => {
    const target = event.target;
    if (!(target instanceof Element) || !target.closest(".cal-scroll")) return;
    if (event.clientX < 28) return;
    swipe = { x: event.clientX, y: event.clientY, id: event.pointerId };
  });
  document.addEventListener("pointerup", (event) => {
    if (!swipe || swipe.id !== event.pointerId) return;
    const dx = event.clientX - swipe.x;
    const dy = event.clientY - swipe.y;
    swipe = null;
    if (state.screen !== "calendar" || state.sheet || state.menuOpen) return;
    if (Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 1.3) return;
    ignoreClickUntil = Date.now() + 450;
    shift(dx < 0 ? 1 : -1);
  });
}

async function onAction(action: string, el: HTMLElement): Promise<void> {
  if (action === "noop") return;
  if (action === "menu") {
    state.menuOpen = !state.menuOpen;
    if (state.menuOpen) state.sheet = null;
    emit();
    return;
  }
  if (action === "close-menu") {
    state.menuOpen = false;
    emit();
    return;
  }
  if (action === "close-sheet") {
    state.sheet = null;
    state.pendingDelete = null;
    emit();
    return;
  }
  if (action === "nav") {
    const screen = el.dataset.screen ?? "";
    if (isScreen(screen)) setScreen(screen);
    return;
  }
  if (action === "prev") return shift(-1);
  if (action === "next") return shift(1);
  if (action === "today") {
    state.date = todayTokyo();
    state.sheet = null;
    state.pendingAutoScroll = true;
    if (state.screen !== "calendar") setScreen("calendar");
    else emit();
    return;
  }
  if (action === "jump-now") {
    state.date = todayTokyo();
    state.screen = "calendar";
    state.sheet = null;
    state.menuOpen = false;
    state.pendingAutoScroll = false;
    state.jumpNowMinutes = Math.max(0, tokyoNowMinutes() - 50);
    if (location.hash && location.hash !== "#/") location.hash = "#/";
    emit();
    return;
  }
  if (action === "grid") {
    const gridEl = el.closest(".cal-grid");
    if (!gridEl) return;
    const minutes = Math.max(0, Math.min(DAY_MINUTES - 10, Math.floor((pointerY - gridEl.getBoundingClientRect().top) / ROW_H) * 10));
    state.sheet = { kind: "slot", minutes };
    state.pendingDelete = null;
    emit();
    return;
  }
  if (action === "block") {
    state.sheet = { kind: "block", id: el.dataset.id ?? "" };
    state.pendingDelete = null;
    emit();
    return;
  }
  if (action === "mark") {
    state.sheet = { kind: "mark", id: el.dataset.id ?? "" };
    state.pendingDelete = null;
    emit();
    return;
  }
  if (action === "log-slot") {
    const type = el.dataset.type === "sleep" ? "sleep" : "wake";
    await addMark(type, state.date, Number(el.dataset.minutes ?? "0"));
    return;
  }
  if (action === "wake-now" || action === "sleep-now") {
    const minutes = Math.floor(tokyoNowMinutes() / 10) * 10;
    await addMark(action === "wake-now" ? "wake" : "sleep", todayTokyo(), minutes);
    return;
  }
  if (action === "status") {
    const status = el.dataset.status;
    if (status !== "planned" && status !== "done" && status !== "skipped") return;
    await setStatus(el.dataset.id ?? "", status);
    return;
  }
  if (action === "delete-block") {
    const id = el.dataset.id ?? "";
    if (!armDelete(`block:${id}`)) return;
    setBusy(true);
    const result = await deleteBlock(id);
    setBusy(false);
    if (!result.ok) return showToast(result.error);
    state.sheet = null;
    state.pendingDelete = null;
    emit();
    showToast("削除しました");
    return;
  }
  if (action === "delete-log") {
    const id = el.dataset.id ?? "";
    if (!armDelete(`log:${id}`)) return;
    setBusy(true);
    const result = await deleteLog(id);
    setBusy(false);
    if (!result.ok) return showToast(result.error);
    state.sheet = null;
    state.pendingDelete = null;
    emit();
    showToast("消しました");
    return;
  }
  if (action === "pick-rank") {
    const rank = el.dataset.rank ?? "A";
    document.querySelectorAll<HTMLButtonElement>('[data-action="pick-rank"]').forEach((btn) => {
      const on = btn.dataset.rank === rank;
      btn.classList.toggle("on", on);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
    });
    const hidden = document.getElementById("todo-rank");
    if (hidden instanceof HTMLInputElement) hidden.value = rank;
    const hint = document.getElementById("rank-hint");
    const found = RANKS.find((r) => r.id === rank);
    if (hint && found) hint.textContent = found.hint;
    return;
  }
  if (action === "edit-wish" || action === "edit-todo" || action === "edit-travel") {
    state.editingWish = action === "edit-wish" ? (el.dataset.id ?? null) : state.editingWish;
    state.editingTodo = action === "edit-todo" ? (el.dataset.id ?? null) : state.editingTodo;
    state.editingTravel = action === "edit-travel" ? (el.dataset.id ?? null) : state.editingTravel;
    if (action === "edit-wish") state.editingWish = el.dataset.id ?? null;
    emit();
    scrollFormToTop();
    return;
  }
  if (action === "cancel-wish" || action === "cancel-todo" || action === "cancel-travel") {
    if (action === "cancel-wish") state.editingWish = null;
    if (action === "cancel-todo") state.editingTodo = null;
    if (action === "cancel-travel") state.editingTravel = null;
    emit();
    return;
  }
  if (action === "toggle-wish") {
    const wish = state.wishes.find((w) => w.id === el.dataset.id);
    if (!wish) return;
    const result = await setWishDone(wish.id, !wish.done);
    if (!result.ok) return showToast(result.error);
    emit();
    return;
  }
  if (action === "toggle-todo") {
    const todo = state.todos.find((t) => t.id === el.dataset.id);
    if (!todo) return;
    const result = await setTodoStatus(todo.id, todo.status === "done" ? "open" : "done");
    if (!result.ok) return showToast(result.error);
    emit();
    return;
  }
  if (action === "delete-wish" || action === "delete-todo" || action === "delete-travel") {
    const id = el.dataset.id ?? "";
    const key = `${action.replace("delete-", "")}:${id}`;
    if (!armDelete(key)) return;
    setBusy(true);
    const result =
      action === "delete-wish" ? await deleteWish(id) : action === "delete-todo" ? await deleteTodo(id) : await deleteTravel(id);
    setBusy(false);
    if (!result.ok) return showToast(result.error);
    state.pendingDelete = null;
    if (action === "delete-wish" && state.editingWish === id) state.editingWish = null;
    if (action === "delete-todo" && state.editingTodo === id) state.editingTodo = null;
    if (action === "delete-travel" && state.editingTravel === id) state.editingTravel = null;
    emit();
    showToast("削除しました");
    return;
  }
  if (action === "reset-demo") {
    resetDemoData();
    state.date = todayTokyo();
    state.sheet = null;
    state.editingWish = null;
    state.editingTodo = null;
    state.editingTravel = null;
    state.pendingAutoScroll = true;
    setScreen("calendar");
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
    await signOut();
    emit();
    showToast("ログアウトしました");
    return;
  }
  if (action === "reload") {
    await reloadSilent();
    showToast(state.connected ? "読み直しました" : "読み直せませんでした");
  }
}

let pointerY = 0;

async function setStatus(id: string, status: BlockStatus): Promise<void> {
  setBusy(true);
  const result = await setBlockStatus(id, status);
  setBusy(false);
  if (!result.ok) return showToast(result.error);
  state.sheet = null;
  emit();
  showToast(status === "done" ? "完了にしました" : status === "skipped" ? "見送りにしました" : "予定に戻しました");
}
