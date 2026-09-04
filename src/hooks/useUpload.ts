import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@/api/client";
import { uploadAudio, UploadError, type UploadProgress } from "@/api/upload";
import type { Meeting, UUID } from "@/api/types";
import { qk } from "./queries";

export interface UploadState {
  busy: boolean;
  progress: UploadProgress | null;
  error: string | null;
  /** Set when the browser blocked the PUT: the bucket CORS policy needs fixing. */
  corsBlocked: boolean;
}

const initial: UploadState = {
  busy: false,
  progress: null,
  error: null,
  corsBlocked: false,
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
      try {
        const meeting = await uploadAudio(meetingId, blob, filename, {
          signal: abort.current.signal,
          forceApiPath: opts.forceApiPath,
          onProgress: (progress) =>
            setState((s) => ({ ...s, progress })),
        });
        void qc.invalidateQueries({ queryKey: qk.meeting(meetingId) });
        void qc.invalidateQueries({ queryKey: ["meetings"] });
        setState({ ...initial });
        return meeting;
      } catch (err) {
        const corsBlocked = err instanceof UploadError && err.kind === "cors";
        setState({
          busy: false,
          progress: null,
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
