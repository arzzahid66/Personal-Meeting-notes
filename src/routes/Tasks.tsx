import * as React from "react";
import { CheckSquare, Plus, SlidersHorizontal, X } from "lucide-react";
import { toast } from "sonner";
import type {
  Severity,
  TaskListParams,
  TaskStatus,
  TaskType,
} from "@/api/types";
import { useCreateTask, useProjects, useTasks } from "@/hooks/queries";
import { PageHeader } from "@/components/AppShell";
import { TaskCard } from "@/components/TaskCard";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/input";
import { SimpleSelect } from "@/components/ui/select";
import { EmptyState, ErrorNotice, Switch } from "@/components/ui/misc";
import {
  SEVERITY_LABEL,
  TASK_STATUS_LABEL,
  TASK_TYPE_LABEL,
} from "@/lib/meeting";
import { Label } from "@/components/ui/input";

const STATUS_OPTIONS = [
  { value: "", label: "Any status" },
  ...(Object.keys(TASK_STATUS_LABEL) as TaskStatus[]).map((s) => ({
    value: s,
    label: TASK_STATUS_LABEL[s],
  })),
];

const SEVERITY_OPTIONS = [
  { value: "", label: "Any severity" },
  ...(Object.keys(SEVERITY_LABEL) as Severity[]).map((s) => ({
    value: s,
    label: SEVERITY_LABEL[s],
  })),
];

const TYPE_OPTIONS = [
  { value: "", label: "Any type" },
  ...(Object.keys(TASK_TYPE_LABEL) as TaskType[]).map((t) => ({
    value: t,
    label: TASK_TYPE_LABEL[t],
  })),
];

export default function TasksScreen() {
  const projects = useProjects();
  const [filters, setFilters] = React.useState<TaskListParams>({});
  const [showFilters, setShowFilters] = React.useState(false);

  const tasks = useTasks(filters);
  const activeFilterCount = Object.values(filters).filter(Boolean).length;

  const set = (patch: Partial<TaskListParams>) =>
    setFilters((f) => {
      const next = { ...f, ...patch };
      for (const key of Object.keys(next) as (keyof TaskListParams)[]) {
        if (!next[key]) delete next[key];
      }
      return next;
    });

  return (
    <>
      <PageHeader
        title="Tasks"
        description="Everything extracted from your meetings, in one place."
        action={<NewTaskDialog />}
      />

      <div className="mb-4 space-y-3">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowFilters((v) => !v)}
          >
            <SlidersHorizontal className="size-4" />
            Filters
            {activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
          </Button>
          {activeFilterCount > 0 ? (
            <Button variant="ghost" size="sm" onClick={() => setFilters({})}>
              <X className="size-4" />
              Clear
            </Button>
          ) : null}
        </div>

        {showFilters ? (
          <div className="grid gap-3 rounded-xl border bg-card p-3 sm:grid-cols-2">
            <SimpleSelect
              value={filters.project_id ?? ""}
              onChange={(value) => set({ project_id: value || undefined })}
              options={[
                { value: "", label: "All projects" },
                ...(projects.data ?? []).map((p) => ({
                  value: p.id,
                  label: p.name,
                })),
              ]}
            />
            <SimpleSelect
              value={filters.status ?? ""}
              onChange={(value) =>
                set({ status: (value || undefined) as TaskStatus | undefined })
              }
              options={STATUS_OPTIONS}
            />
            <SimpleSelect
              value={filters.severity ?? ""}
              onChange={(value) =>
                set({ severity: (value || undefined) as Severity | undefined })
              }
              options={SEVERITY_OPTIONS}
            />
            <SimpleSelect
              value={filters.task_type ?? ""}
              onChange={(value) =>
                set({ task_type: (value || undefined) as TaskType | undefined })
              }
              options={TYPE_OPTIONS}
            />
            <Field label="Due on or before" htmlFor="due-before">
              <Input
                id="due-before"
                type="date"
                value={filters.due_before ?? ""}
                onChange={(e) => set({ due_before: e.target.value || undefined })}
              />
            </Field>
            <div className="flex items-center justify-between gap-2 sm:pt-6">
              <Label htmlFor="overdue">Overdue only</Label>
              <Switch
                id="overdue"
                checked={Boolean(filters.overdue)}
                onCheckedChange={(checked) =>
                  set({ overdue: checked || undefined })
                }
              />
            </div>
          </div>
        ) : null}
      </div>

      {tasks.isPending ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : tasks.isError ? (
        <ErrorNotice message={(tasks.error as Error).message} />
      ) : tasks.data.length === 0 ? (
        <EmptyState
          icon={CheckSquare}
          title={activeFilterCount > 0 ? "Nothing matches those filters" : "No tasks yet"}
          description={
            activeFilterCount > 0
              ? undefined
              : "Tasks appear after you generate notes from a transcribed meeting."
          }
        />
      ) : (
        <ul className="space-y-2">
          {tasks.data.map((task) => (
            <li key={task.id}>
              <TaskCard task={task} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function NewTaskDialog() {
  const projects = useProjects();
  const create = useCreateTask();
  const [open, setOpen] = React.useState(false);
  const [projectId, setProjectId] = React.useState("");
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [taskType, setTaskType] = React.useState<TaskType>("task");
  const [severity, setSeverity] = React.useState<Severity>("medium");
  const [deadline, setDeadline] = React.useState("");
  const [assignee, setAssignee] = React.useState("");

  React.useEffect(() => {
    if (!projectId && projects.data?.length) setProjectId(projects.data[0].id);
  }, [projects.data, projectId]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="size-4" />
          New
        </Button>
      </DialogTrigger>
      <DialogContent
        title="New task"
        description="Manually created tasks carry no source quote — that is reserved for tasks the model pulled out of a transcript."
      >
        <div className="space-y-3">
          <Field label="Project" htmlFor="task-project">
            <SimpleSelect
              id="task-project"
              value={projectId}
              onChange={setProjectId}
              options={(projects.data ?? []).map((p) => ({
                value: p.id,
                label: p.name,
              }))}
              placeholder="Choose a project"
            />
          </Field>
          <Field label="Title" htmlFor="task-title">
            <Input
              id="task-title"
              value={title}
              maxLength={500}
              onChange={(e) => setTitle(e.target.value)}
              dir="auto"
            />
          </Field>
          <Field label="Description" htmlFor="task-description">
            <Textarea
              id="task-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              dir="auto"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Type" htmlFor="task-type">
              <SimpleSelect
                id="task-type"
                value={taskType}
                onChange={setTaskType}
                options={TYPE_OPTIONS.slice(1) as { value: TaskType; label: string }[]}
              />
            </Field>
            <Field label="Severity" htmlFor="task-severity">
              <SimpleSelect
                id="task-severity"
                value={severity}
                onChange={setSeverity}
                options={
                  SEVERITY_OPTIONS.slice(1) as { value: Severity; label: string }[]
                }
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Deadline" htmlFor="task-deadline">
              <Input
                id="task-deadline"
                type="date"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
              />
            </Field>
            <Field label="Assignee" htmlFor="task-assignee">
              <Input
                id="task-assignee"
                value={assignee}
                onChange={(e) => setAssignee(e.target.value)}
                dir="auto"
              />
            </Field>
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button
            loading={create.isPending}
            disabled={!projectId || !title.trim()}
            onClick={() =>
              create.mutate(
                {
                  project_id: projectId,
                  title: title.trim(),
                  description: description.trim() || null,
                  task_type: taskType,
                  severity,
                  deadline: deadline || null,
                  assignee: assignee.trim() || null,
                },
                {
                  onSuccess: () => {
                    setOpen(false);
                    setTitle("");
                    setDescription("");
                    setDeadline("");
                    setAssignee("");
                    toast.success("Task created.");
                  },
                  onError: (err) => toast.error(err.message),
                },
              )
            }
          >
            Create task
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
