import { DEFAULT_SETTINGS } from "./defaults";
import { addDays, todayTokyo, tokyoNowMinutes, tokyoStamp } from "./time";
import type {
  Bundle,
  Category,
  ChangeRequest,
  ScheduleBlock,
  BlockStatus,
  Settings,
  Todo,
  TravelTime,
  WakeSleepLog,
  Wish,
} from "./types";

const STORAGE_KEY = "lifemanager.demo.v1";

function stamp(date: string, time = "12:00:00"): string {
  return `${date}T${time}+09:00`;
}

function block(
  date: string,
  start: string,
  end: string,
  title: string,
  category: Category,
  status: BlockStatus = "planned",
  notes: string | null = null,
  source: "app" | "bot" = "bot",
): ScheduleBlock {
  const at = stamp(date, "06:00:00");
  return {
    id: crypto.randomUUID(),
    date,
    start_time: start,
    end_time: end,
    title,
    category,
    status,
    notes,
    source,
    created_by: source,
    created_at: at,
    updated_at: at,
  };
}

export function seedBundle(now = new Date()): Bundle {
  const today = todayTokyo(now);
  const yesterday = addDays(today, -1);
  const tomorrow = addDays(today, 1);
  const at = now.toISOString();

  const blocks: ScheduleBlock[] = [
    block(yesterday, "09:00", "10:30", "授業", "class", "done"),
    block(yesterday, "10:40", "12:10", "授業", "class", "done"),
    block(yesterday, "12:20", "13:00", "昼食", "meal", "done"),
    block(yesterday, "13:10", "14:10", "英語学習", "english", "skipped", "余裕がなかった"),
    block(yesterday, "18:30", "19:10", "夕食", "meal", "done"),
    block(yesterday, "22:00", "22:30", "風呂", "bath", "done"),

    block(today, "07:20", "08:00", "登校前の準備", "prep", "planned", "身支度。設定の準備時間は40分"),
    block(today, "08:00", "08:20", "家 → 早稲田", "travel"),
    block(today, "09:00", "10:30", "授業", "class", "planned", "1限"),
    block(today, "10:40", "12:10", "授業", "class", "planned", "2限"),
    block(today, "12:20", "13:00", "昼食", "meal"),
    block(today, "13:10", "14:10", "英語学習", "english", "planned", "毎日の1時間"),
    block(today, "14:20", "14:50", "早稲田 → サークル", "travel"),
    block(today, "14:50", "16:50", "サークル", "club"),
    block(today, "16:50", "17:20", "サークル → 家", "travel"),
    block(today, "17:30", "18:00", "洗濯", "laundry", "planned", "3日に一度"),
    block(today, "18:10", "18:50", "夕食", "meal"),
    block(today, "19:00", "20:10", "Moodleの課題", "moodle"),
    block(today, "20:20", "21:20", "余白", "buffer"),
    block(today, "21:30", "22:00", "風呂", "bath", "planned", "乾かしと肌ケアを含む"),
    block(today, "22:10", "23:10", "余白", "buffer"),

    block(tomorrow, "09:00", "10:00", "英語学習", "english", "planned", "午前は授業を入れない"),
    block(tomorrow, "10:10", "12:00", "余白", "buffer"),
    block(tomorrow, "12:10", "12:50", "昼食", "meal"),
    block(tomorrow, "13:10", "14:40", "授業", "class"),
    block(tomorrow, "18:00", "18:40", "夕食", "meal"),
    block(tomorrow, "21:30", "22:00", "風呂", "bath"),
    block(tomorrow, "22:10", "23:10", "余白", "buffer"),
  ];

  const logs: WakeSleepLog[] = [
    {
      id: crypto.randomUUID(),
      type: "sleep",
      logged_at: tokyoStamp(yesterday, 23 * 60 + 50),
      notes: null,
      source: "app",
      created_by: "app",
      created_at: stamp(yesterday, "23:50:00"),
      updated_at: stamp(yesterday, "23:50:00"),
    },
  ];

  if (tokyoNowMinutes(now) >= 7 * 60 + 10) {
    logs.push({
      id: crypto.randomUUID(),
      type: "wake",
      logged_at: tokyoStamp(today, 7 * 60 + 10),
      notes: null,
      source: "app",
      created_by: "app",
      created_at: stamp(today, "07:10:00"),
      updated_at: stamp(today, "07:10:00"),
    });
  }

  const todos: Todo[] = [
    {
      id: crypto.randomUUID(),
      title: "Moodleの小レポートを出す",
      rank: "A",
      due_date: tomorrow,
      estimated_minutes: 90,
      status: "open",
      notes: "参考文献を先に集める",
      source: "app",
      created_by: "app",
      created_at: at,
      updated_at: at,
    },
    {
      id: crypto.randomUUID(),
      title: "生協で教科書を買う",
      rank: "A",
      due_date: today,
      estimated_minutes: 30,
      status: "open",
      notes: null,
      source: "app",
      created_by: "app",
      created_at: at,
      updated_at: at,
    },
    {
      id: crypto.randomUUID(),
      title: "英語のシャドーイング",
      rank: "B",
      due_date: null,
      estimated_minutes: 60,
      status: "open",
      notes: "内容の詳細は別ファイル",
      source: "app",
      created_by: "app",
      created_at: at,
      updated_at: at,
    },
    {
      id: crypto.randomUUID(),
      title: "机の上を片づける",
      rank: "C",
      due_date: null,
      estimated_minutes: 40,
      status: "open",
      notes: null,
      source: "app",
      created_by: "app",
      created_at: at,
      updated_at: at,
    },
  ];

  const wishes: Wish[] = [
    {
      id: crypto.randomUUID(),
      title: "早稲田の近くのラーメン",
      category: "restaurant",
      notes: "昼に寄れそうな店",
      done: false,
      source: "app",
      created_by: "app",
      created_at: at,
      updated_at: at,
    },
    {
      id: crypto.randomUUID(),
      title: "一人カラオケ",
      category: "karaoke",
      notes: null,
      done: false,
      source: "app",
      created_by: "app",
      created_at: at,
      updated_at: at,
    },
    {
      id: crypto.randomUUID(),
      title: "積んでいるゲームを進める",
      category: "game",
      notes: null,
      done: false,
      source: "app",
      created_by: "app",
      created_at: at,
      updated_at: at,
    },
    {
      id: crypto.randomUUID(),
      title: "イヤホンを試し聞きする",
      category: "shopping",
      notes: null,
      done: true,
      source: "app",
      created_by: "app",
      created_at: at,
      updated_at: at,
    },
  ];

  const requests: ChangeRequest[] = [
    {
      id: crypto.randomUUID(),
      body: "今日の英語を夜にずらしてほしい。サークルが延びそう。",
      status: "open",
      bot_response: null,
      source: "app",
      created_by: "app",
      created_at: stamp(today, "00:05:00"),
      updated_at: stamp(today, "00:05:00"),
    },
    {
      id: crypto.randomUUID(),
      body: "明日の午前は空けて。",
      status: "handled",
      bot_response: "明日の午前は英語と余白にしました。授業は午後だけです。",
      source: "app",
      created_by: "app",
      created_at: stamp(yesterday, "21:10:00"),
      updated_at: stamp(yesterday, "21:40:00"),
    },
  ];

  const travels: TravelTime[] = [
    route("家", "早稲田大学", 20, "登校の目安"),
    route("早稲田大学", "家", 20, null),
    route("家", "サークル", 30, "活動場所までの目安"),
    route("サークル", "家", 30, null),
    route("早稲田大学", "サークル", 30, null),
    route("サークル", "早稲田大学", 30, null),
  ];

  const settings: Settings = {
    ...DEFAULT_SETTINGS,
    created_by: "app",
    created_at: at,
    updated_at: at,
  };

  return { blocks, todos, wishes, logs, requests, travels, settings };
}

function route(from: string, to: string, minutes: number, notes: string | null): TravelTime {
  const at = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    from_place: from,
    to_place: to,
    minutes,
    notes,
    source: "app",
    created_by: "app",
    created_at: at,
    updated_at: at,
  };
}

function isBundle(value: unknown): value is Bundle {
  if (!value || typeof value !== "object") return false;
  const v = value as Partial<Bundle>;
  return (
    Array.isArray(v.blocks) &&
    Array.isArray(v.todos) &&
    Array.isArray(v.wishes) &&
    Array.isArray(v.logs) &&
    Array.isArray(v.requests) &&
    Array.isArray(v.travels) &&
    !!v.settings
  );
}

export function loadDemo(): Bundle {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (isBundle(parsed)) return parsed;
    }
  } catch {
    /* fall through to a fresh seed */
  }
  const fresh = seedBundle();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh));
  return fresh;
}

export function saveDemo(bundle: Bundle): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(bundle));
}

export function clearDemo(): void {
  localStorage.removeItem(STORAGE_KEY);
}
