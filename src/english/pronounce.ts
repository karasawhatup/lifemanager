import { invokeFunction, savePronunciation } from "./api";
import { mockWords, scoresFromWords, starterById } from "./catalog";
import { emit, state } from "./state";
import { showToast } from "./toast";
import { todayTokyo } from "../time";
import type { PronunciationMode, WordScore } from "./types";

type SpeechModule = typeof import("microsoft-cognitiveservices-speech-sdk");

let recognizer: { close: () => void } | null = null;
let run = 0;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function finite(value: unknown): number | null {
  const num = typeof value === "number" ? value : Number.NaN;
  if (!Number.isFinite(num)) return null;
  return Math.max(0, Math.min(100, num));
}

function wordsFromJson(raw: string): WordScore[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as { NBest?: { Words?: unknown[] }[] };
    const list = parsed.NBest?.[0]?.Words;
    if (!Array.isArray(list)) return [];
    return list.flatMap((item) => {
      const word = mapWord(item);
      return word ? [word] : [];
    });
  } catch {
    return [];
  }
}

function mapWord(value: unknown): WordScore | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const word = String(row.Word ?? "").trim();
  if (!word) return null;
  const assessment =
    row.PronunciationAssessment && typeof row.PronunciationAssessment === "object"
      ? (row.PronunciationAssessment as Record<string, unknown>)
      : {};
  const phonemes = Array.isArray(row.Phonemes)
    ? row.Phonemes.flatMap((item) => {
        if (!item || typeof item !== "object") return [];
        const cell = item as Record<string, unknown>;
        const symbol = String(cell.Phoneme ?? "").trim();
        if (!symbol) return [];
        const score =
          cell.PronunciationAssessment && typeof cell.PronunciationAssessment === "object"
            ? (cell.PronunciationAssessment as Record<string, unknown>).AccuracyScore
            : null;
        return [{ phoneme: symbol, accuracy: finite(score) }];
      }).slice(0, 24)
    : [];
  return {
    word,
    accuracy: finite(assessment.AccuracyScore),
    error_type: String(assessment.ErrorType ?? "None"),
    phonemes,
  };
}

type ScoredSpeech = {
  text: string;
  words: WordScore[];
  accuracy: number | null;
  fluency: number | null;
  completeness: number | null;
  prosody: number | null;
  pronunciation: number | null;
};

function recognizeOnce(sdk: SpeechModule, rec: InstanceType<SpeechModule["SpeechRecognizer"]>): Promise<ScoredSpeech> {
  return new Promise((resolve, reject) => {
    rec.recognizeOnceAsync(
      (result) => {
        if (result.reason === sdk.ResultReason.RecognizedSpeech) {
          const pron = sdk.PronunciationAssessmentResult.fromResult(result);
          const raw = result.properties.getProperty(sdk.PropertyId.SpeechServiceResponse_JsonResult);
          resolve({
            text: result.text ?? "",
            words: wordsFromJson(raw),
            accuracy: finite(pron.accuracyScore),
            fluency: finite(pron.fluencyScore),
            completeness: finite(pron.completenessScore),
            prosody: finite(pron.prosodyScore),
            pronunciation: finite(pron.pronunciationScore),
          });
          return;
        }
        if (result.reason === sdk.ResultReason.NoMatch) {
          reject(new Error("聞き取れませんでした。もう一度、はっきり話してください"));
          return;
        }
        reject(new Error("発音の採点に失敗しました。マイクの許可と、Azure のキーを確認してください"));
      },
      () => reject(new Error("マイクの録音に失敗しました")),
    );
  });
}

export function cancelPronunciation(): void {
  run += 1;
  try {
    recognizer?.close();
  } catch {
    /* すでに閉じている */
  }
  recognizer = null;
  if (state.pronPhase === "recording") {
    state.pronPhase = "idle";
    emit();
    showToast("録音を止めました");
  }
}

export async function startPronunciation(): Promise<void> {
  if (state.pronPhase === "recording") return;
  const mode = state.pronMode;
  const reference = state.pronReference.trim();
  if (mode === "read_aloud" && (reference.length < 1 || reference.length > 500)) {
    showToast("読み上げる文を1〜500文字で入力してください");
    return;
  }
  if (state.mode === "demo") {
    await playSample(mode, reference);
    return;
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    state.pronPhase = "error";
    state.pronError = "このブラウザはマイクに対応していません。iPhone は Safari で開いてください。";
    emit();
    return;
  }

  const mine = ++run;
  state.pronPhase = "recording";
  state.pronError = null;
  emit();
  try {
    const auth = await invokeFunction("speech-token", {});
    if (mine !== run) return;
    if (!auth.ok) throw new Error(auth.error);
    const speechToken = typeof auth.data.token === "string" ? auth.data.token : "";
    const region = typeof auth.data.region === "string" ? auth.data.region : "";
    if (!speechToken || !region) throw new Error("発音用のトークンが返りませんでした");

    const sdk = await import("microsoft-cognitiveservices-speech-sdk");
    if (mine !== run) return;
    const speechConfig = sdk.SpeechConfig.fromAuthorizationToken(speechToken, region);
    speechConfig.speechRecognitionLanguage = "en-US";
    speechConfig.outputFormat = sdk.OutputFormat.Detailed;
    const audio = sdk.AudioConfig.fromDefaultMicrophoneInput();
    const assessment = new sdk.PronunciationAssessmentConfig(
      mode === "read_aloud" ? reference : "",
      sdk.PronunciationAssessmentGradingSystem.HundredMark,
      sdk.PronunciationAssessmentGranularity.Phoneme,
      mode === "read_aloud",
    );
    assessment.phonemeAlphabet = "IPA";
    assessment.enableProsodyAssessment = true;
    const rec = new sdk.SpeechRecognizer(speechConfig, audio);
    assessment.applyTo(rec);
    recognizer = rec;
    const scored = await recognizeOnce(sdk, rec);
    if (mine !== run) return;
    const focus = mode === "read_aloud" ? (starterById(state.pronSentenceId)?.focus ?? null) : null;
    const recognized = scored.text || scored.words.map((word) => word.word).join(" ");
    await storeAttempt({
      mode,
      reference: mode === "read_aloud" ? reference : null,
      recognized,
      words: scored.words,
      scores: {
        accuracy: scored.accuracy,
        fluency: scored.fluency,
        completeness: mode === "unscripted" ? null : scored.completeness,
        prosody: scored.prosody,
        pronunciation: scored.pronunciation,
      },
      focus,
      sample: false,
    });
  } catch (err) {
    if (mine !== run) return;
    state.pronPhase = "idle";
    const message = err instanceof Error && err.message ? err.message : "採点できませんでした";
    state.pronError = message;
    emit();
    showToast(message);
  } finally {
    try {
      recognizer?.close();
    } catch {
      /* すでに閉じている */
    }
    recognizer = null;
  }
}

async function playSample(mode: PronunciationMode, reference: string): Promise<void> {
  const mine = ++run;
  state.pronPhase = "recording";
  state.pronError = null;
  emit();
  await wait(700);
  if (mine !== run || state.pronPhase !== "recording") return;
  const sentence = starterById(state.pronSentenceId);
  const focus = mode === "read_aloud" && sentence && sentence.text === reference ? sentence.focus : null;
  const recognized = mode === "unscripted" ? "I want to practice speaking every day." : reference;
  let words = mockWords(recognized, 6);
  if (mode === "unscripted" && words[2]) {
    words = words.map((word, index) => (index === 2 ? { ...word, error_type: "Insertion", accuracy: 62 } : word));
  }
  await storeAttempt({
    mode,
    reference: mode === "read_aloud" ? reference : null,
    recognized,
    words,
    scores: scoresFromWords(words, focus, mode),
    focus,
    sample: true,
  });
}

async function storeAttempt(input: {
  mode: PronunciationMode;
  reference: string | null;
  recognized: string;
  words: WordScore[];
  scores: ReturnType<typeof scoresFromWords>;
  focus: string | null;
  sample: boolean;
}): Promise<void> {
  const saved = await savePronunciation({
    mode: input.mode,
    reference_text: input.reference,
    recognized_text: input.recognized,
    accuracy: input.scores.accuracy,
    fluency: input.scores.fluency,
    completeness: input.scores.completeness,
    prosody: input.scores.prosody,
    pronunciation: input.scores.pronunciation,
    words: input.words,
    focus: input.focus,
    source: state.pronSessionId ? "conversation" : "manual",
    session_id: state.pronSessionId,
    recorded_on: todayTokyo(),
  });
  state.pronPhase = "idle";
  if (!saved.ok) {
    state.pronError = saved.error;
    emit();
    showToast(saved.error);
    return;
  }
  state.pronLatestId = saved.id;
  state.highlightId = saved.id;
  emit();
  showToast(input.sample ? "見本の採点です。マイクは使っていません" : "採点を保存しました");
}
