import * as React from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, FolderPlus } from "lucide-react";
import { ApiError } from "@/api/client";
import type { OutputLanguage } from "@/api/types";
import { useCreateMeeting, useProjects } from "@/hooks/queries";
import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import { SimpleSelect } from "@/components/ui/select";
import { ErrorNotice } from "@/components/ui/misc";
import { todayIso } from "@/lib/utils";

export default function NewMeetingScreen() {
  const navigate = useNavigate();
  const [search] = useSearchParams();
  const projects = useProjects();
  const createMeeting = useCreateMeeting();

  const [projectId, setProjectId] = React.useState(search.get("project") ?? "");
  const [title, setTitle] = React.useState("");
  const [date, setDate] = React.useState(todayIso());
  const [manualNotes, setManualNotes] = React.useState("");
  const [language, setLanguage] = React.useState<OutputLanguage | "">("");
  const [error, setError] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});

  // Default to the only project, or the first one, so the common case is one tap.
  React.useEffect(() => {
    if (!projectId && projects.data && projects.data.length > 0) {
      setProjectId(projects.data[0].id);
    }
  }, [projects.data, projectId]);

  const hasProjects = (projects.data?.length ?? 0) > 0;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});
    try {
      const meeting = await createMeeting.mutateAsync({
        project_id: projectId,
        title: title.trim(),
        meeting_date: date,
        manual_notes: manualNotes.trim() || null,
        output_language: language || null,
      });
      navigate(`/meetings/${meeting.id}`, { replace: true });
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fieldErrors).length > 0) {
        setFieldErrors(err.fieldErrors);
      } else {
        setError(err instanceof Error ? err.message : "Could not create the meeting.");
      }
    }
  }

  return (
    <>
      <PageHeader
        title="New meeting"
        back={
          <Button asChild variant="ghost" size="sm" className="-ml-2">
            <Link to="/meetings">
              <ArrowLeft className="size-4" />
              Meetings
            </Link>
          </Button>
        }
      />

      {projects.isPending ? null : !hasProjects ? (
        <div className="space-y-4 rounded-xl border border-dashed p-6 text-center">
          <FolderPlus className="mx-auto size-8 text-muted-foreground/60" />
          <div className="space-y-1">
            <p className="font-medium">Create a project first</p>
            <p className="text-sm text-muted-foreground">
              Meetings belong to a project, and the project carries the context
              and glossary that shape the generated tasks.
            </p>
          </div>
          <Button asChild>
            <Link to="/projects">Go to projects</Link>
          </Button>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          {error ? <ErrorNotice message={error} /> : null}

          <Field label="Project" htmlFor="project">
            <SimpleSelect
              id="project"
              value={projectId}
              onChange={setProjectId}
              options={(projects.data ?? []).map((p) => ({
                value: p.id,
                label: p.name,
              }))}
            />
          </Field>

          <Field label="Title" htmlFor="title" error={fieldErrors.title}>
            <Input
              id="title"
              required
              maxLength={300}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Sprint planning — week 36"
              dir="auto"
            />
          </Field>

          <Field label="Date" htmlFor="date" error={fieldErrors.meeting_date}>
            <Input
              id="date"
              type="date"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </Field>

          <Field
            label="Context for the model"
            htmlFor="notes"
            hint="Anything the transcript will not say: who was there, what was decided elsewhere, names to watch for. Fed to the model alongside the transcript."
          >
            <Textarea
              id="notes"
              value={manualNotes}
              onChange={(e) => setManualNotes(e.target.value)}
              placeholder="Ali joined 10 minutes late; discuss payment gateway."
              dir="auto"
            />
          </Field>

          <Field
            label="Output language"
            htmlFor="language"
            hint="Leave on default to use the project's setting."
          >
            <SimpleSelect
              id="language"
              value={language}
              onChange={(value) => setLanguage(value as OutputLanguage | "")}
              options={[
                { value: "", label: "Project default" },
                { value: "en", label: "English" },
                { value: "ur", label: "اردو — Urdu" },
              ]}
            />
          </Field>

          <Button
            type="submit"
            size="lg"
            className="w-full"
            loading={createMeeting.isPending}
            disabled={!projectId || !title.trim()}
          >
            Create meeting
          </Button>
        </form>
      )}
    </>
  );
}
