import "@fontsource/roboto/400.css";
import "@fontsource/roboto/500.css";
import "./styles.css";
import { boot, reloadSilent } from "./api";
import { state, subscribe } from "./state";
import { todayTokyo } from "../time";
import { bindEnglish, render, syncScreenFromHash } from "./ui";

syncScreenFromHash();
subscribe(render);
bindEnglish();
render();
void boot();

window.setInterval(() => {
  const today = todayTokyo();
  if (today === state.today || state.dialog) return;
  const el = document.activeElement;
  if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT")) return;
  state.today = today;
  render();
}, 30000);

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible") return;
  state.today = todayTokyo();
  if (state.mode === "live") void reloadSilent();
  else render();
});

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("../sw.js").catch(() => undefined);
  });
}
