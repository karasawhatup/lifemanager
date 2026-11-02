import { state } from "./state";

let toastTimer = 0;

export function paintToast(): void {
  document.querySelector(".snackbar")?.remove();
  if (!state.toast) return;
  const el = document.createElement("div");
  el.className = "snackbar";
  el.setAttribute("role", "status");
  el.textContent = state.toast;
  document.getElementById("app")?.appendChild(el);
}

export function showToast(message: string): void {
  state.toast = message;
  paintToast();
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    state.toast = null;
    paintToast();
  }, 3200);
}
