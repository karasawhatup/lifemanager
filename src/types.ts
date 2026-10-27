export type Source = "app" | "bot";

export type Category =
  | "prep"
  | "class"
  | "club"
  | "travel"
  | "meal"
  | "bath"
  | "laundry"
  | "english"
  | "moodle"
  | "todo"
  | "wish"
  | "free"
  | "buffer";

export type BlockStatus = "planned" | "done" | "skipped";

export type ScheduleBlock = {
  id: string;
  date: string;
  start_time: string;
  end_time: string;
  title: string;
  category: Category;
  status: BlockStatus;
  notes: string | null;
  source: Source;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type TodoRank = "A" | "B" | "C";
export type TodoStatus = "open" | "done";

export type Todo = {
  id: string;
  title: string;
  rank: TodoRank;
  due_date: string | null;
  estimated_minutes: number | null;
  status: TodoStatus;
  notes: string | null;
  source: Source;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type Wish = {
  id: string;
  title: string;
  category: string;
  notes: string | null;
  done: boolean;
  source: Source;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type WakeSleepType = "wake" | "sleep";

export type WakeSleepLog = {
  id: string;
  type: WakeSleepType;
  logged_at: string;
  notes: string | null;
  source: Source;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type ChangeRequest = {
  id: string;
  body: string;
  status: "open" | "handled";
  bot_response: string | null;
  source: Source;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type TravelTime = {
  id: string;
  from_place: string;
  to_place: string;
  minutes: number;
  notes: string | null;
  source: Source;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type Settings = {
  display_name: string;
  timezone: string;
  buffer_minutes_per_day: number;
  prep_minutes: number;
  english_minutes_per_day: number;
  meal_minutes: number;
  bath_minutes: number;
  laundry_interval_days: number;
  day_length_hours: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type Bundle = {
  blocks: ScheduleBlock[];
  todos: Todo[];
  wishes: Wish[];
  logs: WakeSleepLog[];
  requests: ChangeRequest[];
  travels: TravelTime[];
  settings: Settings;
};

export type Screen = "calendar" | "requests" | "wishes" | "todos" | "travel" | "settings";

export type Sheet =
  | { kind: "slot"; minutes: number }
  | { kind: "block"; id: string }
  | { kind: "mark"; id: string }
  | null;

export type Result = { ok: true } | { ok: false; error: string };
