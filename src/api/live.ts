import { apiFetch } from "./client";
import type {
  DeepgramToken,
  ExtractRequest,
  ExtractResponse,
  UUID,
} from "./types";

/**
 * Live transcription support.
 *
 * Audio never passes through our API: the browser streams straight to Deepgram.
 * The server's role is to hand out a short-lived credential and, separately, to
 * turn transcript text into tasks.
 */
export const liveApi = {
  /**
   * A Deepgram credential valid for ~5 minutes. Deliberately not cached — a
   * reconnect an hour into a meeting needs a fresh one, and a stale token fails
   * the socket handshake rather than erroring somewhere visible.
   */
  deepgramToken() {
    return apiFetch<DeepgramToken>("/deepgram-token");
  },

  /**
   * Turn transcript text into tasks.
   *
   * Send only what was said since the last call: the extractor works on whatever
   * it is given, so re-sending the whole transcript re-finds every earlier task
   * and duplicates it on the board.
   */
  extract(meetingId: UUID, body: ExtractRequest) {
    return apiFetch<ExtractResponse>(`/meetings/${meetingId}/extract`, {
      method: "POST",
      body,
    });
  },
};

/* ------------------------------------------------------------ deepgram --- */

export type TranscriptionLanguage = "multi" | "ur" | "en";

export const LANGUAGE_OPTIONS: {
  value: TranscriptionLanguage;
  label: string;
  hint: string;
}[] = [
  {
    value: "multi",
    label: "Mixed languages",
    hint: "Code-switching across English, Hindi and eight others. Urdu is not in the set — spoken Urdu may come back as Hindi, in Devanagari script.",
  },
  {
    value: "ur",
    label: "اردو — Urdu",
    hint: "Proper Urdu script, but no code-switching: English terms like API or deploy may come back mangled.",
  },
  { value: "en", label: "English", hint: "English only." },
];

const DEEPGRAM_URL = "wss://api.deepgram.com/v1/listen";

/**
 * `sampleRate` is the rate the AudioContext actually settled on, not the one we
 * asked for: Safari has historically ignored the requested rate, and declaring
 * 16000 while sending 48000 makes every word come out fast and pitched up.
 */
export function deepgramSocketUrl(
  language: TranscriptionLanguage,
  sampleRate: number,
): string {
  const params = new URLSearchParams({
    model: "nova-3",
    language,
    encoding: "linear16",
    sample_rate: String(Math.round(sampleRate)),
    channels: "1",
    interim_results: "true",
    punctuate: "true",
    smart_format: "true",
  });
  // Deepgram recommends endpointing only for the multilingual model; sending it
  // with a single-language model is not what it is tuned for.
  if (language === "multi") params.set("endpointing", "100");
  return `${DEEPGRAM_URL}?${params}`;
}

/** Float32 samples in [-1,1] to the little-endian 16-bit PCM Deepgram expects. */
export function floatToPcm16(input: Float32Array): ArrayBuffer {
  const out = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out.buffer;
}

/** Shape of the only Deepgram message this client cares about. */
export interface DeepgramResults {
  type: string;
  is_final?: boolean;
  channel?: { alternatives?: { transcript?: string }[] };
}
