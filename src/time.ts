export const ROW_H = 26;
export const DAY_MINUTES = 24 * 60;

const WEEK: Record<string, string> = {
  Sun: "日",
  Mon: "月",
  Tue: "火",
  Wed: "水",
  Thu: "木",
  Fri: "金",
  Sat: "土",
};

export type TokyoParts = {
  year: string;
  month: string;
  day: string;
  hour: string;
  minute: string;
  second: string;
  weekday: string;
};

export function tokyoParts(date = new Date()): TokyoParts {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    weekday: "short",
    hourCycle: "h23",
  });
  const out: Record<string, string> = {};
  for (const part of fmt.formatToParts(date)) {
    if (part.type !== "literal") out[part.type] = part.value;
  }
  let hour = out.hour ?? "00";
  if (hour === "24") hour = "00";
  return {
    year: out.year ?? "1970",
    month: out.month ?? "01",
    day: out.day ?? "01",
    hour: hour.padStart(2, "0"),
    minute: (out.minute ?? "00").padStart(2, "0"),
    second: (out.second ?? "00").padStart(2, "0"),
    weekday: WEEK[(out.weekday ?? "").slice(0, 3)] ?? "",
  };
}

export function todayTokyo(date = new Date()): string {
  const p = tokyoParts(date);
  return `${p.year}-${p.month}-${p.day}`;
}

export function addDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const utc = new Date(Date.UTC(y, (m ?? 1) - 1, (d ?? 1) + days));
  const year = utc.getUTCFullYear();
  const month = String(utc.getUTCMonth() + 1).padStart(2, "0");
  const day = String(utc.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function timeToMinutes(value: string): number {
  const [h, m] = value.split(":");
  return Number(h) * 60 + Number(m);
}

export function minutesToTime(minutes: number): string {
  if (minutes >= DAY_MINUTES) return "24:00";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function normalizeTime(value: string): string {
  return minutesToTime(timeToMinutes(value));
}

export function tokyoNowMinutes(date = new Date()): number {
  const p = tokyoParts(date);
  return Number(p.hour) * 60 + Number(p.minute);
}

export function formatClock(date = new Date()): string {
  const p = tokyoParts(date);
  return `${p.hour}:${p.minute}`;
}

export function formatStamp(iso: string): string {
  const p = tokyoParts(new Date(iso));
  return `${Number(p.month)}/${Number(p.day)} ${p.hour}:${p.minute}`;
}

export function tokyoDate(iso: string): string {
  const p = tokyoParts(new Date(iso));
  return `${p.year}-${p.month}-${p.day}`;
}

/** Calendar date + minutes in Asia/Tokyo, as an offset timestamp. */
export function tokyoStamp(date: string, minutes: number): string {
  let day = date;
  let mins = minutes;
  if (mins >= DAY_MINUTES) {
    day = addDays(date, Math.floor(mins / DAY_MINUTES));
    mins = mins % DAY_MINUTES;
  }
  if (mins < 0) {
    day = addDays(date, -1);
    mins = DAY_MINUTES + mins;
  }
  return `${day}T${minutesToTime(mins)}:00+09:00`;
}

export function timeChoices(includeEnd: boolean): string[] {
  const out: string[] = [];
  if (includeEnd) {
    for (let m = 10; m <= DAY_MINUTES; m += 10) out.push(minutesToTime(m));
  } else {
    for (let m = 0; m <= DAY_MINUTES - 10; m += 10) out.push(minutesToTime(m));
  }
  return out;
}

export function shortMonthDay(isoDate: string): string {
  const [, m, d] = isoDate.split("-");
  return `${Number(m)}/${Number(d)}`;
}

export function weekdayOf(isoDate: string): string {
  return tokyoParts(new Date(`${isoDate}T12:00:00+09:00`)).weekday;
}
