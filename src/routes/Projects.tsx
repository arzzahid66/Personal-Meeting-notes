import * as React from "react";
import { Link } from "react-router-dom";
import { Archive, ChevronRight, FolderKanban, Plus } from "lucide-react";
import { toast } from "sonner";
import { ApiError } from "@/api/client";
import { useCreateProject, useProjects } from "@/hooks/queries";
import { PageHeader } from "@/components/AppShell";
import {
  ProjectFormFields,
  useProjectForm,
} from "@/components/ProjectForm";
import { Button } from "@/components/ui/button";
import { Card, Skeleton } from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { EmptyState, ErrorNotice, Switch } from "@/components/ui/misc";
import { Label } from "@/components/ui/input";

export default function ProjectsScreen() {
  const [includeArchived, setIncludeArchived] = React.useState(false);
  const projects = useProjects(includeArchived);

  return (
    <>
      <PageHeader
        title="Projects"
        description="Meetings and tasks are grouped by project."
        action={<NewProjectDialog />}
      />

      <div className="mb-4 flex items-center justify-end gap-2">
        <Label htmlFor="show-archived" className="text-sm text-muted-foreground">
          Show archived
        </Label>
        <Switch
          id="show-archived"
          checked={includeArchived}
          onCheckedChange={setIncludeArchived}
        />
      </div>

      {projects.isPending ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : projects.isError ? (
        <ErrorNotice message={(projects.error as Error).message} />
      ) : projects.data.length === 0 ? (
        <EmptyState
          icon={FolderKanban}
          title="No projects yet"
          description="Create one before your first meeting. Its context and glossary are what make the generated tasks accurate."
          action={<NewProjectDialog />}
        />
      ) : (
        <ul className="space-y-2">
          {projects.data.map((project) => (
            <li key={project.id}>
              <Card className="transition-colors hover:border-primary/40">
                <Link
                  to={`/projects/${project.id}`}
                  className="flex items-center gap-3 p-4"
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-medium" dir="auto">
                        {project.name}
                      </p>
                      {project.is_archived ? (
                        <Badge variant="neutral">
                          <Archive className="size-3" />
                          Archived
                        </Badge>
                      ) : null}
                    </div>
                    {project.description ? (
                      <p
                        className="truncate text-sm text-muted-foreground"
                        dir="auto"
                      >
                        {project.description}
                      </p>
                    ) : null}
                  </div>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                </Link>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function NewProjectDialog() {
  const [open, setOpen] = React.useState(false);
  const form = useProjectForm();
  const create = useCreateProject();
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setErrors({});
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="size-4" />
          New
        </Button>
      </DialogTrigger>
      <DialogContent
        title="New project"
        description="Context and glossary are injected into every generation for this project."
      >
        <ProjectFormFields value={form.value} patch={form.patch} errors={errors} />
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button
            loading={create.isPending}
            disabled={!form.value.name.trim()}
            onClick={() =>
              create.mutate(form.payload(), {
                onSuccess: () => {
                  setOpen(false);
                  toast.success("Project created.");
                },
                onError: (err) => {
                  // A duplicate name comes back as a 400 about the name field.
                  if (err instanceof ApiError && err.status === 400) {
                    setErrors({ name: err.message });
                  } else {
                    toast.error(err.message);
                  }
                },
              })
            }
          >
            Create project
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
