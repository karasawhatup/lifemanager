export type Actor = "app" | "tutor" | "writer" | "researcher";

export type ResourceKind = "article" | "video" | "other";

export type QuestionStatus = "open" | "answered";

export type EssayStatus = "pending" | "corrected";

export type AssignmentStatus = "assigned" | "submitted" | "reviewed";

export type EngScreen =
  | "home"
  | "speaking"
  | "pronunciation"
  | "expressions"
  | "resources"
  | "questions"
  | "essays"
  | "assignments";

export type SpeakingScenario = "free_talk" | "daily_life" | "campus_life" | "travel" | "job_interview" | "custom";

export type SpeakingLevel = "a2" | "b1" | "b2";

export type TranscriptRole = "user" | "assistant";

export type TranscriptLine = {
  id?: string;
  role: TranscriptRole;
  text: string;
  at: string;
};

export type SpeakingMistake = {
  original: string;
  correction: string;
  note: string;
};

export type SpeakingPhrase = {
  term: string;
  meaning: string;
  example: string;
};

export type SpeakingFeedback = {
  good_points: string[];
  mistakes: SpeakingMistake[];
  expressions: SpeakingPhrase[];
};

export type SpeakingSession = {
  id: string;
  scenario: SpeakingScenario;
  topic: string;
  level: SpeakingLevel;
  max_minutes: number;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
  transcript: TranscriptLine[];
  feedback: SpeakingFeedback | null;
  model: string | null;
  created_by: Actor;
  created_at: string;
  updated_at: string;
};

export type PronunciationMode = "read_aloud" | "unscripted";

export type PronunciationSource = "manual" | "conversation";

export type PhonemeScore = {
  phoneme: string;
  accuracy: number | null;
};

export type WordScore = {
  word: string;
  accuracy: number | null;
  error_type: string;
  phonemes: PhonemeScore[];
};

export type PronunciationAttempt = {
  id: string;
  mode: PronunciationMode;
  reference_text: string | null;
  recognized_text: string;
  accuracy: number | null;
  fluency: number | null;
  completeness: number | null;
  prosody: number | null;
  pronunciation: number | null;
  words: WordScore[];
  focus: string | null;
  source: PronunciationSource;
  session_id: string | null;
  recorded_on: string;
  created_by: Actor;
  created_at: string;
  updated_at: string;
};

export type SpeakPhase = "idle" | "connecting" | "live" | "wrapping" | "error";

export type PronPhase = "idle" | "recording" | "error";

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
  speaking: SpeakingSession[];
  pronunciation: PronunciationAttempt[];
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

export type DeleteTarget =
  | "expression"
  | "resource"
  | "question"
  | "essay"
  | "assignment"
  | "speaking"
  | "pronunciation";

export type Result = { ok: true } | { ok: false; error: string };

export const ENG_SCREENS: EngScreen[] = [
  "home",
  "speaking",
  "pronunciation",
  "expressions",
  "resources",
  "questions",
  "essays",
  "assignments",
];

export function isSpeakingScenario(value: string): value is SpeakingScenario {
  return (
    value === "free_talk" ||
    value === "daily_life" ||
    value === "campus_life" ||
    value === "travel" ||
    value === "job_interview" ||
    value === "custom"
  );
}

export function isSpeakingLevel(value: string): value is SpeakingLevel {
  return value === "a2" || value === "b1" || value === "b2";
}

export function isPronunciationMode(value: string): value is PronunciationMode {
  return value === "read_aloud" || value === "unscripted";
}

export function isEngScreen(value: string): value is EngScreen {
  return (ENG_SCREENS as string[]).includes(value);
}

export function isActor(value: string): value is Actor {
  return value === "app" || value === "tutor" || value === "writer" || value === "researcher";
}
