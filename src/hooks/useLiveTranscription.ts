import * as React from "react";
import {
  deepgramSocketUrl,
  floatToPcm16,
  liveApi,
  type DeepgramResults,
  type TranscriptionLanguage,
} from "@/api/live";
import { useWakeLock } from "./useRecorder";

/**
 * Streams microphone audio straight to Deepgram and accumulates the transcript.
 *
 * Two things make this different from a short recording:
 *  - The socket is expected to drop during an hour-long meeting, so a drop is
 *    recovered from rather than reported as a failure.
 *  - The credential expires in five minutes, so every reconnect fetches a new
 *    one. Reusing the original token is the classic way this dies at minute 40.
 */

export type LiveStatus =
  | "idle"
  | "connecting"
  | "live"
  | "reconnecting"
  | "stopping"
  | "error";

const KEEPALIVE_MS = 8_000;
const AUDIO_BUFFER = 4096;
/** Backoff between reconnects, capped so a long outage keeps retrying calmly. */
const RETRY_DELAYS_MS = [500, 1_000, 2_000, 4_000, 8_000, 15_000];

export function useLiveTranscription() {
  const [status, setStatus] = React.useState<LiveStatus>("idle");
  const [finalText, setFinalText] = React.useState("");
  const [interimText, setInterimText] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [elapsedMs, setElapsedMs] = React.useState(0);
  const [reconnects, setReconnects] = React.useState(0);

  // Audio graph: created once per session and kept across reconnects, so the
  // browser never re-prompts for the microphone mid-meeting.
  const stream = React.useRef<MediaStream | null>(null);
  const audioCtx = React.useRef<AudioContext | null>(null);
  const processor = React.useRef<ScriptProcessorNode | null>(null);
  const source = React.useRef<MediaStreamAudioSourceNode | null>(null);

  const socket = React.useRef<WebSocket | null>(null);
  const keepAlive = React.useRef<number | null>(null);
  const retryTimer = React.useRef<number | null>(null);
  const attempt = React.useRef(0);

  /** True only until the user presses Stop. Without it, closing the socket
   *  deliberately would trigger the reconnect path and loop forever. */
  const recording = React.useRef(false);
  // The transcript is also held in refs: stop() needs its exact current value
  // synchronously, and reading that out of setState callbacks is not reliable.
  const finalRef = React.useRef("");
  const interimRef = React.useRef("");
  const language = React.useRef<TranscriptionLanguage>("multi");
  const startedAt = React.useRef(0);

  useWakeLock(status === "live" || status === "reconnecting");

  React.useEffect(() => {
    if (status !== "live" && status !== "reconnecting") return;
    const id = window.setInterval(
      () => setElapsedMs(Date.now() - startedAt.current),
      500,
    );
    return () => window.clearInterval(id);
  }, [status]);

  const stopKeepAlive = () => {
    if (keepAlive.current !== null) window.clearInterval(keepAlive.current);
    keepAlive.current = null;
  };

  const teardownAudio = React.useCallback(() => {
    processor.current?.disconnect();
    source.current?.disconnect();
    processor.current = null;
    source.current = null;
    void audioCtx.current?.close().catch(() => undefined);
    audioCtx.current = null;
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
  }, []);

  /** Opens a socket with a freshly minted token and wires the audio to it. */
  const connect = React.useCallback(async () => {
    const ctx = audioCtx.current;
    if (!ctx) return;

    let token: string;
    try {
      token = (await liveApi.deepgramToken()).access_token;
    } catch (err) {
      // A credential we cannot get is fatal whether it is the first attempt or
      // the twentieth — retrying a 503 in a tight loop helps nobody.
      recording.current = false;
      setStatus("error");
      setError(
        err instanceof Error
          ? err.message
          : "Could not get a transcription credential.",
      );
      return;
    }

    if (!recording.current) return; // stopped while the token was in flight

    // Browsers cannot set headers on a WebSocket, so the credential travels as
    // the second subprotocol. The two-element form is what Deepgram expects.
    const ws = new WebSocket(deepgramSocketUrl(language.current, ctx.sampleRate), [
      "bearer",
      token,
    ]);
    ws.binaryType = "arraybuffer";
    socket.current = ws;

    ws.onopen = () => {
      attempt.current = 0;
      setStatus("live");
      setError(null);
      stopKeepAlive();
      // Deepgram drops an idle socket after about ten seconds, and silence in a
      // meeting is normal, so the connection has to be held open explicitly.
      keepAlive.current = window.setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "KeepAlive" }));
        }
      }, KEEPALIVE_MS);
    };

    ws.onmessage = (event) => {
      let msg: DeepgramResults;
      try {
        msg = JSON.parse(String(event.data));
      } catch {
        return;
      }
      if (msg.type !== "Results") return;
      const text = msg.channel?.alternatives?.[0]?.transcript;
      if (!text) return;

      if (msg.is_final) {
        finalRef.current += text + " ";
        interimRef.current = "";
        setFinalText(finalRef.current);
        setInterimText("");
      } else {
        interimRef.current = text;
        setInterimText(text);
      }
    };

    ws.onerror = () => {
      // onclose always follows; recovery is handled there so it happens once.
    };

    ws.onclose = () => {
      stopKeepAlive();
      socket.current = null;
      if (!recording.current) return; // a deliberate stop

      const delay =
        RETRY_DELAYS_MS[Math.min(attempt.current, RETRY_DELAYS_MS.length - 1)];
      attempt.current += 1;
      setReconnects((n) => n + 1);
      setStatus("reconnecting");
      retryTimer.current = window.setTimeout(() => {
        if (recording.current) void connect();
      }, delay);
    };
  }, []);

  const start = React.useCallback(
    async (lang: TranscriptionLanguage) => {
      setError(null);
      finalRef.current = "";
      interimRef.current = "";
      setFinalText("");
      setInterimText("");
      setReconnects(0);
      setElapsedMs(0);
      attempt.current = 0;
      language.current = lang;
      setStatus("connecting");

      try {
        const media = await navigator.mediaDevices.getUserMedia({
          audio: {
            channelCount: 1,
            echoCancellation: true,
            noiseSuppression: true,
          },
        });
        stream.current = media;

        const ctx = new AudioContext({ sampleRate: 16_000 });
        audioCtx.current = ctx;
        // Autoplay policy can hand back a suspended context.
        if (ctx.state === "suspended") await ctx.resume();

        const src = ctx.createMediaStreamSource(media);
        const proc = ctx.createScriptProcessor(AUDIO_BUFFER, 1, 1);
        source.current = src;
        processor.current = proc;

        proc.onaudioprocess = (e) => {
          const ws = socket.current;
          if (!ws || ws.readyState !== WebSocket.OPEN) return;
          ws.send(floatToPcm16(e.inputBuffer.getChannelData(0)));
        };

        src.connect(proc);
        // A ScriptProcessor only runs while connected onward. Its output buffer
        // is never written to, so this emits silence rather than the mic.
        proc.connect(ctx.destination);

        recording.current = true;
        startedAt.current = Date.now();
        await connect();
      } catch (err) {
        recording.current = false;
        teardownAudio();
        setStatus("error");
        const name = (err as DOMException)?.name;
        setError(
          name === "NotAllowedError"
            ? "Microphone access was denied. Allow it in your browser settings, then try again."
            : name === "NotFoundError"
              ? "No microphone was found on this device."
              : window.isSecureContext === false
                ? "Recording needs a secure connection. Open this page over https."
                : "Could not start listening on this device.",
        );
      }
    },
    [connect, teardownAudio],
  );

  const stop = React.useCallback(async (): Promise<string> => {
    recording.current = false;
    setStatus("stopping");
    if (retryTimer.current !== null) window.clearTimeout(retryTimer.current);
    stopKeepAlive();

    const ws = socket.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      // Flushes whatever Deepgram is still holding as a partial result.
      ws.send(JSON.stringify({ type: "CloseStream" }));
      await new Promise<void>((resolve) => {
        const done = () => resolve();
        ws.addEventListener("close", done, { once: true });
        window.setTimeout(done, 1500);
      });
    }
    ws?.close();
    socket.current = null;

    teardownAudio();
    setStatus("idle");

    // The last interim may never have been finalised; keep it rather than lose
    // the closing sentence of the meeting.
    const text = (finalRef.current + interimRef.current).trim();
    finalRef.current = text;
    interimRef.current = "";
    setFinalText(text);
    setInterimText("");
    return text;
  }, [teardownAudio]);

  React.useEffect(() => {
    return () => {
      recording.current = false;
      if (retryTimer.current !== null) window.clearTimeout(retryTimer.current);
      stopKeepAlive();
      socket.current?.close();
      teardownAudio();
    };
  }, [teardownAudio]);

  return {
    status,
    finalText,
    interimText,
    /** Everything said so far, including the not-yet-finalised tail. */
    transcript: (finalText + interimText).trim(),
    error,
    elapsedMs,
    reconnects,
    isActive: status === "live" || status === "reconnecting",
    start,
    stop,
  };
}
