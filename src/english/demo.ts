import { addDays, todayTokyo, tokyoStamp } from "../time";
import type {
  Assignment,
  EnglishBundle,
  Essay,
  Expression,
  Question,
  Resource,
} from "./types";

const STORAGE_KEY = "lifemanager.english.demo.v1";

function at(date: string, minutes: number): string {
  return tokyoStamp(date, minutes);
}

export function seedEnglish(now = new Date()): EnglishBundle {
  const today = todayTokyo(now);
  const yesterday = addDays(today, -1);
  const threeDays = addDays(today, 3);
  const lastWeek = addDays(today, -6);

  const expressions: Expression[] = [
    {
      id: crypto.randomUUID(),
      term: "get the hang of",
      meaning: "コツをつかむ、感覚をつかむ",
      example: "I'm getting the hang of shadowing along with the audio.",
      tags: ["句動詞", "学習"],
      learned_on: today,
      created_by: "app",
      created_at: at(today, 13 * 60 + 20),
      updated_at: at(today, 13 * 60 + 20),
    },
    {
      id: crypto.randomUUID(),
      term: "fluent",
      meaning: "（言葉が）流暢な",
      example: "I want to become fluent enough to talk with native speakers.",
      tags: ["形容詞"],
      learned_on: today,
      created_by: "app",
      created_at: at(today, 13 * 60 + 40),
      updated_at: at(today, 13 * 60 + 40),
    },
    {
      id: crypto.randomUUID(),
      term: "on the other hand",
      meaning: "一方で",
      example: "Shadowing is tiring. On the other hand, it makes listening easier.",
      tags: ["つなぎ言葉"],
      learned_on: yesterday,
      created_by: "tutor",
      created_at: at(yesterday, 21 * 60),
      updated_at: at(yesterday, 21 * 60),
    },
  ];

  const resources: Resource[] = [
    {
      id: crypto.randomUUID(),
      url: "https://www.bbc.co.uk/learningenglish/english/features/the-english-we-speak",
      title: "BBC The English We Speak",
      kind: "article",
      note: "短い会話表現。シャドーイングの前に一度読む。",
      recorded_on: today,
      added_by: "researcher",
      created_by: "researcher",
      created_at: at(today, 9 * 60),
      updated_at: at(today, 9 * 60),
    },
    {
      id: crypto.randomUUID(),
      url: "https://www.youtube.com/@bbclearningenglish",
      title: "BBC Learning English のチャンネル",
      kind: "video",
      note: "6 Minute English をリスニングとシャドーイングに使う。",
      recorded_on: yesterday,
      added_by: "researcher",
      created_by: "researcher",
      created_at: at(yesterday, 18 * 60),
      updated_at: at(yesterday, 18 * 60),
    },
  ];

  const questions: Question[] = [
    {
      id: crypto.randomUUID(),
      question: "look forward to の to は前置詞ですか？ I look forward to see you は間違いですか？",
      answer: null,
      status: "open",
      created_by: "app",
      answered_by: null,
      created_at: at(today, 14 * 60),
      updated_at: at(today, 14 * 60),
    },
    {
      id: crypto.randomUUID(),
      question: "used to と be used to の違いは何ですか？",
      answer:
        "used to + 動詞の原形は「昔はよく〜した（今はしない）」です。例: I used to live in Osaka.\nbe used to + 名詞 / ing は「〜に慣れている」です。例: I am used to speaking English in class.\nto の後ろが原形か ing かで意味が変わります。",
      status: "answered",
      created_by: "app",
      answered_by: "tutor",
      created_at: at(yesterday, 20 * 60),
      updated_at: at(yesterday, 21 * 60 + 10),
    },
  ];

  const essays: Essay[] = [
    {
      id: crypto.randomUUID(),
      title: "今朝の予定",
      original_text: "Today I will go to class and after that I study English. I want practice speaking.",
      corrected_text: null,
      explanation: null,
      status: "pending",
      created_by: "app",
      corrected_by: null,
      created_at: at(today, 15 * 60),
      updated_at: at(today, 15 * 60),
    },
    {
      id: crypto.randomUUID(),
      title: "昨日の大学",
      original_text:
        "I goes to university yesterday and study English for one hour. It was very interesting, but I want to speak more fluent.",
      corrected_text:
        "I went to university yesterday and studied English for one hour. It was very interesting, but I want to speak more fluently.",
      explanation:
        "goes は過去の話なので went にします。study も studied です。fluent は動詞 speak を修飾する副詞なので fluently にします。",
      status: "corrected",
      created_by: "app",
      corrected_by: "writer",
      created_at: at(yesterday, 19 * 60),
      updated_at: at(yesterday, 22 * 60),
    },
  ];

  const assignments: Assignment[] = [
    {
      id: crypto.randomUUID(),
      title: "使った表現で例文を3つ",
      instructions:
        "今日メモした表現、または get the hang of を使って、大学生活についての英文を3つ書いてください。各文は15語以上にしてください。",
      due_on: threeDays,
      answer: null,
      feedback: null,
      status: "assigned",
      created_by: "tutor",
      reviewed_by: null,
      submitted_at: null,
      created_at: at(today, 8 * 60),
      updated_at: at(today, 8 * 60),
    },
    {
      id: crypto.randomUUID(),
      title: "昨日の一日を5文で",
      instructions: "昨日したことを過去形で5文書いてください。時を表す語（yesterday, then, after that）を1つ以上入れてください。",
      due_on: today,
      answer:
        "I wake up at seven yesterday. I go to university and study English. After that I eat lunch. Then I watch a video. I want speak more.",
      feedback: null,
      status: "submitted",
      created_by: "tutor",
      reviewed_by: null,
      submitted_at: at(yesterday, 22 * 60 + 30),
      created_at: at(yesterday, 8 * 60),
      updated_at: at(yesterday, 22 * 60 + 30),
    },
    {
      id: crypto.randomUUID(),
      title: "好きなことを80語で",
      instructions: "好きなことと、それをしているときの気持ちを、80語前後の英文で書いてください。",
      due_on: lastWeek,
      answer:
        "I like walking while I listen to English. The street is quiet at night, so I can hear each word. I repeat the short sentences out loud. It is a small practice, but I feel closer to speaking without stopping.",
      feedback:
        "聞きながら歩く場面が具体的で、読み手に伝わります。out loud と without stopping は自然です。次は過去の具体的な一夜にすると、時制の練習にもなります。",
      status: "reviewed",
      created_by: "tutor",
      reviewed_by: "tutor",
      submitted_at: at(lastWeek, 20 * 60),
      created_at: at(addDays(today, -8), 9 * 60),
      updated_at: at(addDays(today, -5), 11 * 60),
    },
  ];

  return { expressions, resources, questions, essays, assignments };
}

function isBundle(value: unknown): value is EnglishBundle {
  if (!value || typeof value !== "object") return false;
  const v = value as Partial<EnglishBundle>;
  return (
    Array.isArray(v.expressions) &&
    Array.isArray(v.resources) &&
    Array.isArray(v.questions) &&
    Array.isArray(v.essays) &&
    Array.isArray(v.assignments)
  );
}

export function loadEnglishDemo(): EnglishBundle {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (isBundle(parsed)) return parsed;
    }
  } catch {
    /* 壊れていたらサンプルを入れ直す */
  }
  const fresh = seedEnglish();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh));
  return fresh;
}

export function saveEnglishDemo(bundle: EnglishBundle): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(bundle));
}

export function clearEnglishDemo(): void {
  localStorage.removeItem(STORAGE_KEY);
}
