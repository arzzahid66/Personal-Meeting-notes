import * as React from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  CheckSquare,
  FileText,
  Mic,
  NotebookPen,
  Pencil,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { meetingsApi } from "@/api/meetings";
import { ACCEPTED_EXTENSIONS, isAcceptedFilename } from "@/api/upload";
import type { MeetingDetail, OutputLanguage } from "@/api/types";
import {
  qk,
  useDeleteMeeting,
  useMeeting,
  useProject,
  useUpdateMeeting,
} from "@/hooks/queries";
import { useMeetingStatus } from "@/hooks/useMeetingStatus";
import { progressLabel, useUpload } from "@/hooks/useUpload";
import { PageHeader } from "@/components/AppShell";
import { PipelinePanel } from "@/components/PipelinePanel";
import { StatusChip } from "@/components/StatusChip";
import { TaskCard } from "@/components/TaskCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, Skeleton } from "@/components/ui/card";
import {
  ConfirmDialog,
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/input";
import { SimpleSelect } from "@/components/ui/select";
import {
  EmptyState,
  ErrorNotice,
  Progress,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/misc";
import { formatBytes, formatDate, formatDuration } from "@/lib/utils";

export default function MeetingDetailScreen() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const meetingQuery = useMeeting(id);
  const meeting = meetingQuery.data;

  // Keep the detail view live while a job runs, without a second poller.
  useMeetingStatus(id, meeting?.status);

  const project = useProject(meeting?.project_id);
  const removeMeeting = useDeleteMeeting();
  const [confirmDelete, setConfirmDelete] = React.useState(false);

  if (meetingQuery.isPending) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (meetingQuery.isError || !meeting) {
    return (
      <>
        <PageHeader title="Meeting" back={<BackLink />} />
        <ErrorNotice
          message={(meetingQuery.error as Error)?.message ?? "Meeting not found."}
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={meeting.title}
        back={<BackLink />}
        description={
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <StatusChip status={meeting.status} />
            <span>{formatDate(meeting.meeting_date)}</span>
            {project.data ? (
              <>
                <span aria-hidden>·</span>
                <Link
                  to={`/projects/${project.data.id}`}
                  className="text-primary hover:underline"
                  dir="auto"
                >
                  {project.data.name}
                </Link>
              </>
            ) : null}
            {meeting.duration_seconds ? (
              <>
                <span aria-hidden>·</span>
                <span>{formatDuration(meeting.duration_seconds)}</span>
              </>
            ) : null}
          </div>
        }
        action={
          <MeetingMenu
            meeting={meeting}
            onDelete={() => setConfirmDelete(true)}
          />
        }
      />

      <div className="space-y-4">
        <PipelinePanel meeting={meeting} />

        {meeting.status === "draft" ? <AudioSourcePanel meeting={meeting} /> : null}

        {meeting.manual_notes ? (
          <Card>
            <CardContent className="space-y-1 pt-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Context given to the model
              </p>
              <p className="whitespace-pre-wrap text-sm" dir="auto">
                {meeting.manual_notes}
              </p>
            </CardContent>
          </Card>
        ) : null}

        <Tabs defaultValue="tasks">
          <TabsList className="w-full">
            <TabsTrigger value="tasks" className="flex-1">
              <CheckSquare className="size-4" />
              Tasks
              {meeting.tasks.length > 0 ? ` (${meeting.tasks.length})` : ""}
            </TabsTrigger>
            <TabsTrigger value="notes" className="flex-1">
              <NotebookPen className="size-4" />
              Notes
              {meeting.notes.length > 0 ? ` (${meeting.notes.length})` : ""}
            </TabsTrigger>
            <TabsTrigger value="transcript" className="flex-1">
              <FileText className="size-4" />
              Transcript
            </TabsTrigger>
          </TabsList>

          <TabsContent value="tasks">
            {meeting.tasks.length === 0 ? (
              <EmptyState
                icon={CheckSquare}
                title="No tasks yet"
                description={
                  meeting.transcript
                    ? "Tasks appear once you generate them from the transcript."
                    : "Transcribe the meeting, then generate to extract tasks."
                }
              />
            ) : (
              <ul className="space-y-2">
                {meeting.tasks.map((task) => (
                  <li key={task.id}>
                    <TaskCard task={task} />
                  </li>
                ))}
              </ul>
            )}
          </TabsContent>

          <TabsContent value="notes">
            {meeting.notes.length === 0 ? (
              <EmptyState
                icon={NotebookPen}
                title="No notes yet"
                description="Generate to produce a summary, key points and decisions."
              />
            ) : (
              <div className="space-y-3">
                {meeting.notes.map((note) => (
                  <Card key={note.id}>
                    <CardContent className="space-y-4 pt-4">
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span className="font-medium uppercase tracking-wide">
                          {note.output_language === "ur" ? "اردو" : "English"}
                        </span>
                        <span>
                          {note.llm_provider}
                          {note.model ? ` · ${note.model}` : ""}
                        </span>
                      </div>

                      {note.summary ? (
                        <p className="whitespace-pre-wrap text-sm" dir="auto">
                          {note.summary}
                        </p>
                      ) : null}

                      <NoteList title="Key points" items={note.key_points} />
                      <NoteList title="Decisions" items={note.decisions} />
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="transcript">
            {meeting.transcript ? (
              <Card>
                <CardContent className="space-y-3 pt-4">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span>{meeting.transcript.provider}</span>
                    {meeting.transcript.word_count ? (
                      <span>{meeting.transcript.word_count} words</span>
                    ) : null}
                    {meeting.transcript.chunk_count ? (
                      <span>{meeting.transcript.chunk_count} chunks</span>
                    ) : null}
                    {meeting.transcript.language ? (
                      <span>{meeting.transcript.language}</span>
                    ) : null}
                  </div>
                  <p
                    className="whitespace-pre-wrap text-sm leading-relaxed"
                    dir="auto"
                  >
                    {meeting.transcript.text}
                  </p>
                </CardContent>
              </Card>
            ) : (
              <EmptyState
                icon={FileText}
                title="No transcript yet"
                description="Upload audio and transcribe it, or paste a transcript you already have."
                action={<PasteTranscriptDialog meetingId={meeting.id} />}
              />
            )}
          </TabsContent>
        </Tabs>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete this meeting?"
        description="The transcript, notes, tasks and any stored audio are deleted permanently."
        confirmLabel="Delete"
        destructive
        loading={removeMeeting.isPending}
        onConfirm={() =>
          removeMeeting.mutate(meeting.id, {
            onSuccess: () => navigate("/meetings", { replace: true }),
            onError: (err) => toast.error(err.message),
          })
        }
      />
    </>
  );
}

function BackLink() {
  return (
    <Button asChild variant="ghost" size="sm" className="-ml-2">
      <Link to="/meetings">
        <ArrowLeft className="size-4" />
        Meetings
      </Link>
    </Button>
  );
}

function NoteList({ title, items }: { title: string; items: string[] | null }) {
  if (!items || items.length === 0) return null;
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
      <ul className="space-y-1.5">
        {items.map((item, i) => (
          <li key={i} className="flex gap-2 text-sm">
            <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary/60" />
            <span dir="auto">{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* --------------------------------------------------------- add audio --- */

function AudioSourcePanel({ meeting }: { meeting: MeetingDetail }) {
  const upload = useUpload();
  const fileInput = React.useRef<HTMLInputElement>(null);
  const [fileError, setFileError] = React.useState<string | null>(null);
  const [file, setFile] = React.useState<File | null>(null);

  async function onUpload(forceApiPath = false) {
    if (!file) return;
    const result = await upload.run(meeting.id, file, file.name, { forceApiPath });
    if (result) {
      setFile(null);
      toast.success("Audio uploaded.");
    }
  }

  return (
    <Card>
      <CardContent className="space-y-3 pt-5">
        <p className="text-sm font-medium">Add audio</p>

        {fileError ? <ErrorNotice message={fileError} /> : null}
        {upload.error ? (
          <ErrorNotice
            title={upload.corsBlocked ? "Blocked before it left the browser" : undefined}
            message={upload.error}
            action={
              upload.corsBlocked ? (
                <Button size="sm" variant="outline" onClick={() => onUpload(true)}>
                  Upload through the server instead
                </Button>
              ) : undefined
            }
          />
        ) : null}

        {upload.busy ? (
          <div className="space-y-2">
            <Progress
              value={(upload.progress?.ratio ?? 0) * 100}
              indeterminate={upload.progress?.phase !== "uploading"}
            />
            <p className="text-sm text-muted-foreground">
              {progressLabel(upload.progress)}
            </p>
          </div>
        ) : file ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground" dir="auto">
              {file.name} · {formatBytes(file.size)}
            </p>
            <div className="flex gap-2">
              <Button className="flex-1" onClick={() => onUpload()}>
                <Upload className="size-4" />
                Upload
              </Button>
              <Button variant="outline" onClick={() => setFile(null)}>
                Choose another
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button asChild className="flex-1">
              <Link to={`/record?meeting=${meeting.id}`}>
                <Mic className="size-4" />
                Record now
              </Link>
            </Button>
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => fileInput.current?.click()}
            >
              <Upload className="size-4" />
              Choose a file
            </Button>
            <PasteTranscriptDialog meetingId={meeting.id} />
          </div>
        )}

        <input
          ref={fileInput}
          type="file"
          accept="audio/*,video/mp4"
          className="hidden"
          onChange={(e) => {
            const picked = e.target.files?.[0];
            e.target.value = "";
            if (!picked) return;
            if (!isAcceptedFilename(picked.name)) {
              setFileError(
                `That file type is not accepted. Allowed: ${ACCEPTED_EXTENSIONS.join(" ")}`,
              );
              return;
            }
            setFileError(null);
            setFile(picked);
          }}
        />
      </CardContent>
    </Card>
  );
}

/* -------------------------------------------------- paste a transcript --- */

function PasteTranscriptDialog({ meetingId }: { meetingId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const [text, setText] = React.useState("");
  const [language, setLanguage] = React.useState("en");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await meetingsApi.putTranscript(meetingId, text, language);
      await qc.invalidateQueries({ queryKey: qk.meeting(meetingId) });
      void qc.invalidateQueries({ queryKey: ["meetings"] });
      setOpen(false);
      setText("");
      toast.success("Transcript saved. Generate to extract tasks.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the transcript.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="flex-1">
          <FileText className="size-4" />
          Paste a transcript
        </Button>
      </DialogTrigger>
      <DialogContent
        title="Paste a transcript"
        description="For meetings typed up or transcribed elsewhere. This skips audio entirely and replaces any existing transcript."
      >
        <div className="space-y-3">
          {error ? <ErrorNotice message={error} /> : null}
          <Field label="Transcript" htmlFor="transcript-text">
            <Textarea
              id="transcript-text"
              className="min-h-48"
              maxLength={500_000}
              value={text}
              onChange={(e) => setText(e.target.value)}
              dir="auto"
            />
          </Field>
          <Field label="Language" htmlFor="transcript-language">
            <SimpleSelect
              id="transcript-language"
              value={language}
              onChange={setLanguage}
              options={[
                { value: "en", label: "English" },
                { value: "ur", label: "اردو — Urdu" },
                { value: "mixed", label: "Mixed" },
              ]}
            />
          </Field>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button loading={busy} disabled={!text.trim()} onClick={submit}>
            Save transcript
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------ edit --- */

function MeetingMenu({
  meeting,
  onDelete,
}: {
  meeting: MeetingDetail;
  onDelete: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [title, setTitle] = React.useState(meeting.title);
  const [date, setDate] = React.useState(meeting.meeting_date);
  const [notes, setNotes] = React.useState(meeting.manual_notes ?? "");
  const [language, setLanguage] = React.useState<OutputLanguage | "">(
    meeting.output_language ?? "",
  );
  const update = useUpdateMeeting(meeting.id);

  return (
    <div className="flex items-center gap-1">
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Edit meeting">
            <Pencil />
          </Button>
        </DialogTrigger>
        <DialogContent title="Edit meeting">
          <div className="space-y-3">
            <Field label="Title" htmlFor="edit-title">
              <Input
                id="edit-title"
                value={title}
                maxLength={300}
                onChange={(e) => setTitle(e.target.value)}
                dir="auto"
              />
            </Field>
            <Field label="Date" htmlFor="edit-date">
              <Input
                id="edit-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </Field>
            <Field
              label="Context for the model"
              htmlFor="edit-notes"
              hint="Sent alongside the transcript when you generate."
            >
              <Textarea
                id="edit-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                dir="auto"
              />
            </Field>
            <Field label="Output language" htmlFor="edit-language">
              <SimpleSelect
                id="edit-language"
                value={language}
                onChange={(value) => setLanguage(value as OutputLanguage | "")}
                options={[
                  { value: "", label: "Project default" },
                  { value: "en", label: "English" },
                  { value: "ur", label: "اردو — Urdu" },
                ]}
              />
            </Field>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button
              loading={update.isPending}
              onClick={() =>
                update.mutate(
                  {
                    title: title.trim(),
                    meeting_date: date,
                    manual_notes: notes.trim() || null,
                    output_language: language || null,
                  },
                  {
                    onSuccess: () => setOpen(false),
                    onError: (err) => toast.error(err.message),
                  },
                )
              }
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Button
        variant="ghost"
        size="icon"
        aria-label="Delete meeting"
        onClick={onDelete}
      >
        <Trash2 />
      </Button>
    </div>
  );
}
