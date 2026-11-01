import type { Actor, AssignmentStatus, EssayStatus, QuestionStatus, ResourceKind } from "./types";

export function actorLabel(actor: Actor | null | undefined): string {
  if (actor === "tutor") return "チューター";
  if (actor === "writer") return "ライター";
  if (actor === "researcher") return "リサーチャー";
  if (actor === "app") return "自分";
  return "";
}

export function kindLabel(kind: ResourceKind): string {
  if (kind === "article") return "記事";
  if (kind === "video") return "動画";
  return "その他";
}

export function questionStatusLabel(status: QuestionStatus): string {
  return status === "answered" ? "回答済み" : "未回答";
}

export function essayStatusLabel(status: EssayStatus): string {
  return status === "corrected" ? "添削済み" : "添削待ち";
}

export function assignmentStatusLabel(status: AssignmentStatus): string {
  if (status === "submitted") return "提出済み";
  if (status === "reviewed") return "レビュー済み";
  return "未提出";
}
