/**
 * Client-side check that a blob is really decodable audio.
 *
 * The server validates uploads by downloading the object and running it through
 * ffmpeg; if that fails it answers 415 "That file could not be read as audio."
 * By then the user has waited through a full upload to Cloudflare for nothing.
 * The same verdict is available locally in milliseconds, so it is taken here
 * first and a bad take is never uploaded at all.
 */

export interface AudioCheck {
  ok: boolean;
  /** Written for the user, not the log. */
  reason?: string;
  /** Infinity for a live-recorded WebM, which never carries a duration. */
  durationSeconds?: number;
}

type Magic = { name: string; offset: number; bytes: number[] };

// Container signatures for every extension the API accepts.
const SIGNATURES: Magic[] = [
  { name: "webm", offset: 0, bytes: [0x1a, 0x45, 0xdf, 0xa3] }, // EBML
  { name: "ogg", offset: 0, bytes: [0x4f, 0x67, 0x67, 0x53] }, // OggS
  { name: "wav", offset: 0, bytes: [0x52, 0x49, 0x46, 0x46] }, // RIFF
  { name: "flac", offset: 0, bytes: [0x66, 0x4c, 0x61, 0x43] }, // fLaC
  { name: "mp3", offset: 0, bytes: [0x49, 0x44, 0x33] }, // ID3
  { name: "mp4", offset: 4, bytes: [0x66, 0x74, 0x79, 0x70] }, // ....ftyp
];

function matches(head: Uint8Array, sig: Magic): boolean {
  return sig.bytes.every((b, i) => head[sig.offset + i] === b);
}

/** An MPEG audio frame sync, for mp3 files with no ID3 tag. */
function isMpegFrame(head: Uint8Array): boolean {
  return head[0] === 0xff && (head[1] & 0xe0) === 0xe0;
}

async function readHeader(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blob.slice(0, 16).arrayBuffer());
}

/**
 * Loads metadata through an <audio> element rather than decodeAudioData:
 * the element parses the container without decoding the whole stream to PCM,
 * which matters when a 90-minute recording would otherwise expand to ~1 GB.
 */
function probe(blob: Blob, timeoutMs: number): Promise<AudioCheck> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const el = document.createElement("audio");
    el.preload = "metadata";

    const done = (result: AudioCheck) => {
      clearTimeout(timer);
      el.removeAttribute("src");
      el.load();
      URL.revokeObjectURL(url);
      resolve(result);
    };

    const timer = setTimeout(
      // Inconclusive is not the same as broken: let the upload proceed and let
      // the server be the judge rather than blocking on a slow decoder.
      () => done({ ok: true }),
      timeoutMs,
    );

    el.onloadedmetadata = () => done({ ok: true, durationSeconds: el.duration });
    el.onerror = () =>
      done({
        ok: false,
        reason:
          "This audio cannot be played back on this device, so the server will not be able to transcribe it either.",
      });

    el.src = url;
  });
}

export async function verifyAudioBlob(
  blob: Blob,
  { timeoutMs = 4000 }: { timeoutMs?: number } = {},
): Promise<AudioCheck> {
  if (blob.size === 0) {
    return { ok: false, reason: "This recording is empty — nothing was captured." };
  }
  if (blob.size < 1024) {
    return {
      ok: false,
      reason: "This recording is too short to contain any audio.",
    };
  }

  const head = await readHeader(blob);
  const known = SIGNATURES.some((sig) => matches(head, sig)) || isMpegFrame(head);
  if (!known) {
    // The commonest cause by far: the first chunk of a recording, which carries
    // the container header, never made it to disk.
    return {
      ok: false,
      reason:
        "This file is missing its audio header, so nothing can read it. This happens when the start of a recording fails to save. Please record it again.",
    };
  }

  return probe(blob, timeoutMs);
}
