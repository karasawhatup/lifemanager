import { invokeFunction, saveSpeakingSession, type SpeakingInput } from "./api";
import { DEMO_TURNS, demoFeedback, mmss, REALTIME_MODEL } from "./catalog";
import { parseFeedback } from "./feedback";
import { emit, state } from "./state";
import { showToast } from "./toast";
import type { SpeakingFeedback, TranscriptLine } from "./types";

type LiveLine = TranscriptLine & { id: string };
type StopReason = "user" | "time" | "leave";

const FEEDBACK_PROMPT = [
  "The speaking practice is over.",
  "Reply with JSON only. No markdown. No spoken words.",
  "Use this shape:",
  '{"good_points":["日本語"],"mistakes":[{"original":"learner English","correction":"natural English","note":"短い日本語"}],"expressions":[{"term":"useful English","meaning":"日本語","example":"one English sentence"}]}',
  "good_points: 2 or 3 short Japanese comments on what the learner did well.",
  "mistakes: up to 5 notable mistakes the learner actually made. Skip tiny slips. note is Japanese.",
  "expressions: 2 to 4 useful expressions from this conversation.",
  "If there were no notable mistakes, use an empty mistakes array.",
].join("\n");

let pc: RTCPeerConnection | null = null;
let dc: RTCDataChannel | null = null;
let mic: MediaStream | null = null;
let remoteAudio: HTMLAudioElement | null = null;
let clock = 0;
let demoClock = 0;
let startedMs = 0;
let lines: LiveLine[] = [];
let partial = "";
let statusLine = "";
let modelName = REALTIME_MODEL;
let wrapping = false;
let feedbackText = "";
let feedbackResolve: ((value: string) => void) | null = null;
let stopping = false;
let kind: "demo" | "live" | null = null;
let demoIndex = 0;
let generation = 0;

function ensureAudio(): HTMLAudioElement {
  if (!remoteAudio) {
    remoteAudio = document.createElement("audio");
    remoteAudio.autoplay = true;
    remoteAudio.setAttribute("playsinline", "");
    remoteAudio.dataset.speakingAudio = "1";
    document.body.appendChild(remoteAudio);
  }
  return remoteAudio;
}

function transcript(): TranscriptLine[] {
  return lines.map(({ role, text, at }) => ({ role, text, at }));
}

function syncState(): void {
  state.speakLines = transcript();
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

export function micSupported(): boolean {
  return !!navigator.mediaDevices?.getUserMedia && typeof RTCPeerConnection === "function";
}

export function speakingBusy(): boolean {
  return state.speakPhase === "connecting" || state.speakPhase === "live" || state.speakPhase === "wrapping";
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
  wrapping = false;
  stopping = false;
  kind = null;
  demoIndex = 0;
  feedbackText = "";
  feedbackResolve = null;
  state.speakPhase = "idle";
  state.speakElapsed = 0;
  state.speakLines = [];
  state.speakPartial = "";
  state.speakStatus = "";
}

function stopMic(): void {
  mic?.getTracks().forEach((track) => track.stop());
  mic = null;
}

function closePeer(): void {
  stopMic();
  try {
    dc?.close();
  } catch {
    /* すでに閉じている */
  }
  try {
    pc?.close();
  } catch {
    /* すでに閉じている */
  }
  dc = null;
  pc = null;
  if (remoteAudio) remoteAudio.srcObject = null;
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

export async function startSpeaking(): Promise<void> {
  if (speakingBusy()) return;
  const topic = state.speakTopic.trim();
  if (state.speakScenario === "custom" && !topic) {
    showToast("話題を入力してください");
    return;
  }
  const audio = ensureAudio();
  void audio.play().catch(() => undefined);
  state.speakError = null;
  state.speakNotice = null;
  state.speakShowSample = false;
  lines = [];
  partial = "";
  stopping = false;
  wrapping = false;
  savedGuard = false;
  const sessionGen = ++generation;

  if (state.mode === "demo") {
    beginDemo("デモモードです。マイクとAIにはつながっていません。今流れているのは、会話が終わったあとの見本です。");
    return;
  }
  if (!micSupported()) {
    state.speakPhase = "error";
    state.speakError = "このブラウザはマイクか WebRTC に対応していません。iPhone は Safari で開いてください。";
    state.speakShowSample = true;
    emit();
    return;
  }

  state.speakPhase = "connecting";
  state.speakElapsed = 0;
  statusLine = "マイクを準備しています";
  state.speakStatus = statusLine;
  emit();

  try {
    mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  } catch {
    if (sessionGen !== generation) return;
    stopMic();
    showFailure("マイクを使えませんでした。ブラウザの許可を確認してください。iPhone は Safari で開いてください。");
    return;
  }
  if (sessionGen !== generation) {
    stopMic();
    return;
  }

  statusLine = "接続しています";
  state.speakStatus = statusLine;
  emit();
  const token = await invokeFunction("realtime-session", {
    scenario: state.speakScenario,
    level: state.speakLevel,
    topic,
    maxMinutes: state.speakMaxMinutes,
  });
  if (sessionGen !== generation) {
    stopMic();
    return;
  }
  if (!token.ok) {
    stopMic();
    showFailure(token.error);
    return;
  }
  const secret = typeof token.data.value === "string" ? token.data.value : "";
  if (typeof token.data.model === "string" && token.data.model) modelName = token.data.model;
  if (!secret) {
    stopMic();
    showFailure("会話用のトークンが返りませんでした。");
    return;
  }

  try {
    await connectWebRtc(secret, sessionGen);
  } catch {
    if (sessionGen !== generation) return;
    closePeer();
    showFailure("会話サーバーに接続できませんでした。少し待ってからもう一度試してください。");
  }
}

let savedGuard = false;

function showFailure(message: string): void {
  kind = null;
  state.speakPhase = "error";
  state.speakError = message;
  state.speakShowSample = true;
  state.speakStatus = "";
  statusLine = "";
  emit();
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
  window.clearInterval(clock);
  clock = window.setInterval(() => {
    if (!startedMs || stopping) return;
    state.speakElapsed = Math.max(0, Math.floor((Date.now() - startedMs) / 1000));
    paintLiveBits();
  }, 500);
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

async function connectWebRtc(secret: string, sessionGen: number): Promise<void> {
  const connection = new RTCPeerConnection();
  pc = connection;
  kind = "live";
  const audio = ensureAudio();
  connection.ontrack = (event) => {
    const [stream] = event.streams;
    if (!stream) return;
    audio.srcObject = stream;
    void audio.play().catch(() => undefined);
  };
  connection.onconnectionstatechange = () => {
    if (connection.connectionState === "failed" && !stopping) {
      state.speakError = "接続に失敗しました";
      void stopSpeaking("leave");
    }
  };
  const stream = mic;
  const track = stream?.getAudioTracks()[0];
  if (!track) throw new Error("マイクがありません");
  connection.addTrack(track, stream);
  const channel = connection.createDataChannel("oai-events");
  dc = channel;
  channel.addEventListener("message", (event) => onEvent(String(event.data)));
  channel.addEventListener("open", () => {
    if (stopping || sessionGen !== generation) return;
    startedMs = Date.now();
    state.speakPhase = "live";
    statusLine = "マイクはオンです。話してください";
    state.speakStatus = statusLine;
    channel.send(JSON.stringify({ type: "response.create" }));
    window.clearInterval(clock);
    clock = window.setInterval(() => {
      if (!startedMs || stopping) return;
      const elapsed = Math.floor((Date.now() - startedMs) / 1000);
      state.speakElapsed = elapsed;
      paintLiveBits();
      if (elapsed >= state.speakMaxMinutes * 60) void stopSpeaking("time");
    }, 500);
    publish(true);
  });
  const offer = await connection.createOffer();
  await connection.setLocalDescription(offer);
  const response = await fetch("https://api.openai.com/v1/realtime/calls", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/sdp",
    },
    body: offer.sdp ?? "",
  });
  const answer = await response.text();
  if (sessionGen !== generation) throw new Error("cancelled");
  if (!response.ok || !answer.includes("v=0")) throw new Error("sdp");
  await connection.setRemoteDescription({ type: "answer", sdp: answer });
  if (sessionGen !== generation) closePeer();
}

function onEvent(raw: string): void {
  let event: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return;
    event = parsed as Record<string, unknown>;
  } catch {
    return;
  }
  const type = String(event.type ?? "");
  if (type === "input_audio_buffer.speech_started") {
    statusLine = "聞いています";
    publish(false);
    return;
  }
  if (type === "input_audio_buffer.speech_stopped") {
    statusLine = "文字にしています";
    publish(false);
    return;
  }
  if (type === "conversation.item.input_audio_transcription.completed") {
    const text = String(event.transcript ?? "").trim();
    if (text) upsert(String(event.item_id ?? crypto.randomUUID()), "user", text);
    statusLine = "マイクはオンです。話してください";
    publish(true);
    return;
  }
  if (!wrapping && (type === "response.output_audio_transcript.delta" || type === "response.audio_transcript.delta")) {
    partial += String(event.delta ?? "");
    publish(false);
    return;
  }
  if (!wrapping && (type === "response.output_audio_transcript.done" || type === "response.audio_transcript.done")) {
    const text = String(event.transcript ?? partial).trim();
    partial = "";
    if (text) upsert(String(event.item_id ?? event.response_id ?? crypto.randomUUID()), "assistant", text);
    publish(true);
    return;
  }
  if (wrapping && (type === "response.output_text.delta" || type === "response.text.delta")) {
    feedbackText += String(event.delta ?? "");
    return;
  }
  if (wrapping && (type === "response.output_text.done" || type === "response.text.done")) {
    finishFeedback(String(event.text ?? event.transcript ?? feedbackText));
    return;
  }
  if (wrapping && type === "response.done") {
    const response = event.response;
    const chunks: string[] = [];
    if (response && typeof response === "object" && "output" in response && Array.isArray(response.output)) {
      for (const item of response.output) {
        if (!item || typeof item !== "object" || !("content" in item) || !Array.isArray(item.content)) continue;
        for (const content of item.content) {
          if (!content || typeof content !== "object") continue;
          if ("text" in content && typeof content.text === "string") chunks.push(content.text);
          if ("transcript" in content && typeof content.transcript === "string") chunks.push(content.transcript);
        }
      }
    }
    const joined = chunks.join("") || feedbackText;
    if (joined.includes("{")) finishFeedback(joined);
  }
}

function upsert(id: string, role: TranscriptLine["role"], text: string): void {
  const current = lines.find((line) => line.id === id);
  if (current) current.text = text;
  else lines.push({ id, role, text, at: new Date().toISOString() });
}

function requestFeedback(): Promise<string> {
  feedbackText = "";
  wrapping = true;
  return new Promise((resolve) => {
    let settled = false;
    const done = (value: string) => {
      if (settled) return;
      settled = true;
      feedbackResolve = null;
      resolve(value);
    };
    feedbackResolve = done;
    const channel = dc;
    if (!channel || channel.readyState !== "open") {
      done("");
      return;
    }
    channel.send(JSON.stringify({ type: "response.cancel" }));
    channel.send(
      JSON.stringify({
        type: "conversation.item.create",
        item: {
          type: "message",
          role: "user",
          content: [{ type: "input_text", text: "The practice is over. Send the feedback JSON only." }],
        },
      }),
    );
    channel.send(
      JSON.stringify({
        type: "response.create",
        response: { output_modalities: ["text"], instructions: FEEDBACK_PROMPT },
      }),
    );
    window.setTimeout(() => done(feedbackText), 20000);
  });
}

function finishFeedback(text: string): void {
  feedbackResolve?.(text);
}

export async function stopSpeaking(reason: StopReason): Promise<void> {
  if (stopping) return;
  if (!kind) {
    if (state.speakPhase === "connecting") {
      generation += 1;
      stopping = true;
      closePeer();
      resetIdle();
      emit();
    }
    return;
  }
  generation += 1;
  const playback = kind;
  stopping = true;
  window.clearInterval(demoClock);
  demoClock = 0;
  const duration = startedMs ? Math.max(1, Math.floor((Date.now() - startedMs) / 1000)) : Math.max(1, state.speakElapsed);
  const spoken = transcript();
  let feedback: SpeakingFeedback | null = kind === "demo" ? demoFeedback() : null;

  if (kind === "live") {
    stopMic();
    state.speakPhase = "wrapping";
    statusLine = reason === "time" ? "上限の時間です。まとめを作っています" : "まとめを作っています";
    state.speakStatus = statusLine;
    publish(true);
    if (reason !== "leave" && spoken.length) {
      const raw = await requestFeedback();
      feedback = parseFeedback(raw);
    }
  }

  window.clearInterval(clock);
  clock = 0;
  closePeer();

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
    showToast(
      timeUp ? "上限の時間になったので保存しました" : playback === "demo" ? "見本の会話を記録しました" : "会話を保存しました",
    );
    return;
  }
  resetIdle();
  emit();
}

export function abortSpeaking(): void {
  if (!kind && state.speakPhase !== "connecting") return;
  const spoken = transcript();
  const duration = startedMs ? Math.max(1, Math.floor((Date.now() - startedMs) / 1000)) : 1;
  const snapshotKind = kind;
  const body = spoken.length ? payload(snapshotKind === "demo" ? demoFeedback() : null, duration) : null;
  stopping = true;
  closePeer();
  resetIdle();
  if (body) void saveSpeakingSession(body);
}
