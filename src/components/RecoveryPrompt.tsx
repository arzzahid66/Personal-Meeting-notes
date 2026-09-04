import * as React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { AlertTriangle, X } from "lucide-react";
import { deleteSession, listUnfinishedSessions, type RecordingSession } from "@/db/idb";
import { formatBytes, formatDuration } from "@/lib/utils";
import { Button } from "./ui/button";
import { ConfirmDialog } from "./ui/dialog";

/**
 * Audio that was recorded but never accepted by the server is still sitting in
 * IndexedDB. Offer it back on launch rather than letting it rot silently —
 * on iOS a suspended tab is the normal way a long recording ends.
 */
export function RecoveryPrompt() {
  const [session, setSession] = React.useState<RecordingSession | null>(null);
  const [confirmDiscard, setConfirmDiscard] = React.useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  React.useEffect(() => {
    let cancelled = false;
    void listUnfinishedSessions().then((sessions) => {
      if (!cancelled) setSession(sessions[0] ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // The Record screen owns the resume flow; do not shout over it.
  if (!session || location.pathname === "/record") return null;

  return (
    <>
      <div className="fixed inset-x-0 bottom-20 z-40 mx-auto max-w-3xl px-4">
        <div className="flex items-center gap-3 rounded-xl border border-warning/40 bg-card p-3 shadow-lg">
          <AlertTriangle className="size-5 shrink-0 text-warning" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium" dir="auto">
              Unsent recording: {session.meetingTitle}
            </p>
            <p className="text-xs text-muted-foreground">
              {formatDuration(session.durationMs / 1000)} ·{" "}
              {formatBytes(session.bytes)}
            </p>
          </div>
          <Button
            size="sm"
            onClick={() => navigate(`/record?resume=${session.id}`)}
          >
            Upload
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Discard recording"
            onClick={() => setConfirmDiscard(true)}
          >
            <X />
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={confirmDiscard}
        onOpenChange={setConfirmDiscard}
        title="Discard this recording?"
        description="The audio is only on this device. Discarding deletes it permanently."
        confirmLabel="Discard"
        destructive
        onConfirm={async () => {
          await deleteSession(session.id);
          setSession(null);
          setConfirmDiscard(false);
        }}
      />
    </>
  );
}
