import { todayTokyo } from "./time";
import type {
  ChangeRequest,
  ScheduleBlock,
  Screen,
  Settings,
  Sheet,
  Todo,
  TravelTime,
  WakeSleepLog,
  Wish,
} from "./types";

export const SCREENS: Screen[] = ["calendar", "requests", "wishes", "todos", "travel", "settings"];

type Listener = () => void;
const listeners = new Set<Listener>();

export const state = {
  booting: true,
  mode: "demo" as "demo" | "live",
  email: null as string | null,
  connected: true,
  screen: "calendar" as Screen,
  menuOpen: false,
  date: todayTokyo(),
  sheet: null as Sheet,
  pendingDelete: null as string | null,
  pendingAutoScroll: true,
  jumpNowMinutes: null as number | null,
  editingWish: null as string | null,
  editingTodo: null as string | null,
  editingTravel: null as string | null,
  blocks: [] as ScheduleBlock[],
  todos: [] as Todo[],
  wishes: [] as Wish[],
  logs: [] as WakeSleepLog[],
  requests: [] as ChangeRequest[],
  travels: [] as TravelTime[],
  settings: null as Settings | null,
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

export function isScreen(value: string): value is Screen {
  return (SCREENS as string[]).includes(value);
}

export function canWrite(): boolean {
  return state.mode === "demo" || state.email != null;
}
