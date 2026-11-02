import { addDays, todayTokyo, tokyoStamp } from "../time";
import type {
  PhonemeScore,
  PronunciationAttempt,
  SpeakingFeedback,
  SpeakingSession,
  TranscriptLine,
  WordScore,
} from "./types";

export const SPEAK_MINUTES = [5, 10, 15, 20] as const;
export const DEFAULT_SPEAK_MINUTES = 10;
export const REALTIME_MODEL = "gpt-realtime-2.1";

export const SCENARIOS: { id: SpeakingSession["scenario"]; label: string }[] = [
  { id: "free_talk", label: "フリートーク" },
  { id: "daily_life", label: "日常生活" },
  { id: "campus_life", label: "大学生活" },
  { id: "travel", label: "旅行" },
  { id: "job_interview", label: "就職面接" },
  { id: "custom", label: "自分で決める" },
];

export const LEVELS: { id: SpeakingSession["level"]; label: string }[] = [
  { id: "a2", label: "初級 A2" },
  { id: "b1", label: "中級 B1" },
  { id: "b2", label: "上級 B2" },
];

export type StarterSentence = {
  id: string;
  focus: string;
  text: string;
  tip: string;
};

export const STARTER_SENTENCES: StarterSentence[] = [
  {
    id: "lr-1",
    focus: "L と R",
    text: "I really like the red light on the lake.",
    tip: "L は舌先を上の前歯の裏に軽く付けます。R は舌を口の中で浮かせて、歯には付けません。",
  },
  {
    id: "lr-2",
    focus: "L と R",
    text: "The library is on the right, not the left.",
    tip: "right の R と left の L を、一語ずつ確認してからつなげます。",
  },
  {
    id: "th-1",
    focus: "TH",
    text: "I think this is the third Thursday.",
    tip: "無声の TH は、舌先を歯の間に軽く出して息だけを通します。S にしないでください。",
  },
  {
    id: "th-2",
    focus: "TH",
    text: "They gathered their things together.",
    tip: "they と their の TH は有声音です。舌を歯に当てたまま、のどを鳴らします。",
  },
  {
    id: "vb-1",
    focus: "V と B",
    text: "I have a very big van by the river.",
    tip: "V は下唇を上の歯に当てて声を出します。B は両唇を一度閉じます。",
  },
  {
    id: "vb-2",
    focus: "V と B",
    text: "Please vote, but do not buy the boat.",
    tip: "vote の V では上の歯が見えます。boat の B では唇を閉じます。",
  },
  {
    id: "fh-1",
    focus: "F と H",
    text: "He felt happy after half an hour.",
    tip: "F は下唇と上の歯で息をこすります。H は口の奥からの息だけで、唇は歯に付けません。",
  },
  {
    id: "fh-2",
    focus: "F と H",
    text: "Her friend found a fine hotel.",
    tip: "friend と found は F、her と hotel は H です。",
  },
  {
    id: "vowel-1",
    focus: "母音",
    text: "Sit in this seat and eat the chips.",
    tip: "sit の i は短く、seat と eat の ee は長く口を横に引きます。",
  },
  {
    id: "vowel-2",
    focus: "母音",
    text: "The cat sat on the cut rug.",
    tip: "cat の a は口を横に開きます。cut の u は短い「ア」で、口を丸めすぎません。",
  },
  {
    id: "stress-1",
    focus: "強勢",
    text: "I want to record a record of our talk.",
    tip: "動詞の record は後ろの音節、名詞の record は前の音節を強く、少し高く長くします。",
  },
  {
    id: "stress-2",
    focus: "強勢",
    text: "The present is a present for the president.",
    tip: "名詞の present は前、president も最初の音節を強くします。全部を同じ強さで言わないでください。",
  },
  {
    id: "link-1",
    focus: "リンキング",
    text: "Turn it off and pick it up.",
    tip: "turn it は n と i がつながります。一語ずつ切りすぎないでください。",
  },
  {
    id: "link-2",
    focus: "リンキング",
    text: "I want to go out and look at it.",
    tip: "want to や go out は、会話では音がつながって短く聞こえます。",
  },
];

const PHONEME_TIPS: Record<string, string> = {
  r: "R は舌を口の中で浮かせます。舌先を歯や歯茎に付けないでください。",
  ɹ: "R は舌を口の中で浮かせます。舌先を歯や歯茎に付けないでください。",
  l: "L は舌先を上の前歯の裏に軽く付けてから離します。",
  θ: "無声の TH です。舌先を歯の間に軽く出して、息だけを通します。S にしないでください。",
  th: "無声の TH です。舌先を歯の間に軽く出して、息だけを通します。S にしないでください。",
  ð: "有声の TH です。舌先を歯に当てたまま声を出します。Z や D にしないでください。",
  dh: "有声の TH です。舌先を歯に当てたまま声を出します。Z や D にしないでください。",
  v: "V は下唇を上の歯に軽く当てて声を出します。両唇は閉じません。",
  f: "F は下唇を上の歯に当てて息を出します。H のように口を開けたままにしないでください。",
  h: "H は口の奥から息だけです。唇を歯に当てません。",
  w: "W は唇を丸めて前に出してから開きます。",
  æ: "cat の母音です。口を横に少し開いて、「エ」と「ア」の間で短く言います。",
  ae: "cat の母音です。口を横に少し開いて、「エ」と「ア」の間で短く言います。",
  ʌ: "cup の母音です。短い「ア」で、口は丸めすぎません。",
  ah: "短い「ア」です。口は力を抜いて、丸めすぎません。",
  ɪ: "sit の短い i です。seat の長い「イー」より口を開き、短く切ります。",
  ih: "sit の短い i です。seat の長い「イー」より口を開き、短く切ります。",
  i: "長い「イー」です。口を横に引いて、sit の i より長くします。",
  iy: "長い「イー」です。口を横に引いて、sit の i より長くします。",
  ʊ: "book の短い u です。唇は少し丸め、food ほど長くしません。",
  uh: "book の短い u です。唇は少し丸め、長く引きません。",
  u: "food の長い u です。唇を丸めて前に出します。",
  uw: "food の長い u です。唇を丸めて前に出します。",
  ɛ: "bed の母音です。日本語の「エ」より口を少し縦に開きます。",
  eh: "bed の母音です。日本語の「エ」より口を少し縦に開きます。",
  ə: "力の入らないあいまいな母音です。強く、長く言いすぎないでください。",
  ax: "力の入らないあいまいな母音です。強く、長く言いすぎないでください。",
  ʃ: "SH は唇を少し前に出します。S より息の通り道を広くします。",
  sh: "SH は唇を少し前に出します。S より息の通り道を広くします。",
  ŋ: "ng は舌の奥を上あごに付けます。最後に「グ」と離しすぎないでください。",
  tʃ: "ch は「ト」と「シュ」を一息で言います。",
};

const PROBLEM: Record<string, { accuracy: number; phonemes: PhonemeScore[] }> = {
  really: { accuracy: 48, phonemes: [{ phoneme: "ɹ", accuracy: 32 }, { phoneme: "ɪ", accuracy: 80 }, { phoneme: "l", accuracy: 44 }, { phoneme: "i", accuracy: 86 }] },
  red: { accuracy: 55, phonemes: [{ phoneme: "ɹ", accuracy: 40 }, { phoneme: "ɛ", accuracy: 84 }, { phoneme: "d", accuracy: 90 }] },
  right: { accuracy: 52, phonemes: [{ phoneme: "ɹ", accuracy: 38 }, { phoneme: "aɪ", accuracy: 70 }, { phoneme: "t", accuracy: 88 }] },
  left: { accuracy: 61, phonemes: [{ phoneme: "l", accuracy: 46 }, { phoneme: "ɛ", accuracy: 82 }, { phoneme: "f", accuracy: 70 }, { phoneme: "t", accuracy: 90 }] },
  light: { accuracy: 58, phonemes: [{ phoneme: "l", accuracy: 42 }, { phoneme: "aɪ", accuracy: 78 }, { phoneme: "t", accuracy: 90 }] },
  lake: { accuracy: 57, phonemes: [{ phoneme: "l", accuracy: 41 }, { phoneme: "eɪ", accuracy: 76 }, { phoneme: "k", accuracy: 92 }] },
  library: { accuracy: 46, phonemes: [{ phoneme: "l", accuracy: 40 }, { phoneme: "aɪ", accuracy: 72 }, { phoneme: "ɹ", accuracy: 36 }, { phoneme: "i", accuracy: 84 }] },
  like: { accuracy: 63, phonemes: [{ phoneme: "l", accuracy: 48 }, { phoneme: "aɪ", accuracy: 80 }, { phoneme: "k", accuracy: 92 }] },
  think: { accuracy: 50, phonemes: [{ phoneme: "θ", accuracy: 34 }, { phoneme: "ɪ", accuracy: 82 }, { phoneme: "ŋ", accuracy: 70 }, { phoneme: "k", accuracy: 90 }] },
  third: { accuracy: 49, phonemes: [{ phoneme: "θ", accuracy: 36 }, { phoneme: "ɝ", accuracy: 55 }, { phoneme: "d", accuracy: 88 }] },
  thursday: { accuracy: 47, phonemes: [{ phoneme: "θ", accuracy: 33 }, { phoneme: "ɝ", accuracy: 58 }, { phoneme: "z", accuracy: 75 }, { phoneme: "eɪ", accuracy: 82 }] },
  this: { accuracy: 64, phonemes: [{ phoneme: "ð", accuracy: 48 }, { phoneme: "ɪ", accuracy: 80 }, { phoneme: "s", accuracy: 90 }] },
  they: { accuracy: 60, phonemes: [{ phoneme: "ð", accuracy: 45 }, { phoneme: "eɪ", accuracy: 86 }] },
  their: { accuracy: 57, phonemes: [{ phoneme: "ð", accuracy: 42 }, { phoneme: "ɛ", accuracy: 70 }, { phoneme: "ɹ", accuracy: 48 }] },
  things: { accuracy: 54, phonemes: [{ phoneme: "θ", accuracy: 38 }, { phoneme: "ɪ", accuracy: 80 }, { phoneme: "ŋ", accuracy: 72 }, { phoneme: "z", accuracy: 78 }] },
  together: { accuracy: 59, phonemes: [{ phoneme: "t", accuracy: 88 }, { phoneme: "ə", accuracy: 70 }, { phoneme: "ð", accuracy: 44 }, { phoneme: "ɚ", accuracy: 62 }] },
  very: { accuracy: 51, phonemes: [{ phoneme: "v", accuracy: 35 }, { phoneme: "ɛ", accuracy: 80 }, { phoneme: "ɹ", accuracy: 50 }, { phoneme: "i", accuracy: 84 }] },
  van: { accuracy: 53, phonemes: [{ phoneme: "v", accuracy: 37 }, { phoneme: "æ", accuracy: 64 }, { phoneme: "n", accuracy: 90 }] },
  vote: { accuracy: 50, phonemes: [{ phoneme: "v", accuracy: 34 }, { phoneme: "oʊ", accuracy: 72 }, { phoneme: "t", accuracy: 88 }] },
  river: { accuracy: 56, phonemes: [{ phoneme: "ɹ", accuracy: 40 }, { phoneme: "ɪ", accuracy: 78 }, { phoneme: "v", accuracy: 48 }] },
  have: { accuracy: 62, phonemes: [{ phoneme: "h", accuracy: 74 }, { phoneme: "æ", accuracy: 55 }, { phoneme: "v", accuracy: 46 }] },
  felt: { accuracy: 62, phonemes: [{ phoneme: "f", accuracy: 55 }, { phoneme: "ɛ", accuracy: 82 }, { phoneme: "l", accuracy: 58 }, { phoneme: "t", accuracy: 90 }] },
  half: { accuracy: 58, phonemes: [{ phoneme: "h", accuracy: 70 }, { phoneme: "æ", accuracy: 48 }, { phoneme: "f", accuracy: 52 }] },
  friend: { accuracy: 60, phonemes: [{ phoneme: "f", accuracy: 50 }, { phoneme: "ɹ", accuracy: 42 }, { phoneme: "ɛ", accuracy: 80 }, { phoneme: "n", accuracy: 88 }] },
  found: { accuracy: 61, phonemes: [{ phoneme: "f", accuracy: 52 }, { phoneme: "aʊ", accuracy: 74 }, { phoneme: "n", accuracy: 86 }] },
  fine: { accuracy: 66, phonemes: [{ phoneme: "f", accuracy: 54 }, { phoneme: "aɪ", accuracy: 78 }, { phoneme: "n", accuracy: 90 }] },
  happy: { accuracy: 70, phonemes: [{ phoneme: "h", accuracy: 58 }, { phoneme: "æ", accuracy: 62 }, { phoneme: "p", accuracy: 90 }, { phoneme: "i", accuracy: 84 }] },
  hotel: { accuracy: 68, phonemes: [{ phoneme: "h", accuracy: 52 }, { phoneme: "oʊ", accuracy: 74 }, { phoneme: "t", accuracy: 88 }, { phoneme: "ɛ", accuracy: 76 }, { phoneme: "l", accuracy: 60 }] },
  her: { accuracy: 64, phonemes: [{ phoneme: "h", accuracy: 50 }, { phoneme: "ɝ", accuracy: 58 }] },
  he: { accuracy: 72, phonemes: [{ phoneme: "h", accuracy: 55 }, { phoneme: "i", accuracy: 88 }] },
  hour: { accuracy: 63, phonemes: [{ phoneme: "aʊ", accuracy: 70 }, { phoneme: "ɚ", accuracy: 60 }] },
  sit: { accuracy: 64, phonemes: [{ phoneme: "s", accuracy: 90 }, { phoneme: "ɪ", accuracy: 48 }, { phoneme: "t", accuracy: 92 }] },
  seat: { accuracy: 66, phonemes: [{ phoneme: "s", accuracy: 90 }, { phoneme: "i", accuracy: 55 }, { phoneme: "t", accuracy: 92 }] },
  eat: { accuracy: 63, phonemes: [{ phoneme: "i", accuracy: 50 }, { phoneme: "t", accuracy: 90 }] },
  thisword: { accuracy: 80, phonemes: [] },
  chips: { accuracy: 70, phonemes: [{ phoneme: "tʃ", accuracy: 62 }, { phoneme: "ɪ", accuracy: 68 }, { phoneme: "p", accuracy: 88 }] },
  cat: { accuracy: 58, phonemes: [{ phoneme: "k", accuracy: 90 }, { phoneme: "æ", accuracy: 42 }, { phoneme: "t", accuracy: 92 }] },
  sat: { accuracy: 60, phonemes: [{ phoneme: "s", accuracy: 88 }, { phoneme: "æ", accuracy: 45 }, { phoneme: "t", accuracy: 92 }] },
  cut: { accuracy: 57, phonemes: [{ phoneme: "k", accuracy: 90 }, { phoneme: "ʌ", accuracy: 40 }, { phoneme: "t", accuracy: 92 }] },
  rug: { accuracy: 67, phonemes: [{ phoneme: "ɹ", accuracy: 48 }, { phoneme: "ʌ", accuracy: 52 }, { phoneme: "g", accuracy: 88 }] },
  record: { accuracy: 55, phonemes: [{ phoneme: "ɹ", accuracy: 44 }, { phoneme: "ɪ", accuracy: 70 }, { phoneme: "k", accuracy: 85 }, { phoneme: "ɔ", accuracy: 58 }] },
  present: { accuracy: 59, phonemes: [{ phoneme: "p", accuracy: 90 }, { phoneme: "ɹ", accuracy: 46 }, { phoneme: "ɛ", accuracy: 72 }, { phoneme: "z", accuracy: 70 }] },
  president: { accuracy: 52, phonemes: [{ phoneme: "p", accuracy: 90 }, { phoneme: "ɹ", accuracy: 40 }, { phoneme: "ɛ", accuracy: 68 }, { phoneme: "z", accuracy: 64 }] },
  turn: { accuracy: 60, phonemes: [{ phoneme: "t", accuracy: 90 }, { phoneme: "ɝ", accuracy: 52 }, { phoneme: "n", accuracy: 88 }] },
  want: { accuracy: 74, phonemes: [{ phoneme: "w", accuracy: 58 }, { phoneme: "ɑ", accuracy: 72 }, { phoneme: "n", accuracy: 86 }, { phoneme: "t", accuracy: 90 }] },
};

export function scenarioLabel(id: string): string {
  return SCENARIOS.find((item) => item.id === id)?.label ?? id;
}

export function levelLabel(id: string): string {
  return LEVELS.find((item) => item.id === id)?.label ?? id;
}

export function starterById(id: string): StarterSentence | undefined {
  return STARTER_SENTENCES.find((item) => item.id === id);
}

export function mmss(total: number): string {
  const seconds = Math.max(0, Math.floor(total));
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

export function scoreBand(value: number | null): "good" | "mid" | "bad" | "none" {
  if (value == null || Number.isNaN(value)) return "none";
  if (value >= 80) return "good";
  if (value >= 60) return "mid";
  return "bad";
}

export function scoreText(value: number | null): string {
  if (value == null || Number.isNaN(value)) return "—";
  return String(Math.round(value));
}

export function errorLabel(errorType: string): string {
  const key = errorType.toLowerCase();
  if (key === "none" || key === "") return "";
  if (key === "mispronunciation") return "ずれ";
  if (key === "omission") return "抜け";
  if (key === "insertion") return "余分";
  if (key === "unexpectedbreak") return "切れすぎ";
  if (key === "missingbreak") return "切れていない";
  if (key === "monotone") return "単調";
  return "";
}

export function phonemeTip(symbol: string): string | null {
  const key = symbol.trim().toLowerCase();
  return PHONEME_TIPS[key] ?? PHONEME_TIPS[symbol.trim()] ?? null;
}

export function wordKey(word: string): string {
  return word.toLowerCase().replace(/[^a-z']/g, "");
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value * 10) / 10));
}

export function mockWords(text: string, boost = 0): WordScore[] {
  const out: WordScore[] = [];
  for (const raw of text.split(/\s+/)) {
    const word = raw.replace(/[^A-Za-z']/g, "");
    if (!word) continue;
    const problem = PROBLEM[wordKey(word)];
    if (!problem) {
      out.push({ word, accuracy: clampScore(Math.min(98, 91 + boost)), error_type: "None", phonemes: [] });
      continue;
    }
    const accuracy = clampScore(Math.min(97, problem.accuracy + boost));
    out.push({
      word,
      accuracy,
      error_type: accuracy < 60 ? "Mispronunciation" : "None",
      phonemes: problem.phonemes.map((phoneme) => ({
        phoneme: phoneme.phoneme,
        accuracy: phoneme.accuracy == null ? null : clampScore(Math.min(98, phoneme.accuracy + boost)),
      })),
    });
  }
  return out;
}

function average(values: number[]): number | null {
  if (!values.length) return null;
  return clampScore(values.reduce((sum, value) => sum + value, 0) / values.length);
}

export function scoresFromWords(words: WordScore[], focus: string | null, mode: PronunciationAttempt["mode"]): Pick<
  PronunciationAttempt,
  "accuracy" | "fluency" | "completeness" | "prosody" | "pronunciation"
> {
  const accuracy = average(words.map((word) => word.accuracy).filter((value): value is number => value != null));
  const fluency = focus === "リンキング" ? 64 : 76;
  const prosody = focus === "強勢" ? 58 : 74;
  const completeness = mode === "unscripted" ? null : words.some((word) => word.error_type === "Omission") ? 80 : 100;
  const parts = [accuracy, fluency, completeness, prosody].filter((value): value is number => value != null);
  return {
    accuracy,
    fluency,
    completeness,
    prosody,
    pronunciation: average(parts),
  };
}

export const DEMO_TURNS: { role: TranscriptLine["role"]; text: string }[] = [
  { role: "assistant", text: "Hi. Let's talk about campus life. What class did you have today?" },
  { role: "user", text: "I go to English class this morning, and it was very interesting." },
  { role: "assistant", text: "Nice. You can say, I went to English class this morning. What was interesting?" },
  { role: "user", text: "The teacher talk about how to introduce yourself in a interview." },
  { role: "assistant", text: "Good topic. The teacher talked, and in an interview. Want to try a short introduction?" },
];

export function demoFeedback(): SpeakingFeedback {
  return {
    good_points: [
      "授業の話を自分から続けられた。",
      "interesting や introduce yourself など、伝えたい内容は相手に届いている。",
    ],
    mistakes: [
      {
        original: "I go to English class this morning",
        correction: "I went to English class this morning",
        note: "今朝の話なので過去形 went にします。",
      },
      {
        original: "The teacher talk",
        correction: "The teacher talked",
        note: "過去の話なので talked です。",
      },
      {
        original: "in a interview",
        correction: "in an interview",
        note: "interview は母音で始まるので an です。",
      },
    ],
    expressions: [
      {
        term: "I went to English class this morning",
        meaning: "今朝、英語の授業に行った",
        example: "I went to English class this morning, and it was interesting.",
      },
      {
        term: "The teacher talked about",
        meaning: "先生は〜について話した",
        example: "The teacher talked about how to introduce yourself.",
      },
      {
        term: "in an interview",
        meaning: "面接で",
        example: "I want to speak clearly in an interview.",
      },
    ],
  };
}

export function sampleSpeakingSession(now = new Date(), id = "preview-speak"): SpeakingSession {
  const today = todayTokyo(now);
  const started = tokyoStamp(today, 13 * 60 + 10);
  const lines: TranscriptLine[] = DEMO_TURNS.map((turn, index) => ({
    role: turn.role,
    text: turn.text,
    at: tokyoStamp(today, 13 * 60 + 10 + index),
  }));
  return {
    id,
    scenario: "campus_life",
    topic: "今日の授業",
    level: "b1",
    max_minutes: 10,
    started_at: started,
    ended_at: tokyoStamp(today, 13 * 60 + 18),
    duration_seconds: 520,
    transcript: lines,
    feedback: demoFeedback(),
    model: null,
    created_by: "app",
    created_at: started,
    updated_at: tokyoStamp(today, 13 * 60 + 18),
  };
}

const SAMPLE_PLAN: { sentenceId: string; daysAgo: number; boost: number }[] = [
  { sentenceId: "lr-1", daysAgo: 5, boost: 0 },
  { sentenceId: "th-1", daysAgo: 4, boost: 2 },
  { sentenceId: "vb-1", daysAgo: 3, boost: 4 },
  { sentenceId: "vowel-2", daysAgo: 2, boost: 6 },
  { sentenceId: "link-1", daysAgo: 1, boost: 8 },
  { sentenceId: "stress-1", daysAgo: 0, boost: 10 },
];

export function samplePronunciation(now = new Date(), idPrefix = "preview-pron"): PronunciationAttempt[] {
  const today = todayTokyo(now);
  return SAMPLE_PLAN.map((plan, index) => {
    const sentence = starterById(plan.sentenceId);
    const text = sentence?.text ?? "";
    const day = addDays(today, -plan.daysAgo);
    const words = mockWords(text, plan.boost);
    const scores = scoresFromWords(words, sentence?.focus ?? null, "read_aloud");
    const at = tokyoStamp(day, 20 * 60 + index * 5);
    return {
      id: `${idPrefix}-${index + 1}`,
      mode: "read_aloud",
      reference_text: text,
      recognized_text: text,
      ...scores,
      words,
      focus: sentence?.focus ?? null,
      source: "manual",
      session_id: null,
      recorded_on: day,
      created_by: "app",
      created_at: at,
      updated_at: at,
    };
  });
}

export function tipsForAttempt(attempt: PronunciationAttempt): string[] {
  const tips: string[] = [];
  const sentence = STARTER_SENTENCES.find((item) => item.text === attempt.reference_text);
  if (sentence) tips.push(sentence.tip);
  else if (attempt.focus) {
    const match = STARTER_SENTENCES.find((item) => item.focus === attempt.focus);
    if (match) tips.push(match.tip);
  }
  const seen = new Set<string>();
  for (const word of attempt.words) {
    for (const phoneme of word.phonemes) {
      if (phoneme.accuracy == null || phoneme.accuracy >= 70) continue;
      const tip = phonemeTip(phoneme.phoneme);
      if (!tip || seen.has(tip)) continue;
      seen.add(tip);
      tips.push(tip);
      if (tips.length >= 4) return tips;
    }
  }
  if ((attempt.prosody ?? 100) < 70 && !tips.some((tip) => tip.includes("強勢") || tip.includes("高く"))) {
    tips.push("強く言う音節を、少し高く、少し長くします。全部の音を同じ強さにしないでください。");
  }
  if ((attempt.fluency ?? 100) < 70 && !tips.some((tip) => tip.includes("つなが"))) {
    tips.push("単語と単語を滑らかにつなぎます。文の途中で一語ずつ切りすぎないでください。");
  }
  return tips.slice(0, 4);
}

export function frequentProblems(attempts: PronunciationAttempt[], limit = 6): {
  words: { label: string; count: number }[];
  phonemes: { label: string; count: number; tip: string }[];
} {
  const words = new Map<string, number>();
  const phonemes = new Map<string, number>();
  for (const attempt of attempts) {
    for (const word of attempt.words) {
      const weak =
        word.error_type === "Mispronunciation" ||
        word.error_type === "Omission" ||
        (word.accuracy != null && word.accuracy < 70);
      if (weak) {
        const key = wordKey(word.word);
        if (key) words.set(key, (words.get(key) ?? 0) + 1);
      }
      for (const phoneme of word.phonemes) {
        if (phoneme.accuracy == null || phoneme.accuracy >= 70) continue;
        const key = phoneme.phoneme;
        phonemes.set(key, (phonemes.get(key) ?? 0) + 1);
      }
    }
  }
  const ranked = (map: Map<string, number>) =>
    [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, limit);
  return {
    words: ranked(words).map(([label, count]) => ({ label, count })),
    phonemes: ranked(phonemes).map(([label, count]) => ({ label, count, tip: phonemeTip(label) ?? "" })),
  };
}

export function isPreviewId(id: string): boolean {
  return id.startsWith("preview-");
}
