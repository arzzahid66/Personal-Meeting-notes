import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { meetingsApi } from "@/api/meetings";
import type { MeetingProgress, MeetingStatusValue, UUID } from "@/api/types";
import { isActiveStatus } from "@/lib/meeting";
import { qk } from "./queries";

const POLL_MS = 3000;

/**
 * Polls GET /meetings/{id}/status every 3s while a job is running, and stops on
 * transcribed / completed / failed.
 *
 * React Query pauses `refetchInterval` while the tab is hidden and refetches
 * immediately on refocus, which is exactly the behaviour the guide asks for —
 * no manual visibilitychange wiring needed.
 */
export function useMeetingStatus(
  meetingId: UUID | undefined,
  currentStatus: MeetingStatusValue | undefined,
) {
  const qc = useQueryClient();
  const previous = React.useRef<MeetingStatusValue | undefined>(undefined);

  const query = useQuery<MeetingProgress>({
    queryKey: qk.meetingStatus(meetingId ?? ""),
    queryFn: () => meetingsApi.status(meetingId as UUID),
    // Keep polling while the meeting itself is mid-pipeline, even before the
    // first status response has landed.
    enabled: Boolean(meetingId) && isActiveStatus(currentStatus),
    refetchInterval: (q) =>
      isActiveStatus(q.state.data?.status) ? POLL_MS : false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    gcTime: 0,
  });

  // When a job finishes, the meeting detail (transcript, notes, tasks) is stale.
  const status = query.data?.status;
  React.useEffect(() => {
    if (!meetingId || !status) return;
    const was = previous.current;
    previous.current = status;
    if (was && was !== status && !isActiveStatus(status)) {
      void qc.invalidateQueries({ queryKey: qk.meeting(meetingId) });
      void qc.invalidateQueries({ queryKey: ["meetings"] });
      void qc.invalidateQueries({ queryKey: ["tasks"] });
    }
  }, [meetingId, status, qc]);

  return query;
}
