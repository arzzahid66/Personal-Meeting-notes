import { Loader2 } from "lucide-react";
import type { MeetingStatusValue } from "@/api/types";
import { MEETING_STAGES, isActiveStatus, statusTone } from "@/lib/meeting";
import { Badge } from "./ui/badge";

export function StatusChip({
  status,
  stage,
  className,
}: {
  status: MeetingStatusValue;
  /** The server's own stage label, preferred over the local table when present. */
  stage?: string | null;
  className?: string;
}) {
  const meta = MEETING_STAGES[status];
  return (
    <Badge variant={statusTone(status)} className={className}>
      {isActiveStatus(status) ? <Loader2 className="animate-spin" /> : null}
      {stage ? capitalise(stage) : meta.label}
    </Badge>
  );
}

function capitalise(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
