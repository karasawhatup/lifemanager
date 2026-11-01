export type Actor = "app" | "tutor" | "writer" | "researcher";

export type ResourceKind = "article" | "video" | "other";

export type QuestionStatus = "open" | "answered";

export type EssayStatus = "pending" | "corrected";

export type AssignmentStatus = "assigned" | "submitted" | "reviewed";

export type EngScreen = "home" | "expressions" | "resources" | "questions" | "essays" | "assignments";

export type Expression = {
  id: string;
  term: string;
  meaning: string;
  example: string | null;
  tags: string[];
  learned_on: string;
  created_by: Actor;
  created_at: string;
  updated_at: string;
};

export type Resource = {
  id: string;
  url: string;
  title: string;
  kind: ResourceKind;
  note: string | null;
  recorded_on: string;
  added_by: Actor;
  created_by: Actor;
  created_at: string;
  updated_at: string;
};

export type Question = {
  id: string;
  question: string;
  answer: string | null;
  status: QuestionStatus;
  created_by: Actor;
  answered_by: Actor | null;
  created_at: string;
  updated_at: string;
};

export type Essay = {
  id: string;
  title: string;
  original_text: string;
  corrected_text: string | null;
  explanation: string | null;
  status: EssayStatus;
  created_by: Actor;
  corrected_by: Actor | null;
  created_at: string;
  updated_at: string;
};

export type Assignment = {
  id: string;
  title: string;
  instructions: string;
  due_on: string | null;
  answer: string | null;
  feedback: string | null;
  status: AssignmentStatus;
  created_by: Actor;
  reviewed_by: Actor | null;
  submitted_at: string | null;
  created_at: string;
  updated_at: string;
};

export type EnglishBundle = {
  expressions: Expression[];
  resources: Resource[];
  questions: Question[];
  essays: Essay[];
  assignments: Assignment[];
};

export type Dialog =
  | { kind: "add-menu" }
  | { kind: "expression"; id: string | null }
  | { kind: "resource"; id: string | null }
  | { kind: "question"; id: string | null }
  | { kind: "essay"; id: string | null }
  | { kind: "answer"; id: string }
  | { kind: "confirm-delete"; target: DeleteTarget; id: string; label: string }
  | null;

export type DeleteTarget = "expression" | "resource" | "question" | "essay" | "assignment";

export type Result = { ok: true } | { ok: false; error: string };

export const ENG_SCREENS: EngScreen[] = [
  "home",
  "expressions",
  "resources",
  "questions",
  "essays",
  "assignments",
];

export function isEngScreen(value: string): value is EngScreen {
  return (ENG_SCREENS as string[]).includes(value);
}

export function isActor(value: string): value is Actor {
  return value === "app" || value === "tutor" || value === "writer" || value === "researcher";
}
