import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@/api/client";
import { uploadAudio, UploadError, type UploadProgress } from "@/api/upload";
import type { Meeting, UUID } from "@/api/types";
import { qk } from "./queries";

/** What the server decided to store, captured so a failure can be explained. */
export interface UploadDiagnostics {
  key: string;
  contentType: string;
  sentMimeType: string;
  bytes: number;
  filename: string;
}

export interface UploadState {
  busy: boolean;
  progress: UploadProgress | null;
  error: string | null;
  /** Set when the browser blocked the PUT: the bucket CORS policy needs fixing. */
  corsBlocked: boolean;
  /** Present once a presign has come back, on success or failure. */
  diagnostics: UploadDiagnostics | null;
  /**
   * The server's own `diagnostic` object from a 415 — what ffprobe saw. This is
   * the authoritative account of why an upload was refused, so it is shown
   * verbatim rather than summarised.
   */
  serverDiagnostic: Record<string, unknown> | null;
}

const initial: UploadState = {
  busy: false,
  progress: null,
  error: null,
  corsBlocked: false,
  diagnostics: null,
  serverDiagnostic: null,
};

export function useUpload() {
  const qc = useQueryClient();
  const [state, setState] = React.useState<UploadState>(initial);
  const abort = React.useRef<AbortController | null>(null);

  const run = React.useCallback(
    async (
      meetingId: UUID,
      blob: Blob,
      filename: string,
      opts: { forceApiPath?: boolean } = {},
    ): Promise<Meeting | null> => {
      abort.current = new AbortController();
      setState({ ...initial, busy: true });
      let diagnostics: UploadDiagnostics | null = null;
      try {
        const meeting = await uploadAudio(meetingId, blob, filename, {
          signal: abort.current.signal,
          forceApiPath: opts.forceApiPath,
          onProgress: (progress) => setState((s) => ({ ...s, progress })),
          onPresigned: (presign, sent) => {
            diagnostics = {
              key: presign.key,
              contentType: presign.content_type,
              sentMimeType: sent.type || "(none)",
              bytes: sent.size,
              filename,
            };
            setState((s) => ({ ...s, diagnostics }));
          },
        });
        void qc.invalidateQueries({ queryKey: qk.meeting(meetingId) });
        void qc.invalidateQueries({ queryKey: ["meetings"] });
        setState({ ...initial });
        return meeting;
      } catch (err) {
        const corsBlocked = err instanceof UploadError && err.kind === "cors";
        const body = err instanceof ApiError ? (err.body as { diagnostic?: unknown }) : null;
        const serverDiagnostic =
          body?.diagnostic && typeof body.diagnostic === "object"
            ? (body.diagnostic as Record<string, unknown>)
            : null;
        setState({
          busy: false,
          progress: null,
          diagnostics,
          serverDiagnostic,
          corsBlocked,
          error:
            err instanceof UploadError || err instanceof ApiError
              ? err.message
              : "The upload failed. Please try again.",
        });
        return null;
      }
    },
    [qc],
  );

  const cancel = React.useCallback(() => {
    abort.current?.abort();
    setState(initial);
  }, []);

  const reset = React.useCallback(() => setState(initial), []);

  return { ...state, run, cancel, reset };
}

export function progressLabel(progress: UploadProgress | null): string {
  if (!progress) return "Preparing…";
  switch (progress.phase) {
    case "presigning":
      return "Requesting an upload link…";
    case "uploading":
      return progress.direct
        ? `Uploading to Cloudflare — ${Math.round(progress.ratio * 100)}%`
        : `Uploading to the server — ${Math.round(progress.ratio * 100)}%`;
    case "confirming":
      return "Confirming the upload…";
  }
}
