import type { BlockStatus, Category, TodoRank } from "./types";

export const CATEGORIES: { id: Category; label: string }[] = [
  { id: "prep", label: "準備" },
  { id: "class", label: "授業" },
  { id: "club", label: "サークル" },
  { id: "travel", label: "移動" },
  { id: "meal", label: "食事" },
  { id: "bath", label: "風呂" },
  { id: "laundry", label: "洗濯" },
  { id: "english", label: "英語" },
  { id: "moodle", label: "Moodle" },
  { id: "todo", label: "Todo" },
  { id: "wish", label: "やりたいこと" },
  { id: "free", label: "自由" },
  { id: "buffer", label: "余白" },
];

export const WISH_CATEGORIES: { id: string; label: string }[] = [
  { id: "restaurant", label: "飲食店" },
  { id: "karaoke", label: "カラオケ" },
  { id: "game", label: "ゲーム" },
  { id: "shopping", label: "買い物" },
  { id: "outing", label: "外出" },
  { id: "other", label: "その他" },
];

export const RANKS: { id: TodoRank; label: string; hint: string }[] = [
  { id: "A", label: "A", hint: "いま必要" },
  { id: "B", label: "B", hint: "近いうち" },
  { id: "C", label: "C", hint: "余裕があれば" },
];

export function categoryLabel(id: string): string {
  return CATEGORIES.find((c) => c.id === id)?.label ?? id;
}

export function wishCategoryLabel(id: string): string {
  return WISH_CATEGORIES.find((c) => c.id === id)?.label ?? id;
}

export function isCategory(value: string): value is Category {
  return CATEGORIES.some((c) => c.id === value);
}

export function statusLabel(status: BlockStatus): string {
  if (status === "done") return "完了";
  if (status === "skipped") return "見送り";
  return "予定";
}
