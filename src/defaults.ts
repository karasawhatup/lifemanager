import type { Settings } from "./types";

export const DEFAULT_SETTINGS: Omit<Settings, "created_at" | "updated_at" | "created_by"> = {
  display_name: "XOLDA",
  timezone: "Asia/Tokyo",
  buffer_minutes_per_day: 120,
  prep_minutes: 40,
  english_minutes_per_day: 60,
  meal_minutes: 40,
  bath_minutes: 30,
  laundry_interval_days: 3,
  day_length_hours: 16,
};
