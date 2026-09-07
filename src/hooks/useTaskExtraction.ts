import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { liveApi } from "@/api/live";
import type { ExtractedTask, OutputLanguage, UUID } from "@/api/types";
import { qk } from "./queries";

/**
 * Turns the running transcript into tasks.
 *
 * The rule that matters: send only what has been said since the last call. The
 * extractor has no memory between calls, so re-sending the whole transcript
 * re-finds every task already on the board, duplicating it and getting slower
 * and more expensive each time.
 *
 * Latency tracks the number of tasks returned, not the length of the text, and
 * there is a floor of roughly six seconds on any call — so this runs on a long
 * timer or an explicit press, never on transcript updates.
 */

/** Long enough that a call is worth making, short enough to feel live. */
export const AUTO_EXTRACT_MS = 4 * 60_000;

export function useTaskExtraction(meetingId: UUID | undefined) {
  const qc = useQueryClient();
  const [tasks, setTasks] = React.useState<ExtractedTask[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [lastRunAt, setLastRunAt] = React.useState<number | null>(null);

  /** How much of the transcript has already been sent for extraction. */
  const extractedUpto = React.useRef(0);
  const inFlight = React.useRef(false);

  const reset = React.useCallback(() => {
    extractedUpto.current = 0;
    setTasks([]);
    setError(null);
    setLastRunAt(null);
  }, []);

  const run = React.useCallback(
    async (
      transcript: string,
      opts: { final?: boolean; outputLanguage?: OutputLanguage | null } = {},
    ): Promise<number> => {
      if (!meetingId || inFlight.current) return 0;

      // The closing sweep re-reads everything so the meeting ends with one
      // clean, de-duplicated set; incremental runs only take the new tail.
      const payload = opts.final
        ? transcript.trim()
        : transcript.slice(extractedUpto.current).trim();
      if (!payload) return 0;

      inFlight.current = true;
      setBusy(true);
      setError(null);
      try {
        const result = await liveApi.extract(meetingId, {
          transcript: payload,
          replace_existing: Boolean(opts.final),
          output_language: opts.outputLanguage ?? null,
        });

        extractedUpto.current = transcript.length;
        setLastRunAt(Date.now());
        // A final sweep returns the authoritative set; incremental runs append.
        setTasks((prev) => (opts.final ? result.tasks : [...prev, ...result.tasks]));

        void qc.invalidateQueries({ queryKey: ["tasks"] });
        void qc.invalidateQueries({ queryKey: qk.meeting(meetingId) });
        return result.count;
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Could not extract tasks.",
        );
        return 0;
      } finally {
        inFlight.current = false;
        setBusy(false);
      }
    },
    [meetingId, qc],
  );

  return {
    tasks,
    busy,
    error,
    lastRunAt,
    /** Characters of transcript not yet sent — drives the "N new" affordance. */
    pendingChars: (transcript: string) =>
      Math.max(0, transcript.length - extractedUpto.current),
    run,
    reset,
    clearError: () => setError(null),
  };
}
