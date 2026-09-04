import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, RotateCcw, Sparkles, Waves } from "lucide-react";
import { toast } from "sonner";
import { meetingsApi } from "@/api/meetings";
import type { MeetingDetail, OutputLanguage } from "@/api/types";
import { qk } from "@/hooks/queries";
import { useMeetingStatus } from "@/hooks/useMeetingStatus";
import { MEETING_STAGES, canGenerate, canTranscribe, isActiveStatus } from "@/lib/meeting";
import { Button } from "./ui/button";
import { Card, CardContent } from "./ui/card";
import { ErrorNotice, Progress } from "./ui/misc";
import { SimpleSelect } from "./ui/select";

export function PipelinePanel({ meeting }: { meeting: MeetingDetail }) {
  const qc = useQueryClient();
  const progress = useMeetingStatus(meeting.id, meeting.status);
  const [language, setLanguage] = React.useState<OutputLanguage | "">(
    meeting.output_language ?? "",
  );

  // The polled status is fresher than the meeting record it was rendered from.
  const status = progress.data?.status ?? meeting.status;
  const stage = progress.data?.stage;
  const errorMessage = progress.data?.error_message ?? meeting.error_message;
  const percent = progress.data?.percent ?? MEETING_STAGES[status].percent;
  const active = isActiveStatus(status);

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: qk.meeting(meeting.id) });
    void qc.invalidateQueries({ queryKey: qk.meetingStatus(meeting.id) });
    void qc.invalidateQueries({ queryKey: ["meetings"] });
  };

  const transcribe = useMutation({
    mutationFn: () => meetingsApi.transcribe(meeting.id),
    onSuccess: () => {
      toast.success("Transcription started.");
      invalidate();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const generate = useMutation({
    mutationFn: () => meetingsApi.generate(meeting.id, language || undefined),
    onSuccess: () => {
      toast.success("Generating notes and tasks…");
      invalidate();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const hasTranscript = Boolean(meeting.transcript);
  const busy = transcribe.isPending || generate.isPending;

  return (
    <Card className="border-primary/25">
      <CardContent className="space-y-4 pt-5">
        {active ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2 font-medium">
                <Loader2 className="size-4 animate-spin text-primary" />
                {stage ? capitalise(stage) : MEETING_STAGES[status].label}
              </span>
              <span className="tabular-nums text-muted-foreground">{percent}%</span>
            </div>
            <Progress value={percent} />
            <p className="text-xs text-muted-foreground">
              {progress.data?.chunks_total
                ? `${progress.data.chunks_done} of ${progress.data.chunks_total} chunks`
                : MEETING_STAGES[status].hint}
              {/* eta_text is already humanised by the server — render it as-is. */}
              {progress.data?.eta_text ? ` · ${progress.data.eta_text} left` : ""}
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            {MEETING_STAGES[status].hint}
          </p>
        )}

        {status === "failed" && errorMessage ? (
          <ErrorNotice
            title="This step failed"
            message={errorMessage}
            action={
              <Button
                size="sm"
                variant="outline"
                loading={busy}
                onClick={() =>
                  hasTranscript ? generate.mutate() : transcribe.mutate()
                }
              >
                <RotateCcw className="size-4" />
                {hasTranscript ? "Retry generation" : "Retry transcription"}
              </Button>
            }
          />
        ) : null}

        {/* Transcription is only offered once audio exists. */}
        {canTranscribe(status) && !hasTranscript && status !== "failed" ? (
          <Button
            size="lg"
            className="w-full"
            loading={transcribe.isPending}
            disabled={active}
            onClick={() => transcribe.mutate()}
          >
            <Waves className="size-5" />
            Transcribe
          </Button>
        ) : null}

        {/* Generation is a separate step, and the single thing users miss:
            a transcribed meeting has no tasks at all until this runs. */}
        {canGenerate(status) && hasTranscript ? (
          <div className="space-y-3">
            {status === "transcribed" ? (
              <div className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
                <p className="font-medium text-warning">Not finished yet</p>
                <p className="mt-0.5 text-foreground/85">
                  The transcript is ready but no notes or tasks exist. Generate
                  to extract them.
                </p>
              </div>
            ) : null}

            {/* Stacked on phones: "Generate notes & tasks" cannot shrink (it is
                nowrap), so side by side with the language select it pushed the
                whole page into horizontal scroll at 414px. */}
            <div className="flex flex-col gap-2 sm:flex-row">
              <SimpleSelect
                className="w-full sm:w-40 sm:shrink-0"
                value={language}
                onChange={(value) => setLanguage(value as OutputLanguage | "")}
                options={[
                  { value: "", label: "Default language" },
                  { value: "en", label: "English" },
                  { value: "ur", label: "اردو — Urdu" },
                ]}
              />
              <Button
                size="lg"
                // Not flex-1: in the stacked (column) layout that resolves to
                // flex-basis 0 on the height and collapses the button.
                className="w-full sm:flex-1"
                loading={generate.isPending}
                disabled={active}
                onClick={() => generate.mutate()}
              >
                <Sparkles className="size-5" />
                {meeting.notes.length > 0 ? "Re-generate" : "Generate notes & tasks"}
              </Button>
            </div>

            {meeting.notes.length > 0 ? (
              <p className="text-xs text-muted-foreground">
                Re-generating replaces the tasks. Notes in a different language
                are added alongside the existing ones.
              </p>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function capitalise(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
