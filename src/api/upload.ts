import { ApiError, API_BASE, apiFetch, getAccessToken } from "./client";
import type { Meeting, PresignResponse, UUID } from "./types";

/**
 * Audio upload. Guide §5.
 *
 * Path A (presign -> PUT direct to Cloudflare R2 -> complete) is the real path:
 * the bytes never touch the API worker. Path B (multipart through the API)
 * writes to the server's local disk and never reaches R2 — it exists only as a
 * fallback for when object storage is switched off server-side.
 */

export const ACCEPTED_EXTENSIONS = [
  ".webm", ".ogg", ".oga", ".opus", ".mp3", ".m4a",
  ".mp4", ".wav", ".aac", ".flac", ".3gp",
] as const;

export const MAX_UPLOAD_BYTES = 500 * 1024 * 1024; // 500 MB
export const MAX_DURATION_MIN = 90;

export type UploadPhase = "presigning" | "uploading" | "confirming";

export interface UploadProgress {
  phase: UploadPhase;
  /** 0..1 for the byte transfer itself; 0 during presign/confirm. */
  ratio: number;
  /** True while bytes are going to Cloudflare rather than to our API. */
  direct: boolean;
}

export type UploadErrorKind =
  | "cors" // preflight blocked: status 0, nothing reached any server
  | "network"
  | "expired" // signature expired mid-upload
  | "storage-disabled" // 501, R2 not configured
  | "api";

export class UploadError extends Error {
  readonly kind: UploadErrorKind;
  constructor(kind: UploadErrorKind, message: string) {
    super(message);
    this.name = "UploadError";
    this.kind = kind;
  }
}

export function extensionFor(mimeType: string): string {
  const base = mimeType.split(";")[0].trim().toLowerCase();
  const map: Record<string, string> = {
    "audio/webm": ".webm",
    "video/webm": ".webm",
    "audio/ogg": ".ogg",
    "audio/opus": ".opus",
    "audio/mpeg": ".mp3",
    "audio/mp3": ".mp3",
    "audio/mp4": ".m4a",
    "video/mp4": ".mp4",
    "audio/x-m4a": ".m4a",
    "audio/aac": ".aac",
    "audio/wav": ".wav",
    "audio/x-wav": ".wav",
    "audio/flac": ".flac",
    "audio/3gpp": ".3gp",
  };
  return map[base] ?? ".webm";
}

/**
 * "audio/webm;codecs=opus" -> "audio/webm".
 *
 * MediaRecorder reports the codec parameter, but the presign contract expects a
 * plain type ("audio/webm"), and whatever goes in has to come back out as the
 * PUT's Content-Type for the signature to verify. Sending the bare type keeps
 * both ends agreeing on one string.
 */
export function baseMimeType(type: string): string {
  return type.split(";")[0].trim().toLowerCase();
}

export function isAcceptedFilename(name: string): boolean {
  const dot = name.lastIndexOf(".");
  if (dot < 0) return false;
  return (ACCEPTED_EXTENSIONS as readonly string[]).includes(
    name.slice(dot).toLowerCase(),
  );
}

/* ------------------------------------------------------- path A: to R2 --- */

interface PutOptions {
  contentType: string;
  onProgress?: (ratio: number) => void;
  signal?: AbortSignal;
}

/**
 * Raw PUT to Cloudflare. No Authorization header — the signature in the query
 * string is the credential. XHR rather than fetch, because fetch cannot report
 * upload progress.
 */
function putToR2(url: string, blob: Blob, opts: PutOptions): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    // Must match the presign response exactly or the signature will not verify.
    xhr.setRequestHeader("Content-Type", opts.contentType);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) opts.onProgress?.(e.loaded / e.total);
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve();
      if (xhr.status === 403) {
        return reject(
          new UploadError(
            "expired",
            "Cloudflare rejected the upload (403). The signed link expired, or the content type did not match the one it was signed for. Retrying requests a fresh link.",
          ),
        );
      }
      reject(
        new UploadError("network", `Cloudflare rejected the upload: HTTP ${xhr.status}`),
      );
    };

    // status 0 means the browser blocked it before it left: almost always the
    // R2 bucket CORS policy missing this origin, or missing PUT. Guide §5.4.
    xhr.onerror = () =>
      reject(
        new UploadError(
          "cors",
          "The browser blocked the upload before it reached Cloudflare. The R2 bucket CORS policy must allow this origin with the PUT method.",
        ),
      );

    xhr.onabort = () => reject(new UploadError("network", "Upload cancelled."));
    opts.signal?.addEventListener("abort", () => xhr.abort(), { once: true });

    xhr.send(blob);
  });
}

/* --------------------------------------------- path B: through the API --- */

function postMultipart(
  meetingId: UUID,
  blob: Blob,
  filename: string,
  onProgress?: (ratio: number) => void,
  signal?: AbortSignal,
): Promise<Meeting> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append("file", blob, filename); // field name must be exactly "file"

    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_BASE}/api/mn/meetings/${meetingId}/audio`);
    xhr.setRequestHeader("Authorization", `Bearer ${getAccessToken()}`);
    // No Content-Type: the browser adds the multipart boundary itself.

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(e.loaded / e.total);
    };
    xhr.onload = () => {
      let body: unknown = null;
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        /* leave null */
      }
      if (xhr.status >= 200 && xhr.status < 300) return resolve(body as Meeting);
      reject(new ApiError(xhr.status, body));
    };
    xhr.onerror = () =>
      reject(new UploadError("network", "Network error while uploading to the server."));
    xhr.onabort = () => reject(new UploadError("network", "Upload cancelled."));
    signal?.addEventListener("abort", () => xhr.abort(), { once: true });

    xhr.send(form);
  });
}

/* ------------------------------------------------------------ the flow --- */

export interface UploadOptions {
  onProgress?: (p: UploadProgress) => void;
  signal?: AbortSignal;
  /** Force the multipart path, after an explicit "upload via the server". */
  forceApiPath?: boolean;
  /**
   * Reports what the server decided to store, before the bytes are sent.
   * When the server later says it cannot read the object, this is the evidence
   * that separates a bad recording from a server that mis-stored a good one.
   */
  onPresigned?: (presign: PresignResponse, blob: Blob) => void;
}

/**
 * Upload one recording and leave the meeting in status "uploaded".
 * The presign is requested immediately before the PUT, because it expires in
 * 15 minutes and a link fetched at page load will be dead by the time it is used.
 */
export async function uploadAudio(
  meetingId: UUID,
  blob: Blob,
  filename: string,
  { onProgress, signal, forceApiPath, onPresigned }: UploadOptions = {},
): Promise<Meeting> {
  if (blob.size > MAX_UPLOAD_BYTES) {
    throw new UploadError("api", "Audio exceeds the 500 MB limit.");
  }

  const viaApi = () => {
    onProgress?.({ phase: "uploading", ratio: 0, direct: false });
    return postMultipart(
      meetingId,
      blob,
      filename,
      (ratio) => onProgress?.({ phase: "uploading", ratio, direct: false }),
      signal,
    );
  };

  if (forceApiPath) return viaApi();

  // 1 — presign
  onProgress?.({ phase: "presigning", ratio: 0, direct: true });
  let presign: PresignResponse;
  try {
    presign = await apiFetch<PresignResponse>(
      `/meetings/${meetingId}/audio/presign`,
      {
        method: "POST",
        body: {
          filename,
          content_type: blob.type ? baseMimeType(blob.type) : undefined,
        },
      },
    );
  } catch (err) {
    // Object storage is off server-side: multipart is the documented fallback.
    if (err instanceof ApiError && err.status === 501) return viaApi();
    throw err;
  }

  onPresigned?.(presign, blob);

  // 2 — bytes straight to Cloudflare
  onProgress?.({ phase: "uploading", ratio: 0, direct: true });
  await putToR2(presign.upload_url, blob, {
    contentType: presign.content_type,
    onProgress: (ratio) => onProgress?.({ phase: "uploading", ratio, direct: true }),
    signal,
  });

  // 3 — confirm, so the server can HEAD the object, validate it and ingest it
  onProgress?.({ phase: "confirming", ratio: 1, direct: true });
  return apiFetch<Meeting>(`/meetings/${meetingId}/audio/complete`, {
    method: "POST",
    body: { key: presign.key },
  });
}
