import { invokeFunction, saveSpeakingSession, type SpeakingInput } from "./api";
import { DEMO_TURNS, demoFeedback, GEMINI_MODEL, mmss } from "./catalog";
import { parseFeedback } from "./feedback";
import { scoreWavFile } from "./pronounce";
import { emit, state } from "./state";
import { showToast } from "./toast";
import type { SpeakingFeedback, TranscriptLine } from "./types";

type StopReason = "user" | "time" | "leave";

type RecCtor = new () => RecInstance;
type RecInstance = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: RecEvent) => void) | null;
  onerror: ((event: Event) => void) | null;
  onend: (() => void) | null;
};
type RecEvent = { results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> };

const VOICE_KEY = "lifemanager.english.voice";
const RATE_KEY = "lifemanager.english.rate";
const RATES = [0.85, 1, 1.15];

let clock = 0;
let demoClock = 0;
let startedMs = 0;
let lines: TranscriptLine[] = [];
let partial = "";
let statusLine = "";
let modelName = GEMINI_MODEL;
let stopping = false;
let kind: "demo" | "live" | null = null;
let demoIndex = 0;
let generation = 0;
let savedGuard = false;
let activeRec: RecInstance | null = null;
let turnLock = false;
const recordings = new Map<string, Blob>();

function recognitionCtor(): RecCtor | null {
  const host = window as Window & { SpeechRecognition?: RecCtor; webkitSpeechRecognition?: RecCtor };
  return host.SpeechRecognition ?? host.webkitSpeechRecognition ?? null;
}

export function recognitionSupported(): boolean {
  return recognitionCtor() != null;
}

export function synthesisSupported(): boolean {
  return "speechSynthesis" in window;
}

export function speakingBusy(): boolean {
  return state.speakPhase === "connecting" || state.speakPhase === "live" || state.speakPhase === "wrapping";
}

export function hasRecording(id: string | undefined): boolean {
  return !!id && recordings.has(id);
}

export function voiceChoices(): { uri: string; label: string }[] {
  if (!synthesisSupported()) return [];
  return window.speechSynthesis
    .getVoices()
    .filter((voice) => voice.lang.toLowerCase().startsWith("en"))
    .map((voice) => ({ uri: voice.voiceURI, label: `${voice.name}（${voice.lang}）` }));
}

function loadVoicePrefs(): void {
  try {
    const rate = Number(localStorage.getItem(RATE_KEY));
    if (RATES.includes(rate)) state.speakRate = rate;
    const voice = localStorage.getItem(VOICE_KEY);
    if (voice) state.speakVoice = voice;
  } catch {
    /* 保存できない端末では初期値のまま */
  }
}

loadVoicePrefs();

export function rememberVoice(uri: string): void {
  state.speakVoice = uri;
  try {
    localStorage.setItem(VOICE_KEY, uri);
  } catch {
    /* 保存しない */
  }
}

export function rememberRate(rate: number): void {
  if (!RATES.includes(rate)) return;
  state.speakRate = rate;
  try {
    localStorage.setItem(RATE_KEY, String(rate));
  } catch {
    /* 保存しない */
  }
}

export function primeSpeech(): void {
  if (!synthesisSupported()) return;
  const utter = new SpeechSynthesisUtterance(" ");
  utter.volume = 0;
  utter.lang = "en-US";
  window.speechSynthesis.speak(utter);
}

function speakText(text: string): void {
  if (!synthesisSupported() || !text.trim()) return;
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = "en-US";
  utter.rate = state.speakRate;
  const voices = window.speechSynthesis.getVoices().filter((voice) => voice.lang.toLowerCase().startsWith("en"));
  const chosen = voices.find((voice) => voice.voiceURI === state.speakVoice) ?? voices.find((voice) => voice.lang === "en-US") ?? voices[0];
  if (chosen) utter.voice = chosen;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utter);
}

export function replayLine(id: string): void {
  primeSpeech();
  const line = lines.find((item) => item.id === id) ?? state.speakLines.find((item) => item.id === id);
  if (!line) return;
  speakText(line.text);
}

function transcript(): TranscriptLine[] {
  return lines.map(({ role, text, at }) => ({ role, text, at }));
}

function syncState(): void {
  state.speakLines = lines.map((line) => ({ ...line }));
  state.speakPartial = partial;
  state.speakStatus = statusLine;
  if (startedMs) state.speakElapsed = Math.max(0, Math.floor((Date.now() - startedMs) / 1000));
}

function paintLiveBits(): void {
  const elapsed = document.querySelector("[data-speak-elapsed]");
  if (elapsed) elapsed.textContent = `${mmss(state.speakElapsed)} / ${mmss(state.speakMaxMinutes * 60)}`;
  const status = document.querySelector("[data-speak-status]");
  if (status) status.textContent = statusLine;
  const partialEl = document.querySelector("[data-speak-partial]");
  if (partialEl) {
    partialEl.textContent = partial;
    partialEl.toggleAttribute("hidden", partial.length === 0);
  }
}

function publish(full: boolean): void {
  syncState();
  if (!full) {
    paintLiveBits();
    return;
  }
  if (state.dialog) return;
  emit();
}

function resetIdle(): void {
  window.clearInterval(clock);
  window.clearInterval(demoClock);
  clock = 0;
  demoClock = 0;
  startedMs = 0;
  lines = [];
  partial = "";
  statusLine = "";
  stopping = false;
  kind = null;
  demoIndex = 0;
  turnLock = false;
  state.speakListening = false;
  activeRec = null;
  recordings.clear();
  if (synthesisSupported()) window.speechSynthesis.cancel();
  state.speakPhase = "idle";
  state.speakElapsed = 0;
  state.speakLines = [];
  state.speakPartial = "";
  state.speakStatus = "";
  state.speakInput = "";
}

function startClock(): void {
  window.clearInterval(clock);
  clock = window.setInterval(() => {
    if (!startedMs || stopping) return;
    const elapsed = Math.floor((Date.now() - startedMs) / 1000);
    state.speakElapsed = elapsed;
    paintLiveBits();
    if (elapsed >= state.speakMaxMinutes * 60) void stopSpeaking("time");
  }, 500);
}

function payload(feedback: SpeakingFeedback | null, duration: number): SpeakingInput {
  return {
    scenario: state.speakScenario,
    topic: state.speakTopic.trim(),
    level: state.speakLevel,
    max_minutes: state.speakMaxMinutes,
    started_at: new Date(startedMs || Date.now()).toISOString(),
    ended_at: new Date().toISOString(),
    duration_seconds: Math.max(0, Math.min(2400, duration)),
    transcript: transcript(),
    feedback,
    model: kind === "live" ? modelName : null,
  };
}

async function ask(mode: "reply" | "feedback"): Promise<{ ok: true; text: string; feedback: SpeakingFeedback | null } | { ok: false; error: string }> {
  const result = await invokeFunction("conversation-reply", {
    scenario: state.speakScenario,
    level: state.speakLevel,
    topic: state.speakTopic.trim(),
    maxMinutes: state.speakMaxMinutes,
    mode,
    history: lines.map((line) => ({ role: line.role, text: line.text })),
  });
  if (!result.ok) return { ok: false, error: result.error };
  const text = typeof result.data.text === "string" ? result.data.text.trim() : "";
  if (typeof result.data.model === "string" && result.data.model) modelName = result.data.model;
  if (mode === "feedback") return { ok: true, text, feedback: parseFeedback(text) };
  if (!text) return { ok: false, error: "返事が空でした。もう一度話してください。" };
  return { ok: true, text, feedback: null };
}

export async function startSpeaking(): Promise<void> {
  if (speakingBusy()) return;
  const topic = state.speakTopic.trim();
  if (state.speakScenario === "custom" && !topic) {
    showToast("話題を入力してください");
    return;
  }
  primeSpeech();
  state.speakError = null;
  state.speakNotice = null;
  state.speakShowSample = false;
  lines = [];
  partial = "";
  stopping = false;
  savedGuard = false;
  recordings.clear();
  const sessionGen = ++generation;

  if (state.mode === "demo") {
    beginDemo("デモモードです。マイクも Gemini も使いません。今流れているのは、会話が終わったあとの見本です。");
    return;
  }

  kind = "live";
  startedMs = Date.now();
  state.speakPhase = "connecting";
  state.speakElapsed = 0;
  statusLine = "あいさつを考えています";
  state.speakStatus = statusLine;
  emit();
  startClock();
  const greeting = await ask("reply");
  if (sessionGen !== generation || stopping) return;
  if (!greeting.ok) {
    state.speakPhase = "error";
    state.speakError = greeting.error;
    state.speakShowSample = true;
    statusLine = "";
    window.clearInterval(clock);
    kind = null;
    emit();
    return;
  }
  lines.push({ id: crypto.randomUUID(), role: "assistant", text: greeting.text, at: new Date().toISOString() });
  state.speakPhase = "live";
  statusLine = recognitionSupported() ? "話すを押すか、英語を打って送ってください" : "このブラウザは音声認識がありません。英語を打って送ってください";
  publish(true);
  speakText(greeting.text);
}

function beginDemo(notice: string): void {
  kind = "demo";
  state.speakNotice = notice;
  state.speakPhase = "live";
  state.speakElapsed = 0;
  statusLine = "見本を再生しています";
  state.speakStatus = statusLine;
  startedMs = Date.now();
  demoIndex = 0;
  lines = [];
  emit();
  startClock();
  window.clearInterval(demoClock);
  demoClock = window.setInterval(() => {
    if (stopping) return;
    const turn = DEMO_TURNS[demoIndex];
    if (!turn) {
      window.clearInterval(demoClock);
      demoClock = 0;
      void stopSpeaking("user");
      return;
    }
    demoIndex += 1;
    lines.push({ id: `demo-${demoIndex}`, role: turn.role, text: turn.text, at: new Date().toISOString() });
    publish(true);
  }, 900);
}

async function takeTurn(text: string): Promise<void> {
  const spoken = text.trim();
  if (!spoken || kind !== "live" || stopping || turnLock) return;
  if (state.speakElapsed >= state.speakMaxMinutes * 60) {
    void stopSpeaking("time");
    return;
  }
  turnLock = true;
  partial = "";
  lines.push({ id: crypto.randomUUID(), role: "user", text: spoken.slice(0, 1500), at: new Date().toISOString() });
  statusLine = "返事を考えています";
  publish(true);
  const reply = await ask("reply");
  turnLock = false;
  if (stopping || kind !== "live") return;
  if (!reply.ok) {
    state.speakError = reply.error;
    statusLine = "もう一度話してください";
    publish(true);
    showToast(reply.error);
    return;
  }
  const id = crypto.randomUUID();
  lines.push({ id, role: "assistant", text: reply.text, at: new Date().toISOString() });
  state.speakError = null;
  statusLine = recognitionSupported() ? "話すを押すか、英語を打って送ってください" : "英語を打って送ってください";
  publish(true);
  speakText(reply.text);
}

export async function listenAndReply(): Promise<void> {
  primeSpeech();
  if (state.mode === "demo" || kind !== "live") {
    showToast("デモではマイクと Gemini は使いません");
    return;
  }
  if (state.speakListening || turnLock || stopping) return;
  const Ctor = recognitionCtor();
  if (!Ctor) {
    showToast("このブラウザは音声認識に対応していません。英語を打って送ってください");
    return;
  }
  state.speakListening = true;
  partial = "";
  statusLine = "聞いています。少し黙ると止まります";
  publish(true);
  const heard = await captureSpeech(Ctor);
  state.speakListening = false;
  if (stopping || kind !== "live") return;
  if (!heard.text) {
    statusLine = "聞き取れませんでした。もう一度話すか、文字で送ってください";
    publish(true);
    showToast("聞き取れませんでした");
    return;
  }
  const id = crypto.randomUUID();
  if (heard.wav) recordings.set(id, heard.wav);
  lines.push({ id, role: "user", text: heard.text.slice(0, 1500), at: new Date().toISOString() });
  partial = "";
  turnLock = true;
  statusLine = "返事を考えています";
  publish(true);
  const reply = await ask("reply");
  turnLock = false;
  if (stopping || kind !== "live") return;
  if (!reply.ok) {
    state.speakError = reply.error;
    statusLine = "もう一度話してください";
    publish(true);
    showToast(reply.error);
    return;
  }
  lines.push({ id: crypto.randomUUID(), role: "assistant", text: reply.text, at: new Date().toISOString() });
  state.speakError = null;
  statusLine = "話すを押すか、英語を打って送ってください";
  publish(true);
  speakText(reply.text);
}

async function captureSpeech(Ctor: RecCtor): Promise<{ text: string; wav: Blob | null }> {
  let stream: MediaStream | null = null;
  let recorder: MediaRecorder | null = null;
  const chunks: Blob[] = [];
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const preferred = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((type) => MediaRecorder.isTypeSupported(type));
    recorder = preferred ? new MediaRecorder(stream, { mimeType: preferred }) : new MediaRecorder(stream);
    recorder.addEventListener("dataavailable", (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    });
    recorder.start();
  } catch {
    stream?.getTracks().forEach((track) => track.stop());
    stream = null;
    recorder = null;
  }

  const text = await new Promise<string>((resolve) => {
    const rec = new Ctor();
    activeRec = rec;
    rec.lang = "en-US";
    rec.interimResults = true;
    rec.continuous = true;
    let finalText = "";
    let silence = 0;
    const arm = () => {
      window.clearTimeout(silence);
      silence = window.setTimeout(() => rec.stop(), 1300);
    };
    const giveUp = window.setTimeout(() => rec.stop(), 12000);
    rec.onresult = (event) => {
      let interim = "";
      finalText = "";
      for (let i = 0; i < event.results.length; i += 1) {
        const piece = event.results[i][0]?.transcript ?? "";
        if (event.results[i].isFinal) finalText += piece;
        else interim += piece;
      }
      partial = `${finalText} ${interim}`.replace(/\s+/g, " ").trim();
      publish(false);
      if (partial) arm();
    };
    rec.onerror = () => rec.stop();
    rec.onend = () => {
      window.clearTimeout(silence);
      window.clearTimeout(giveUp);
      if (activeRec === rec) activeRec = null;
      resolve((finalText || partial).replace(/\s+/g, " ").trim());
    };
    try {
      rec.start();
    } catch {
      window.clearTimeout(giveUp);
      resolve("");
    }
  });

  const blob = await stopRecorder(recorder, chunks);
  stream?.getTracks().forEach((track) => track.stop());
  let wav: Blob | null = null;
  if (blob && blob.size > 0) {
    try {
      wav = await blobToWav(blob);
    } catch {
      wav = null;
    }
  }
  return { text, wav };
}

function stopRecorder(recorder: MediaRecorder | null, chunks: Blob[]): Promise<Blob | null> {
  if (!recorder) return Promise.resolve(null);
  if (recorder.state === "inactive") {
    return Promise.resolve(chunks.length ? new Blob(chunks, { type: recorder.mimeType || "audio/webm" }) : null);
  }
  return new Promise((resolve) => {
    recorder.addEventListener("stop", () => {
      resolve(chunks.length ? new Blob(chunks, { type: recorder.mimeType || "audio/webm" }) : null);
    });
    try {
      recorder.stop();
    } catch {
      resolve(null);
    }
  });
}

async function blobToWav(blob: Blob): Promise<Blob> {
  const ctx = new AudioContext();
  try {
    const decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
    return encodeWav(decoded, 16000);
  } finally {
    await ctx.close();
  }
}

function encodeWav(buffer: AudioBuffer, rate: number): Blob {
  const length = Math.max(1, Math.floor(buffer.duration * rate));
  const channel = buffer.getChannelData(0);
  const bytes = new ArrayBuffer(44 + length * 2);
  const view = new DataView(bytes);
  const write = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i += 1) view.setUint8(offset + i, value.charCodeAt(i));
  };
  write(0, "RIFF");
  view.setUint32(4, 36 + length * 2, true);
  write(8, "WAVE");
  write(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, "data");
  view.setUint32(40, length * 2, true);
  let offset = 44;
  for (let i = 0; i < length; i += 1) {
    const src = Math.min(channel.length - 1, Math.floor((i / rate) * buffer.sampleRate));
    const sample = Math.max(-1, Math.min(1, channel[src] ?? 0));
    view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
    offset += 2;
  }
  return new Blob([bytes], { type: "audio/wav" });
}

export async function sendTyped(): Promise<void> {
  primeSpeech();
  const text = state.speakInput.trim();
  if (!text) {
    showToast("英語を入力してください");
    return;
  }
  if (kind !== "live") {
    showToast("先に会話を始めてください");
    return;
  }
  if (state.speakListening || turnLock) {
    showToast("聞き取りが終わってから送ってください");
    return;
  }
  state.speakInput = "";
  await takeTurn(text);
}

export async function scoreUtterance(id: string, text: string, sessionId: string | null): Promise<boolean> {
  const wav = recordings.get(id);
  if (!wav) return false;
  const file = new File([wav], "utterance.wav", { type: "audio/wav" });
  const result = await scoreWavFile(file, text.slice(0, 500), sessionId);
  if (!result.ok) {
    if (result.error) showToast(result.error);
    return false;
  }
  return true;
}

export async function stopSpeaking(reason: StopReason): Promise<void> {
  if (stopping) return;
  if (!kind) return;
  generation += 1;
  const playback = kind;
  stopping = true;
  activeRec?.abort();
  activeRec = null;
  state.speakListening = false;
  window.clearInterval(demoClock);
  demoClock = 0;
  const duration = startedMs ? Math.max(1, Math.floor((Date.now() - startedMs) / 1000)) : Math.max(1, state.speakElapsed);
  const spoken = transcript();
  let feedback: SpeakingFeedback | null = playback === "demo" ? demoFeedback() : null;
  if (playback === "live" && reason !== "leave" && spoken.length) {
    state.speakPhase = "wrapping";
    statusLine = reason === "time" ? "上限の時間です。まとめを作っています" : "まとめを作っています";
    publish(true);
    const summary = await ask("feedback");
    if (summary.ok) feedback = summary.feedback;
  }
  window.clearInterval(clock);
  clock = 0;
  if (synthesisSupported()) window.speechSynthesis.cancel();
  if (!spoken.length) {
    const timeUp = reason === "time";
    resetIdle();
    emit();
    showToast(timeUp ? "上限の時間になったので終了しました" : "話す前に終了したので、記録は残していません");
    return;
  }
  if (!savedGuard) {
    savedGuard = true;
    const result = await saveSpeakingSession(payload(feedback, duration));
    const timeUp = reason === "time";
    resetIdle();
    if (!result.ok) {
      state.speakPhase = "error";
      state.speakError = result.error;
      state.speakLines = spoken;
      emit();
      showToast(result.error);
      return;
    }
    state.speakOpenId = result.id;
    state.highlightId = result.id;
    emit();
    showToast(timeUp ? "上限の時間になったので保存しました" : playback === "demo" ? "見本の会話を記録しました" : "会話を保存しました");
    return;
  }
  resetIdle();
  emit();
}

export function abortSpeaking(): void {
  if (!kind && state.speakPhase !== "connecting") return;
  const spoken = transcript();
  const duration = startedMs ? Math.max(1, Math.floor((Date.now() - startedMs) / 1000)) : 1;
  const snapshot = kind;
  const body = spoken.length ? payload(snapshot === "demo" ? demoFeedback() : null, duration) : null;
  stopping = true;
  activeRec?.abort();
  generation += 1;
  resetIdle();
  if (body) void saveSpeakingSession(body);
}

export function stopListening(): void {
  activeRec?.stop();
}
