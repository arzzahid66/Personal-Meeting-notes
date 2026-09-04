import * as React from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Archive, ArchiveRestore, CalendarDays, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ApiError } from "@/api/client";
import {
  useDeleteProject,
  useMeetings,
  useProject,
  useUpdateProject,
} from "@/hooks/queries";
import { PageHeader } from "@/components/AppShell";
import { ProjectFormFields, useProjectForm } from "@/components/ProjectForm";
import { StatusChip } from "@/components/StatusChip";
import { Button } from "@/components/ui/button";
import { Card, Skeleton } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/dialog";
import { EmptyState, ErrorNotice } from "@/components/ui/misc";
import { formatDate } from "@/lib/utils";

export default function ProjectDetailScreen() {
  const { id = "" } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const project = useProject(id);
  const update = useUpdateProject(id);
  const remove = useDeleteProject();
  const meetings = useMeetings({ project_id: id, limit: 10 });
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  const form = useProjectForm(project.data ?? undefined);
  const { patch } = form;
  const loaded = React.useRef(false);

  // Seed the form once the project lands; never clobber in-progress edits.
  React.useEffect(() => {
    if (project.data && !loaded.current) {
      loaded.current = true;
      patch({
        name: project.data.name,
        description: project.data.description ?? "",
        llm_context: project.data.llm_context ?? "",
        glossary: project.data.glossary ?? "",
        system_prompt_override: project.data.system_prompt_override ?? "",
        default_output_language: project.data.default_output_language,
      });
    }
  }, [project.data, patch]);

  if (project.isPending) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }

  if (project.isError || !project.data) {
    return (
      <>
        <PageHeader title="Project" back={<BackLink />} />
        <ErrorNotice
          message={(project.error as Error)?.message ?? "Project not found."}
        />
      </>
    );
  }

  const archived = project.data.is_archived;

  return (
    <>
      <PageHeader title={project.data.name} back={<BackLink />} />

      <div className="space-y-6">
        <section className="space-y-4">
          <ProjectFormFields
            value={form.value}
            patch={form.patch}
            errors={errors}
            idPrefix="edit-project"
          />
          <Button
            className="w-full"
            loading={update.isPending}
            disabled={!form.value.name.trim()}
            onClick={() => {
              setErrors({});
              update.mutate(form.payload(), {
                onSuccess: () => toast.success("Project saved."),
                onError: (err) => {
                  if (err instanceof ApiError && err.status === 400) {
                    setErrors({ name: err.message });
                  } else {
                    toast.error(err.message);
                  }
                },
              });
            }}
          >
            Save changes
          </Button>
        </section>

        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium">Recent meetings</h2>
            <Button asChild variant="ghost" size="sm">
              <Link to={`/meetings?project=${id}`}>View all</Link>
            </Button>
          </div>

          {meetings.isPending ? (
            <Skeleton className="h-16 w-full" />
          ) : meetings.data && meetings.data.items.length > 0 ? (
            <ul className="space-y-2">
              {meetings.data.items.map((meeting) => (
                <li key={meeting.id}>
                  <Card className="transition-colors hover:border-primary/40">
                    <Link
                      to={`/meetings/${meeting.id}`}
                      className="flex items-center justify-between gap-3 p-3"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium" dir="auto">
                          {meeting.title}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatDate(meeting.meeting_date)}
                        </p>
                      </div>
                      <StatusChip status={meeting.status} />
                    </Link>
                  </Card>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              icon={CalendarDays}
              title="No meetings in this project"
              action={
                <Button asChild size="sm">
                  <Link to={`/meetings/new?project=${id}`}>New meeting</Link>
                </Button>
              }
            />
          )}
        </section>

        <section className="space-y-2 border-t pt-4">
          <Button
            variant="outline"
            className="w-full"
            loading={update.isPending}
            onClick={() =>
              update.mutate(
                { is_archived: !archived },
                {
                  onSuccess: () =>
                    toast.success(archived ? "Project restored." : "Project archived."),
                  onError: (err) => toast.error(err.message),
                },
              )
            }
          >
            {archived ? (
              <>
                <ArchiveRestore className="size-4" />
                Restore project
              </>
            ) : (
              <>
                <Archive className="size-4" />
                Archive project
              </>
            )}
          </Button>

          <Button
            variant="ghost"
            className="w-full text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2 className="size-4" />
            Delete project
          </Button>
        </section>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete this project?"
        description="Every meeting, transcript, note and task inside it is deleted too. This cannot be undone."
        confirmLabel="Delete everything"
        destructive
        loading={remove.isPending}
        onConfirm={() =>
          remove.mutate(id, {
            onSuccess: () => {
              toast.success("Project deleted.");
              navigate("/projects", { replace: true });
            },
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
      <Link to="/projects">
        <ArrowLeft className="size-4" />
        Projects
      </Link>
    </Button>
  );
}
