import { todayTokyo } from "../time";
import type {
  Assignment,
  Dialog,
  EngScreen,
  Essay,
  Expression,
  Question,
  Resource,
} from "./types";

type Listener = () => void;
const listeners = new Set<Listener>();

export const state = {
  booting: true,
  mode: "demo" as "demo" | "live",
  email: null as string | null,
  connected: true,
  loadError: null as string | null,
  screen: "home" as EngScreen,
  menuOpen: false,
  dialog: null as Dialog,
  highlightId: null as string | null,
  today: todayTokyo(),
  expressions: [] as Expression[],
  resources: [] as Resource[],
  questions: [] as Question[],
  essays: [] as Essay[],
  assignments: [] as Assignment[],
  expressionFilter: "all" as "all" | "today",
  resourceFilter: "all" as "all" | "today" | "article" | "video" | "other",
  questionFilter: "all" as "all" | "open" | "answered",
  essayFilter: "all" as "all" | "pending" | "corrected",
  assignmentFilter: "all" as "all" | "assigned" | "submitted" | "reviewed",
  authEmail: "",
  authNotice: null as string | null,
  toast: null as string | null,
};

export function subscribe(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function emit(): void {
  for (const fn of listeners) fn();
}

export function canWrite(): boolean {
  return state.mode === "demo" || state.email != null;
}
