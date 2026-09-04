import * as React from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  CircleStop,
  KeyRound,
  Mic,
  Pause,
  Play,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import type { UUID } from "@/api/types";
import {
  extensionFor,
  isAcceptedFilename,
  ACCEPTED_EXTENSIONS,
  MAX_DURATION_MIN,
} from "@/api/upload";
import {
  assembleSessionChecked,
  deleteSession,
  getSession,
  listUnfinishedSessions,
  patchSession,
  type RecordingSession,
} from "@/db/idb";
import { useAuth } from "@/hooks/auth";
import { useCreateMeeting, useProjects } from "@/hooks/queries";
import { useRecorder } from "@/hooks/useRecorder";
import { progressLabel, useUpload } from "@/hooks/useUpload";
import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { SimpleSelect } from "@/components/ui/select";
import { ErrorNotice, Progress } from "@/components/ui/misc";
import { verifyAudioBlob } from "@/lib/audio";
import { cn, formatBytes, formatDate, formatDuration, todayIso } from "@/lib/utils";

type Pending = { session: RecordingSession; blob: Blob };

export default function RecordScreen() {
  const { keysReady } = useAuth();
  const navigate = useNavigate();
  const [search, setSearch] = useSearchParams();
  const projects = useProjects();
  const createMeeting = useCreateMeeting();
  const recorder = useRecorder();
  const upload = useUpload();

  const [projectId, setProjectId] = React.useState("");
  const [title, setTitle] = React.useState(defaultTitle);
  const [date, setDate] = React.useState(todayIso());
  const [pending, setPending] = React.useState<Pending | null>(null);
  const [loadingPending, setLoadingPending] = React.useState(false);
  const [confirmDiscard, setConfirmDiscard] = React.useState(false);
  const [fileError, setFileError] = React.useState<string | null>(null);
  const [badTake, setBadTake] = React.useState<
    { session: RecordingSession; reason: string } | null
  >(null);
  const fileInput = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (!projectId && projects.data && projects.data.length > 0) {
      setProjectId(projects.data[0].id);
    }
  }, [projects.data, projectId]);

  // Pick up a recording left behind by a previous session (?resume=<id>), or
  // any unfinished one if the screen was opened directly.
  const resumeId = search.get("resume");
  // Arriving from a meeting that has no audio yet: record straight into it.
  const meetingParam = search.get("meeting");
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      if (pending || recorder.state !== "idle") return;
      setLoadingPending(true);
      const session = resumeId
        ? await getSession(resumeId)
        : (await listUnfinishedSessions())[0];
      if (!session || cancelled) {
        setLoadingPending(false);
        return;
      }
      // Anything picked up off disk is checked before it is offered for upload.
      // A take recorded by an older build, or interrupted mid-write, is corrupt
      // and would only come back as a 415 after a full upload.
      await preparePending(session);
      if (cancelled) return;
      if (session.meetingTitle) setTitle(session.meetingTitle);
      setLoadingPending(false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resumeId]);

  if (!keysReady) {
    return (
      <>
        <PageHeader title="Record" />
        <Card>
          <CardContent className="space-y-4 pt-6 text-center">
            <KeyRound className="mx-auto size-8 text-destructive" />
            <div className="space-y-1">
              <p className="font-medium">Add a provider API key first</p>
              <p className="text-sm text-muted-foreground">
                Without a transcription and an LLM key, a recording is accepted
                and then fails at transcription — after the meeting is over.
              </p>
            </div>
            <Button asChild>
              <Link to="/settings">Open settings</Link>
            </Button>
          </CardContent>
        </Card>
      </>
    );
  }

  const busyRecording =
    recorder.state === "recording" || recorder.state === "paused";
  const progressPct =
    (recorder.elapsedMs / recorder.maxDurationMs) * 100;

  async function ensureMeeting(session: RecordingSession): Promise<UUID | null> {
    if (session.meetingId) return session.meetingId;
    if (meetingParam) {
      await patchSession(session.id, { meetingId: meetingParam });
      return meetingParam;
    }
    if (!projectId) {
      toast.error("Choose a project for this recording.");
      return null;
    }
    try {
      const meeting = await createMeeting.mutateAsync({
        project_id: projectId,
        title: title.trim() || defaultTitle(),
        meeting_date: date,
      });
      await patchSession(session.id, { meetingId: meeting.id });
      return meeting.id;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create the meeting.");
      return null;
    }
  }

  async function doUpload(forceApiPath = false) {
    if (!pending) return;
    const meetingId = await ensureMeeting(pending.session);
    if (!meetingId) return;

    await patchSession(pending.session.id, { state: "uploading" });
    const filename = `meeting${extensionFor(pending.session.mimeType)}`;
    const meeting = await upload.run(meetingId, pending.blob, filename, {
      forceApiPath,
    });

    if (meeting) {
      await deleteSession(pending.session.id);
      setPending(null);
      toast.success("Audio uploaded. Transcribe it when you are ready.");
      navigate(`/meetings/${meeting.id}`, { replace: true });
    } else {
      await patchSession(pending.session.id, {
        state: "failed",
        lastError: upload.error,
      });
    }
  }

  /**
   * Assemble a session, prove it is playable, and only then offer it for
   * upload. Every route into the upload pane goes through here.
   */
  async function preparePending(
    session: RecordingSession,
    mimeTypeOverride?: string,
  ): Promise<boolean> {
    const mimeType = mimeTypeOverride ?? session.mimeType;
    const assembled = await assembleSessionChecked(session.id, mimeType);

    if (assembled.chunkCount === 0 || assembled.hasGap) {
      setPending(null);
      setBadTake({
        session,
        reason:
          "Part of this recording is missing from this device, so it cannot be played back or transcribed.",
      });
      return false;
    }

    const check = await verifyAudioBlob(assembled.blob);
    if (!check.ok) {
      setPending(null);
      setBadTake({ session, reason: check.reason ?? "This audio cannot be read." });
      return false;
    }

    setBadTake(null);
    setPending({ session, blob: assembled.blob });
    return true;
  }

  /** Stop the take and move it into the upload pane. */
  async function finishRecording() {
    const result = await recorder.stop();
    // Fall back to whatever is on disk: the audio is written chunk by chunk, so
    // a take is never lost just because the stop handshake returned nothing.
    const sessionId = result?.sessionId ?? recorder.sessionId;
    const session =
      (sessionId ? await getSession(sessionId) : undefined) ??
      (await listUnfinishedSessions())[0];

    if (!session) {
      toast.error("The recording could not be read back from this device.");
      return;
    }

    await preparePending(session, result?.mimeType);
    setSearch({}, { replace: true });
  }

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setFileError(null);
    if (!isAcceptedFilename(file.name)) {
      setFileError(
        `That file type is not accepted. Allowed: ${ACCEPTED_EXTENSIONS.join(" ")}`,
      );
      return;
    }
    const check = await verifyAudioBlob(file);
    if (!check.ok) {
      setFileError(check.reason ?? "That file could not be read as audio.");
      return;
    }
    setPending({
      session: {
        id: `file-${crypto.randomUUID()}`,
        meetingId: null,
        meetingTitle: file.name,
        mimeType: file.type || "audio/mpeg",
        createdAt: Date.now(),
        updatedAt: Date.now(),
        durationMs: 0,
        bytes: file.size,
        chunkCount: 1,
        state: "ready",
        lastError: null,
      },
      blob: file,
    });
    if (!title.trim() || title === defaultTitle()) {
      setTitle(file.name.replace(/\.[^.]+$/, ""));
    }
  }

  return (
    <>
      <PageHeader
        title="Record"
        description={
          busyRecording
            ? "Keep this tab in the foreground."
            : `Up to ${MAX_DURATION_MIN} minutes per recording.`
        }
      />

      {recorder.error ? (
        <ErrorNotice className="mb-4" message={recorder.error} />
      ) : null}
      {fileError ? <ErrorNotice className="mb-4" message={fileError} /> : null}

      {/* A take that cannot be played back locally will only come back as a 415
          from the server, so it is stopped here with a way to clear it out. */}
      {badTake ? (
        <ErrorNotice
          className="mb-4"
          title="This recording is damaged"
          message={`${badTake.reason} Recordings made before the fix for this cannot be repaired.`}
          action={
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="destructive"
                onClick={async () => {
                  await deleteSession(badTake.session.id);
                  setBadTake(null);
                  setSearch({}, { replace: true });
                  toast.success("Damaged recording removed.");
                }}
              >
                <Trash2 className="size-4" />
                Discard it
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={async () => {
                  const assembled = await assembleSessionChecked(
                    badTake.session.id,
                    badTake.session.mimeType,
                  );
                  setPending({ session: badTake.session, blob: assembled.blob });
                  setBadTake(null);
                }}
              >
                Try uploading anyway
              </Button>
            </div>
          }
        />
      ) : null}

      {/* ---------------------------------------------------- upload pane */}
      {pending ? (
        <Card className="mb-4">
          <CardContent className="space-y-4 pt-6">
            <div className="flex items-start gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/12 text-primary">
                <Upload className="size-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-medium">Ready to upload</p>
                <p className="text-sm text-muted-foreground">
                  {pending.session.durationMs
                    ? `${formatDuration(pending.session.durationMs / 1000)} · `
                    : ""}
                  {formatBytes(pending.blob.size)}
                </p>
              </div>
            </div>

            {!pending.session.meetingId && !meetingParam ? (
              <div className="space-y-3">
                <Field label="Project" htmlFor="rec-project">
                  <SimpleSelect
                    id="rec-project"
                    value={projectId}
                    onChange={setProjectId}
                    options={(projects.data ?? []).map((p) => ({
                      value: p.id,
                      label: p.name,
                    }))}
                    placeholder="Choose a project"
                  />
                </Field>
                <Field label="Title" htmlFor="rec-title">
                  <Input
                    id="rec-title"
                    value={title}
                    maxLength={300}
                    onChange={(e) => setTitle(e.target.value)}
                    dir="auto"
                  />
                </Field>
                <Field label="Date" htmlFor="rec-date">
                  <Input
                    id="rec-date"
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                  />
                </Field>
              </div>
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
                <Button variant="outline" size="sm" onClick={upload.cancel}>
                  Cancel
                </Button>
              </div>
            ) : (
              <>
                {upload.error ? (
                  <ErrorNotice
                    title={upload.corsBlocked ? "Blocked before it left the browser" : undefined}
                    message={upload.error}
                    action={
                      <div className="space-y-2">
                        {upload.corsBlocked ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => doUpload(true)}
                          >
                            Upload through the server instead
                          </Button>
                        ) : null}
                        {/* The browser already proved this audio is playable, so
                            if the server cannot read it, what it stored is the
                            thing to look at. */}
                        {upload.diagnostics ? (
                          <details className="text-xs">
                            <summary className="cursor-pointer text-muted-foreground">
                              Upload details
                            </summary>
                            <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 font-mono">
                              <dt className="text-muted-foreground">stored as</dt>
                              <dd className="break-all">{upload.diagnostics.key}</dd>
                              <dt className="text-muted-foreground">signed type</dt>
                              <dd>{upload.diagnostics.contentType}</dd>
                              <dt className="text-muted-foreground">sent type</dt>
                              <dd>{upload.diagnostics.sentMimeType}</dd>
                              <dt className="text-muted-foreground">filename</dt>
                              <dd>{upload.diagnostics.filename}</dd>
                              <dt className="text-muted-foreground">bytes</dt>
                              <dd>{upload.diagnostics.bytes.toLocaleString()}</dd>
                            </dl>
                          </details>
                        ) : null}
                      </div>
                    }
                  />
                ) : null}
                <div className="flex gap-2">
                  <Button
                    className="flex-1"
                    onClick={() => doUpload()}
                    loading={createMeeting.isPending}
                    disabled={
                      !pending.session.meetingId && !meetingParam && !projectId
                    }
                  >
                    <Upload className="size-4" />
                    Upload
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label="Discard recording"
                    onClick={() => setConfirmDiscard(true)}
                  >
                    <Trash2 />
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      ) : null}

      {/* ------------------------------------------------------- recorder */}
      {!pending ? (
        <>
          {!busyRecording && !meetingParam ? (
            <Card className="mb-4">
              <CardContent className="space-y-3 pt-6">
                <Field label="Project" htmlFor="setup-project">
                  <SimpleSelect
                    id="setup-project"
                    value={projectId}
                    onChange={setProjectId}
                    options={(projects.data ?? []).map((p) => ({
                      value: p.id,
                      label: p.name,
                    }))}
                    placeholder={
                      projects.data?.length ? "Choose a project" : "No projects yet"
                    }
                  />
                </Field>
                <Field label="Title" htmlFor="setup-title">
                  <Input
                    id="setup-title"
                    value={title}
                    maxLength={300}
                    onChange={(e) => setTitle(e.target.value)}
                    dir="auto"
                  />
                </Field>
                {projects.data && projects.data.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    <Link to="/projects" className="text-primary hover:underline">
                      Create a project
                    </Link>{" "}
                    before recording.
                  </p>
                ) : null}
              </CardContent>
            </Card>
          ) : null}

          <div className="flex flex-col items-center gap-6 py-6">
            <div className="relative flex size-44 items-center justify-center">
              <span
                className={cn(
                  "absolute inset-0 rounded-full bg-primary/10",
                  recorder.state === "recording" && "animate-record",
                )}
                style={{
                  transform: `scale(${1 + recorder.level * 0.35})`,
                  transition: "transform 90ms linear",
                }}
                aria-hidden
              />
              <button
                type="button"
                onClick={() => {
                  if (busyRecording) {
                    void finishRecording();
                  } else {
                    void recorder.start({
                      id: meetingParam,
                      title: title.trim() || defaultTitle(),
                    });
                  }
                }}
                disabled={
                  recorder.state === "starting" ||
                  recorder.state === "stopping" ||
                  (!busyRecording && !projectId && !meetingParam)
                }
                className={cn(
                  "relative flex size-32 items-center justify-center rounded-full text-primary-foreground shadow-xl transition-transform active:scale-95 disabled:opacity-50",
                  busyRecording ? "bg-destructive" : "bg-primary",
                )}
                aria-label={busyRecording ? "Stop recording" : "Start recording"}
              >
                {busyRecording ? (
                  <CircleStop className="size-12" />
                ) : (
                  <Mic className="size-12" />
                )}
              </button>
            </div>

            <div className="text-center">
              <p className="font-mono text-3xl tabular-nums">
                {formatDuration(recorder.elapsedMs / 1000)}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {recorder.state === "starting"
                  ? "Starting…"
                  : recorder.state === "recording"
                    ? "Recording — saved to this device every 10 seconds"
                    : recorder.state === "paused"
                      ? "Paused — stop when you are done to upload it"
                      : recorder.state === "stopping"
                        ? "Finishing…"
                        : loadingPending
                          ? "Checking for unsent audio…"
                          : "Tap to start"}
              </p>
            </div>

            {busyRecording ? (
              <div className="w-full max-w-sm space-y-2">
                <Progress value={progressPct} />
                <p className="text-center text-xs text-muted-foreground">
                  {formatDuration(
                    (recorder.maxDurationMs - recorder.elapsedMs) / 1000,
                  )}{" "}
                  left of the {MAX_DURATION_MIN}-minute limit
                </p>
                {recorder.isNearLimit ? (
                  <p className="text-center text-xs font-medium text-warning">
                    Approaching the limit — recording stops automatically at{" "}
                    {MAX_DURATION_MIN} minutes.
                  </p>
                ) : null}
              </div>
            ) : null}

            {busyRecording ? (
              <div className="w-full max-w-sm space-y-2">
                {/* The finishing action is spelled out rather than left to the
                    icon on the circle — Pause and Discard being the only
                    labelled controls reads as having no way to finish. */}
                <Button
                  size="lg"
                  className="w-full"
                  loading={recorder.state === "stopping"}
                  onClick={() => void finishRecording()}
                >
                  <CircleStop className="size-5" />
                  Stop &amp; upload
                </Button>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="flex-1"
                    disabled={recorder.state === "stopping"}
                    onClick={() =>
                      recorder.state === "paused"
                        ? recorder.resume()
                        : recorder.pause()
                    }
                  >
                    {recorder.state === "paused" ? (
                      <>
                        <Play className="size-4" />
                        Resume
                      </>
                    ) : (
                      <>
                        <Pause className="size-4" />
                        Pause
                      </>
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    className="flex-1 text-muted-foreground"
                    disabled={recorder.state === "stopping"}
                    onClick={() => setConfirmDiscard(true)}
                  >
                    <Trash2 className="size-4" />
                    Discard
                  </Button>
                </div>
              </div>
            ) : (
              <Button variant="outline" onClick={() => fileInput.current?.click()}>
                <Upload className="size-4" />
                Upload a file instead
              </Button>
            )}

            <input
              ref={fileInput}
              type="file"
              accept="audio/*,video/mp4"
              className="hidden"
              onChange={onPickFile}
            />
          </div>
        </>
      ) : null}

      <ConfirmDialog
        open={confirmDiscard}
        onOpenChange={setConfirmDiscard}
        title="Discard this recording?"
        description="The audio only exists on this device. This cannot be undone."
        confirmLabel="Discard"
        destructive
        onConfirm={async () => {
          if (pending) {
            if (!pending.session.id.startsWith("file-")) {
              await deleteSession(pending.session.id);
            }
            setPending(null);
          } else if (recorder.sessionId) {
            const id = recorder.sessionId;
            await recorder.cancel();
            await deleteSession(id);
          }
          setConfirmDiscard(false);
          setSearch({}, { replace: true });
        }}
      />
    </>
  );
}

function defaultTitle() {
  return `Meeting — ${formatDate(todayIso())}`;
}
