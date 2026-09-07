import * as React from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  CircleStop,
  KeyRound,
  Loader2,
  Radio,
  RefreshCw,
  Sparkles,
  Wifi,
} from "lucide-react";
import { toast } from "sonner";
import { LANGUAGE_OPTIONS, type TranscriptionLanguage } from "@/api/live";
import type { OutputLanguage, UUID } from "@/api/types";
import { useAuth } from "@/hooks/auth";
import { useCreateMeeting, useProjects } from "@/hooks/queries";
import { useLiveTranscription } from "@/hooks/useLiveTranscription";
import { AUTO_EXTRACT_MS, useTaskExtraction } from "@/hooks/useTaskExtraction";
import { PageHeader } from "@/components/AppShell";
import { ExtractedTaskCard } from "@/components/ExtractedTaskCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";
import { SimpleSelect } from "@/components/ui/select";
import { EmptyState, ErrorNotice } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatDuration, todayIso } from "@/lib/utils";

export default function LiveScreen() {
  const { keysReady } = useAuth();
  const navigate = useNavigate();
  const [search] = useSearchParams();
  const projects = useProjects();
  const createMeeting = useCreateMeeting();

  const live = useLiveTranscription();
  const [meetingId, setMeetingId] = React.useState<UUID | null>(
    search.get("meeting"),
  );
  const extraction = useTaskExtraction(meetingId ?? undefined);

  const [projectId, setProjectId] = React.useState("");
  const [title, setTitle] = React.useState(defaultTitle);
  const [language, setLanguage] = React.useState<TranscriptionLanguage>("multi");
  const [taskLanguage, setTaskLanguage] = React.useState<OutputLanguage | "">("");
  const [starting, setStarting] = React.useState(false);
  const [finishing, setFinishing] = React.useState(false);

  const transcriptBox = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!projectId && projects.data?.length) setProjectId(projects.data[0].id);
  }, [projects.data, projectId]);

  // Follow the transcript unless the user has scrolled up to read something.
  React.useEffect(() => {
    const el = transcriptBox.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (atBottom) el.scrollTop = el.scrollHeight;
  }, [live.finalText, live.interimText]);

  // Extraction runs on a long timer, never on transcript updates: every call
  // costs at least six seconds and re-reading old text duplicates tasks.
  React.useEffect(() => {
    if (!live.isActive || !meetingId) return;
    const id = window.setInterval(() => {
      void extraction.run(live.transcript, {
        outputLanguage: taskLanguage || null,
      });
    }, AUTO_EXTRACT_MS);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live.isActive, meetingId, taskLanguage]);

  if (!keysReady) {
    return (
      <>
        <PageHeader title="Live meeting" />
        <Card>
          <CardContent className="space-y-4 pt-6 text-center">
            <KeyRound className="mx-auto size-8 text-destructive" />
            <div className="space-y-1">
              <p className="font-medium">Add a provider API key first</p>
              <p className="text-sm text-muted-foreground">
                Transcription streams to Deepgram, but turning it into tasks
                needs your own LLM key.
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

  async function onStart() {
    setStarting(true);
    try {
      let id = meetingId;
      if (!id) {
        if (!projectId) {
          toast.error("Choose a project for this meeting.");
          return;
        }
        const meeting = await createMeeting.mutateAsync({
          project_id: projectId,
          title: title.trim() || defaultTitle(),
          meeting_date: todayIso(),
        });
        id = meeting.id;
        setMeetingId(id);
      }
      extraction.reset();
      await live.start(language);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not start.");
    } finally {
      setStarting(false);
    }
  }

  async function onStop() {
    setFinishing(true);
    try {
      const transcript = await live.stop();
      if (transcript && meetingId) {
        // One clean sweep over everything said, replacing whatever the
        // incremental runs left behind.
        const count = await extraction.run(transcript, {
          final: true,
          outputLanguage: taskLanguage || null,
        });
        toast.success(
          count > 0
            ? `Meeting finished — ${count} task${count === 1 ? "" : "s"} saved.`
            : "Meeting finished.",
        );
      }
    } finally {
      setFinishing(false);
    }
  }

  const pending = extraction.pendingChars(live.transcript);

  return (
    <>
      <PageHeader
        title="Live meeting"
        description={
          live.isActive ? (
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill status={live.status} />
              <span className="font-mono tabular-nums">
                {formatDuration(live.elapsedMs / 1000)}
              </span>
              {live.reconnects > 0 ? (
                <Badge variant="neutral">
                  {live.reconnects} reconnect{live.reconnects === 1 ? "" : "s"}
                </Badge>
              ) : null}
            </div>
          ) : (
            "Transcribes as you speak, and finds tasks while the meeting runs."
          )
        }
      />

      <div className="space-y-4">
        {live.error ? <ErrorNotice message={live.error} /> : null}
        {extraction.error ? (
          <ErrorNotice
            title="Task extraction failed"
            message={extraction.error}
            action={
              <Button
                size="sm"
                variant="outline"
                onClick={() => extraction.clearError()}
              >
                Dismiss
              </Button>
            }
          />
        ) : null}

        {/* ------------------------------------------------------- setup */}
        {!live.isActive && live.status !== "connecting" ? (
          <Card>
            <CardContent className="space-y-3 pt-5">
              {!meetingId ? (
                <>
                  <Field label="Project" htmlFor="live-project">
                    <SimpleSelect
                      id="live-project"
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
                  <Field label="Title" htmlFor="live-title">
                    <Input
                      id="live-title"
                      value={title}
                      maxLength={300}
                      onChange={(e) => setTitle(e.target.value)}
                      dir="auto"
                    />
                  </Field>
                </>
              ) : null}

              <Field
                label="Spoken language"
                htmlFor="live-language"
                hint={
                  LANGUAGE_OPTIONS.find((o) => o.value === language)?.hint
                }
              >
                <SimpleSelect
                  id="live-language"
                  value={language}
                  onChange={(v) => setLanguage(v as TranscriptionLanguage)}
                  options={LANGUAGE_OPTIONS.map(({ value, label }) => ({
                    value,
                    label,
                  }))}
                />
              </Field>

              <Field
                label="Task language"
                htmlFor="live-task-language"
                hint="Independent of the spoken language. Type and severity always stay in English."
              >
                <SimpleSelect
                  id="live-task-language"
                  value={taskLanguage}
                  onChange={(v) => setTaskLanguage(v as OutputLanguage | "")}
                  options={[
                    { value: "", label: "Account default" },
                    { value: "en", label: "English" },
                    { value: "ur", label: "اردو — Urdu" },
                  ]}
                />
              </Field>
            </CardContent>
          </Card>
        ) : null}

        {/* -------------------------------------------------- transcript */}
        {live.isActive || live.finalText ? (
          <Card>
            <CardContent className="space-y-2 pt-4">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Transcript
                </p>
                {live.status === "reconnecting" ? (
                  <span className="flex items-center gap-1.5 text-xs text-warning">
                    <RefreshCw className="size-3.5 animate-spin" />
                    Reconnecting — audio may be missing
                  </span>
                ) : null}
              </div>
              <div
                ref={transcriptBox}
                className="max-h-72 overflow-y-auto rounded-lg bg-muted/40 p-3 text-sm leading-relaxed"
              >
                {live.finalText || live.interimText ? (
                  <p dir="auto">
                    {live.finalText}
                    {/* Interim text is provisional and will be rewritten. */}
                    {live.interimText ? (
                      <span className="italic text-muted-foreground">
                        {live.interimText}
                      </span>
                    ) : null}
                  </p>
                ) : (
                  <p className="text-muted-foreground">Listening…</p>
                )}
              </div>
            </CardContent>
          </Card>
        ) : null}

        {/* ------------------------------------------------------ controls */}
        <div className="space-y-2">
          {live.isActive ? (
            <>
              <Button
                size="lg"
                variant="destructive"
                className="w-full"
                loading={finishing || live.status === "stopping"}
                onClick={onStop}
              >
                <CircleStop className="size-5" />
                Stop and save tasks
              </Button>
              <Button
                variant="outline"
                className="w-full"
                loading={extraction.busy}
                disabled={pending === 0}
                onClick={() =>
                  extraction.run(live.transcript, {
                    outputLanguage: taskLanguage || null,
                  })
                }
              >
                <Sparkles className="size-4" />
                {pending === 0
                  ? "Nothing new to scan"
                  : `Find tasks in what was just said`}
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                Runs automatically every {AUTO_EXTRACT_MS / 60_000} minutes.
                {extraction.busy ? " Scanning now…" : ""}
              </p>
            </>
          ) : (
            <Button
              size="lg"
              className="w-full"
              loading={starting || live.status === "connecting"}
              disabled={!meetingId && !projectId}
              onClick={onStart}
            >
              <Radio className="size-5" />
              Start listening
            </Button>
          )}
        </div>

        {/* --------------------------------------------------------- board */}
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium">
              Tasks found
              {extraction.tasks.length > 0 ? ` (${extraction.tasks.length})` : ""}
            </h2>
            {meetingId && !live.isActive && extraction.tasks.length > 0 ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate(`/meetings/${meetingId}`)}
              >
                Open meeting
              </Button>
            ) : null}
          </div>

          {extraction.tasks.length === 0 ? (
            <EmptyState
              icon={Sparkles}
              title={live.isActive ? "Listening for tasks" : "No tasks yet"}
              description={
                live.isActive
                  ? "Anything that sounds like a task will appear here as the meeting goes on."
                  : "Start listening, and tasks are pulled out of the conversation as it happens."
              }
            />
          ) : (
            <ul className="space-y-2">
              {extraction.tasks.map((task, i) => (
                <li key={task.id ?? `${i}-${task.title}`}>
                  <ExtractedTaskCard task={task} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}

function StatusPill({ status }: { status: string }) {
  if (status === "reconnecting") {
    return (
      <Badge variant="warning">
        <RefreshCw className="animate-spin" />
        Reconnecting
      </Badge>
    );
  }
  if (status === "connecting") {
    return (
      <Badge variant="neutral">
        <Loader2 className="animate-spin" />
        Connecting
      </Badge>
    );
  }
  return (
    <Badge variant="success">
      <Wifi />
      Live
    </Badge>
  );
}

function defaultTitle() {
  return `Meeting — ${formatDate(todayIso())}`;
}
