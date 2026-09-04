import * as React from "react";
import { appendChunk, createSession, patchSession } from "@/db/idb";
import { MAX_DURATION_MIN } from "@/api/upload";

/* ----------------------------------------------------------- wake lock --- */

type WakeLockLike = { release: () => Promise<void>; released: boolean };
type WakeLockNavigator = Navigator & {
  wakeLock?: { request: (type: "screen") => Promise<WakeLockLike> };
};

/**
 * Holds a screen wake lock while `active`. The lock is dropped by the browser
 * whenever the tab hides, so it is re-requested on every visibilitychange —
 * without this, iOS locks the screen and suspends MediaRecorder mid-meeting.
 */
export function useWakeLock(active: boolean) {
  const sentinel = React.useRef<WakeLockLike | null>(null);
  const [supported] = React.useState(
    () => typeof navigator !== "undefined" && "wakeLock" in navigator,
  );

  React.useEffect(() => {
    if (!active || !supported) return;
    let cancelled = false;

    const acquire = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const lock = await (navigator as WakeLockNavigator).wakeLock?.request(
          "screen",
        );
        if (cancelled) {
          void lock?.release();
          return;
        }
        sentinel.current = lock ?? null;
      } catch {
        // Denied or unsupported: recording still works, the screen may sleep.
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") void acquire();
    };

    void acquire();
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      void sentinel.current?.release().catch(() => undefined);
      sentinel.current = null;
    };
  }, [active, supported]);

  return supported;
}

/* ------------------------------------------------------------ recorder --- */

export type RecorderState = "idle" | "starting" | "recording" | "paused" | "stopping";

export interface RecorderResult {
  sessionId: string;
  mimeType: string;
  durationMs: number;
  bytes: number;
  /** Chunks MediaRecorder handed over — compare against what came back out. */
  chunkCount: number;
  /** True if any chunk failed to reach IndexedDB. */
  incomplete: boolean;
}

const CHUNK_INTERVAL_MS = 10_000; // a crash costs at most 10 seconds
const MAX_DURATION_MS = MAX_DURATION_MIN * 60_000;
const WARN_AT_MS = MAX_DURATION_MS - 5 * 60_000;

/** Opus in WebM where it exists; Safari needs audio/mp4. */
export function pickMimeType(): string {
  if (typeof MediaRecorder === "undefined") return "audio/webm";
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus",
  ];
  return candidates.find((c) => MediaRecorder.isTypeSupported(c)) ?? "";
}

export function useRecorder() {
  const [state, setState] = React.useState<RecorderState>("idle");
  const [elapsedMs, setElapsedMs] = React.useState(0);
  const [level, setLevel] = React.useState(0);
  const [error, setError] = React.useState<string | null>(null);
  const [sessionId, setSessionId] = React.useState<string | null>(null);

  const recorder = React.useRef<MediaRecorder | null>(null);
  const stream = React.useRef<MediaStream | null>(null);
  const audioCtx = React.useRef<AudioContext | null>(null);
  const rafId = React.useRef<number | null>(null);
  const seq = React.useRef(0);
  const startedAt = React.useRef(0);
  const accumulated = React.useRef(0);
  const sessionRef = React.useRef<string | null>(null);
  const bytes = React.useRef(0);
  /** Serialises chunk writes to IndexedDB; awaited before a take is assembled. */
  const writeQueue = React.useRef<Promise<void>>(Promise.resolve());
  const writeFailed = React.useRef(false);

  useWakeLock(state === "recording" || state === "paused");

  const teardown = React.useCallback(() => {
    if (rafId.current !== null) cancelAnimationFrame(rafId.current);
    rafId.current = null;
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    void audioCtx.current?.close().catch(() => undefined);
    audioCtx.current = null;
    recorder.current = null;
    setLevel(0);
  }, []);

  React.useEffect(() => teardown, [teardown]);

  // Elapsed clock, and the hard 90-minute ceiling the API enforces at upload.
  React.useEffect(() => {
    if (state !== "recording") return;
    const id = window.setInterval(() => {
      const ms = accumulated.current + (Date.now() - startedAt.current);
      setElapsedMs(ms);
      if (ms >= MAX_DURATION_MS) {
        recorder.current?.stop();
      }
    }, 250);
    return () => window.clearInterval(id);
  }, [state]);

  const meter = React.useCallback((mediaStream: MediaStream) => {
    try {
      const ctx = new AudioContext();
      audioCtx.current = ctx;
      const source = ctx.createMediaStreamSource(mediaStream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      const buf = new Uint8Array(analyser.frequencyBinCount);

      const tick = () => {
        analyser.getByteTimeDomainData(buf);
        let sum = 0;
        for (const v of buf) {
          const centred = (v - 128) / 128;
          sum += centred * centred;
        }
        setLevel(Math.min(1, Math.sqrt(sum / buf.length) * 3.2));
        rafId.current = requestAnimationFrame(tick);
      };
      rafId.current = requestAnimationFrame(tick);
    } catch {
      // A level meter is decoration; never let it break the recording.
    }
  }, []);

  const start = React.useCallback(
    async (meeting: { id: string | null; title: string }) => {
      setError(null);
      setState("starting");
      try {
        const media = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            channelCount: 1,
          },
        });
        stream.current = media;

        const mimeType = pickMimeType();
        // 32 kbps mono keeps 90 minutes near 20 MB — far below the 500 MB cap
        // and a fraction of the upload time of the browser default.
        const rec = new MediaRecorder(
          media,
          mimeType
            ? { mimeType, audioBitsPerSecond: 32_000 }
            : { audioBitsPerSecond: 32_000 },
        );
        recorder.current = rec;

        const id = crypto.randomUUID();
        sessionRef.current = id;
        setSessionId(id);
        seq.current = 0;
        bytes.current = 0;
        writeQueue.current = Promise.resolve();
        writeFailed.current = false;
        accumulated.current = 0;
        startedAt.current = Date.now();
        setElapsedMs(0);

        await createSession({
          id,
          meetingId: meeting.id,
          meetingTitle: meeting.title,
          mimeType: rec.mimeType || mimeType || "audio/webm",
        });

        rec.ondataavailable = (e) => {
          if (!e.data || e.data.size === 0) return;
          const index = seq.current++;
          bytes.current += e.data.size;

          // Persisted as it arrives, so a suspend or crash loses one chunk.
          //
          // The writes are chained rather than fired off in parallel: each one
          // opens a read-modify-write transaction on the session row, and
          // overlapping transactions can drop a write. Losing chunk 0 loses the
          // WebM header, which makes the whole recording undecodable server-side
          // even though every other byte arrived.
          writeQueue.current = writeQueue.current
            .then(() => appendChunk(id, index, e.data))
            .catch(() => {
              writeFailed.current = true;
              setError(
                "This device could not save part of the recording. Stop and upload now — the audio may be incomplete.",
              );
            });
        };

        rec.onerror = () => {
          setError("The recorder stopped unexpectedly. The audio so far is saved.");
        };

        rec.start(CHUNK_INTERVAL_MS);
        setState("recording");
        meter(media);
      } catch (err) {
        teardown();
        setState("idle");
        const name = (err as DOMException)?.name;
        setError(
          name === "NotAllowedError"
            ? "Microphone access was denied. Allow it in your browser settings, then try again."
            : name === "NotFoundError"
              ? "No microphone was found on this device."
              : "Could not start recording on this device.",
        );
      }
    },
    [meter, teardown],
  );

  const pause = React.useCallback(() => {
    if (recorder.current?.state !== "recording") return;
    recorder.current.pause();
    accumulated.current += Date.now() - startedAt.current;
    setState("paused");
  }, []);

  const resume = React.useCallback(() => {
    if (recorder.current?.state !== "paused") return;
    startedAt.current = Date.now();
    recorder.current.resume();
    setState("recording");
  }, []);

  /** Stops, flushes the final chunk, and resolves once it is written to IndexedDB. */
  const stop = React.useCallback((): Promise<RecorderResult | null> => {
    const rec = recorder.current;
    const id = sessionRef.current;
    if (!rec || !id || rec.state === "inactive") return Promise.resolve(null);

    setState("stopping");
    const durationMs =
      accumulated.current +
      (rec.state === "recording" ? Date.now() - startedAt.current : 0);

    return new Promise((resolve) => {
      rec.onstop = () => {
        void (async () => {
          // ondataavailable for the final chunk fires just before onstop, so by
          // now it is on the queue. Waiting for the queue to drain — rather than
          // guessing at a timeout — is what guarantees the assembled blob holds
          // every chunk that was recorded.
          await writeQueue.current;

          const mimeType = rec.mimeType || "audio/webm";
          await patchSession(id, {
            state: "ready",
            durationMs,
            bytes: bytes.current,
          });
          teardown();
          setState("idle");
          setElapsedMs(0);
          resolve({
            sessionId: id,
            mimeType,
            durationMs,
            bytes: bytes.current,
            chunkCount: seq.current,
            incomplete: writeFailed.current,
          });
        })();
      };
      rec.stop();
    });
  }, [teardown]);

  /** Abandon the take: stop the hardware without promoting the session. */
  const cancel = React.useCallback(async () => {
    const rec = recorder.current;
    if (rec && rec.state !== "inactive") {
      rec.onstop = null;
      rec.stop();
    }
    teardown();
    setState("idle");
    setElapsedMs(0);
    setSessionId(null);
    sessionRef.current = null;
  }, [teardown]);

  return {
    state,
    elapsedMs,
    level,
    error,
    sessionId,
    isNearLimit: elapsedMs >= WARN_AT_MS,
    maxDurationMs: MAX_DURATION_MS,
    start,
    pause,
    resume,
    stop,
    cancel,
    clearError: () => setError(null),
  };
}
