import "@fontsource/outfit/400.css";
import "@fontsource/outfit/500.css";
import "./styles.css";
import { boot, reloadSilent } from "./api";
import { isScreen, state, subscribe } from "./state";
import { formatClock, ROW_H, todayTokyo, tokyoNowMinutes } from "./time";
import { bindGlobal, render } from "./ui";

const initial = location.hash.replace(/^#\/?/, "");
if (initial && isScreen(initial)) state.screen = initial;

subscribe(render);
bindGlobal();
void boot();

let liveDay = todayTokyo();
window.setInterval(() => {
  const clock = document.getElementById("now-clock");
  if (clock) clock.textContent = `いま ${formatClock()}`;
  const today = todayTokyo();
  const line = document.getElementById("now-line");
  if (line && state.date === today) {
    line.style.top = `${(tokyoNowMinutes() / 10) * ROW_H}px`;
    const tag = document.getElementById("now-tag");
    if (tag) tag.textContent = formatClock();
  }
  if (today !== liveDay) {
    const wasToday = state.date === liveDay;
    liveDay = today;
    if (wasToday) {
      state.date = today;
      state.pendingAutoScroll = true;
      render();
    }
  }
}, 20000);

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") void reloadSilent();
});

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("./sw.js").catch(() => undefined);
  });
}
