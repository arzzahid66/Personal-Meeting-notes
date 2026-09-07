import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { liveApi } from "@/api/live";
import type { ExtractedTask, OutputLanguage, UUID } from "@/api/types";
import { qk } from "./queries";

/**
 * Turns a finished transcript into tasks.
 *
 * Extraction happens once, when the meeting ends, over the whole transcript —
 * not in slices while it runs. Every call costs at least six seconds and the
 * extractor has no memory between calls, so running it mid-meeting both
 * interrupts the flow and risks the same task being found twice. One pass at
 * the end, with replace_existing, leaves exactly one clean set.
 */
export function useTaskExtraction(meetingId: UUID | undefined) {
  const qc = useQueryClient();
  const [tasks, setTasks] = React.useState<ExtractedTask[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [hasRun, setHasRun] = React.useState(false);

  const inFlight = React.useRef(false);

  const reset = React.useCallback(() => {
    setTasks([]);
    setError(null);
    setHasRun(false);
  }, []);

  const run = React.useCallback(
    async (
      transcript: string,
      opts: { outputLanguage?: OutputLanguage | null } = {},
    ): Promise<number> => {
      const text = transcript.trim();
      if (!meetingId || inFlight.current || !text) return 0;

      inFlight.current = true;
      setBusy(true);
      setError(null);
      try {
        const result = await liveApi.extract(meetingId, {
          transcript: text,
          // Always the authoritative sweep: re-running after an edit should
          // correct the board, not stack a second copy onto it.
          replace_existing: true,
          output_language: opts.outputLanguage ?? null,
        });

        setTasks(result.tasks);
        setHasRun(true);
        void qc.invalidateQueries({ queryKey: ["tasks"] });
        void qc.invalidateQueries({ queryKey: qk.meeting(meetingId) });
        return result.count;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not extract tasks.");
        return 0;
      } finally {
        inFlight.current = false;
        setBusy(false);
      }
    },
    [meetingId, qc],
  );

  return { tasks, busy, error, hasRun, run, reset, clearError: () => setError(null) };
}
