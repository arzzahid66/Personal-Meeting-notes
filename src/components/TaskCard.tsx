import * as React from "react";
import {
  Check,
  ChevronDown,
  MoreVertical,
  Pencil,
  Quote,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import type { Severity, Task, TaskStatus, TaskType } from "@/api/types";
import { useDeleteTask, useUpdateTask } from "@/hooks/queries";
import {
  SEVERITY_CLASS,
  SEVERITY_LABEL,
  STATUS_CLASS,
  TASK_STATUS_LABEL,
  TASK_STATUS_ORDER,
  TASK_TYPE_LABEL,
} from "@/lib/meeting";
import { cn, formatDate, isOverdue } from "@/lib/utils";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import {
  ConfirmDialog,
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
} from "./ui/dialog";
import {
  DropdownMenu,
  DropdownMenuCheckItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown";
import { Field, Input, Textarea } from "./ui/input";
import { SimpleSelect } from "./ui/select";

export function TaskCard({ task }: { task: Task }) {
  const update = useUpdateTask();
  const remove = useDeleteTask();
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [editing, setEditing] = React.useState(false);

  const settled = task.status === "done" || task.status === "cancelled";
  const overdue = isOverdue(task.deadline, task.status);

  const setStatus = (status: TaskStatus) =>
    update.mutate(
      { id: task.id, body: { status } },
      { onError: (err) => toast.error(err.message) },
    );

  return (
    <>
      <Card className={cn("p-3", settled && "opacity-70")}>
        <div className="flex items-start gap-2.5">
          {/* The common case — finishing a task — is one tap on a control
              everyone already understands, rather than a cycle through states. */}
          <button
            type="button"
            role="checkbox"
            aria-checked={task.status === "done"}
            aria-label={
              task.status === "done" ? "Mark as open" : "Mark as done"
            }
            disabled={update.isPending}
            onClick={() => setStatus(task.status === "done" ? "open" : "done")}
            className="-m-2 flex shrink-0 items-center justify-center p-2 disabled:opacity-50"
          >
            <span
              className={cn(
                "flex size-6 items-center justify-center rounded-md border-2 transition-colors",
                task.status === "done"
                  ? "border-success bg-success text-white"
                  : "border-muted-foreground/40 text-transparent hover:border-primary",
              )}
            >
              <Check className="size-4" strokeWidth={3} />
            </span>
          </button>

          <div className="min-w-0 flex-1 space-y-2">
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="block w-full text-left"
            >
              <span
                className={cn(
                  "font-medium leading-snug",
                  settled && "line-through decoration-muted-foreground/60",
                )}
                dir="auto"
              >
                {task.title}
              </span>
            </button>

            {task.description ? (
              <p className="text-sm text-muted-foreground" dir="auto">
                {task.description}
              </p>
            ) : null}

            <div className="flex flex-wrap items-center gap-1.5">
              {/* Status is named, not implied by an icon, and every state —
                  including Cancelled — is reachable from here. */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    disabled={update.isPending}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full border border-transparent px-2 py-1 text-xs font-medium transition-opacity hover:opacity-80",
                      STATUS_CLASS[task.status],
                    )}
                  >
                    {TASK_STATUS_LABEL[task.status]}
                    <ChevronDown className="size-3 opacity-70" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuLabel>Status</DropdownMenuLabel>
                  {TASK_STATUS_ORDER.map((status) => (
                    <DropdownMenuCheckItem
                      key={status}
                      checked={task.status === status}
                      onSelect={() => setStatus(status)}
                    >
                      {TASK_STATUS_LABEL[status]}
                    </DropdownMenuCheckItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

              <Badge className={SEVERITY_CLASS[task.severity]}>
                {SEVERITY_LABEL[task.severity]}
              </Badge>
              <Badge variant="outline">{TASK_TYPE_LABEL[task.task_type]}</Badge>
              {task.assignee ? (
                <Badge variant="neutral" dir="auto">
                  {task.assignee}
                </Badge>
              ) : null}
              {task.deadline ? (
                <Badge variant={overdue ? "destructive" : "neutral"}>
                  {overdue ? "Overdue " : "Due "}
                  {formatDate(task.deadline)}
                </Badge>
              ) : null}
              {task.confidence != null ? (
                <Badge variant="neutral">
                  {Math.round(task.confidence * 100)}% confident
                </Badge>
              ) : null}
            </div>

            {/* The verbatim transcript line the task came from. This is what
                makes the extraction checkable, so it is always shown. */}
            {task.source_quote ? (
              <blockquote className="flex gap-2 rounded-lg bg-muted/60 p-2.5 text-sm text-muted-foreground">
                <Quote className="mt-0.5 size-3.5 shrink-0 opacity-60" />
                <span dir="auto">{task.source_quote}</span>
              </blockquote>
            ) : null}
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                className="shrink-0 text-muted-foreground"
                aria-label="Task actions"
              >
                <MoreVertical />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => setEditing(true)}>
                <Pencil />
                Edit task
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                onSelect={() => setConfirmDelete(true)}
              >
                <Trash2 />
                Delete task
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </Card>

      <TaskEditDialog task={task} open={editing} onOpenChange={setEditing} />

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete this task?"
        description="It will be removed permanently. Re-generating the meeting will recreate tasks from the transcript."
        confirmLabel="Delete"
        destructive
        loading={remove.isPending}
        onConfirm={() =>
          remove.mutate(
            { id: task.id, meetingId: task.meeting_id },
            {
              onSuccess: () => setConfirmDelete(false),
              onError: (err) => toast.error(err.message),
            },
          )
        }
      />
    </>
  );
}

/* ----------------------------------------------------------------- edit --- */

function TaskEditDialog({
  task,
  open,
  onOpenChange,
}: {
  task: Task;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const update = useUpdateTask();
  const [draft, setDraft] = React.useState(() => toDraft(task));

  // Re-seed whenever the dialog opens, so a cancelled edit does not persist
  // and a task changed elsewhere shows its current values.
  React.useEffect(() => {
    if (open) setDraft(toDraft(task));
  }, [open, task]);

  const patch = (next: Partial<ReturnType<typeof toDraft>>) =>
    setDraft((d) => ({ ...d, ...next }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Edit task">
        <div className="space-y-3">
          <Field label="Title" htmlFor={`title-${task.id}`}>
            <Input
              id={`title-${task.id}`}
              value={draft.title}
              maxLength={500}
              onChange={(e) => patch({ title: e.target.value })}
              dir="auto"
            />
          </Field>

          <Field label="Description" htmlFor={`desc-${task.id}`}>
            <Textarea
              id={`desc-${task.id}`}
              value={draft.description}
              onChange={(e) => patch({ description: e.target.value })}
              dir="auto"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Status" htmlFor={`status-${task.id}`}>
              <SimpleSelect
                id={`status-${task.id}`}
                value={draft.status}
                onChange={(v) => patch({ status: v as TaskStatus })}
                options={TASK_STATUS_ORDER.map((s) => ({
                  value: s,
                  label: TASK_STATUS_LABEL[s],
                }))}
              />
            </Field>
            <Field label="Severity" htmlFor={`sev-${task.id}`}>
              <SimpleSelect
                id={`sev-${task.id}`}
                value={draft.severity}
                onChange={(v) => patch({ severity: v as Severity })}
                options={(Object.keys(SEVERITY_LABEL) as Severity[]).map((s) => ({
                  value: s,
                  label: SEVERITY_LABEL[s],
                }))}
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Type" htmlFor={`type-${task.id}`}>
              <SimpleSelect
                id={`type-${task.id}`}
                value={draft.task_type}
                onChange={(v) => patch({ task_type: v as TaskType })}
                options={(Object.keys(TASK_TYPE_LABEL) as TaskType[]).map((t) => ({
                  value: t,
                  label: TASK_TYPE_LABEL[t],
                }))}
              />
            </Field>
            <Field label="Deadline" htmlFor={`due-${task.id}`}>
              <Input
                id={`due-${task.id}`}
                type="date"
                value={draft.deadline}
                onChange={(e) => patch({ deadline: e.target.value })}
              />
            </Field>
          </div>

          <Field label="Assignee" htmlFor={`who-${task.id}`}>
            <Input
              id={`who-${task.id}`}
              value={draft.assignee}
              onChange={(e) => patch({ assignee: e.target.value })}
              placeholder="Unassigned"
              dir="auto"
            />
          </Field>

          {task.source_quote ? (
            <div className="space-y-1">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                From the transcript
              </p>
              <blockquote className="rounded-lg bg-muted/60 p-2.5 text-sm text-muted-foreground">
                <span dir="auto">{task.source_quote}</span>
              </blockquote>
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button
            loading={update.isPending}
            disabled={!draft.title.trim()}
            onClick={() =>
              update.mutate(
                {
                  id: task.id,
                  body: {
                    title: draft.title.trim(),
                    description: draft.description.trim() || null,
                    status: draft.status,
                    severity: draft.severity,
                    task_type: draft.task_type,
                    deadline: draft.deadline || null,
                    assignee: draft.assignee.trim() || null,
                  },
                },
                {
                  onSuccess: () => {
                    onOpenChange(false);
                    toast.success("Task updated.");
                  },
                  onError: (err) => toast.error(err.message),
                },
              )
            }
          >
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function toDraft(task: Task) {
  return {
    title: task.title,
    description: task.description ?? "",
    status: task.status,
    severity: task.severity,
    task_type: task.task_type,
    deadline: task.deadline ?? "",
    assignee: task.assignee ?? "",
  };
}
