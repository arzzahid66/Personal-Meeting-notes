import * as React from "react";
import {
  Check,
  CircleDashed,
  CircleDot,
  Quote,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import type { Task, TaskStatus } from "@/api/types";
import { useDeleteTask, useUpdateTask } from "@/hooks/queries";
import {
  SEVERITY_CLASS,
  SEVERITY_LABEL,
  TASK_STATUS_LABEL,
  TASK_TYPE_LABEL,
  nextTaskStatus,
} from "@/lib/meeting";
import { cn, formatDate, isOverdue } from "@/lib/utils";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { ConfirmDialog } from "./ui/dialog";

const STATUS_ICON: Record<TaskStatus, React.ComponentType<{ className?: string }>> = {
  open: CircleDashed,
  in_progress: CircleDot,
  done: Check,
  cancelled: X,
};

export function TaskCard({ task }: { task: Task }) {
  const update = useUpdateTask();
  const remove = useDeleteTask();
  const [confirmDelete, setConfirmDelete] = React.useState(false);

  const Icon = STATUS_ICON[task.status];
  const done = task.status === "done" || task.status === "cancelled";
  const overdue = isOverdue(task.deadline, task.status);

  return (
    <>
      <Card className={cn("p-3", done && "opacity-70")}>
        <div className="flex items-start gap-3">
          <button
            type="button"
            aria-label={`Mark as ${TASK_STATUS_LABEL[nextTaskStatus(task.status)]}`}
            disabled={update.isPending}
            onClick={() =>
              update.mutate(
                { id: task.id, body: { status: nextTaskStatus(task.status) } },
                {
                  onError: (err) => toast.error(err.message),
                },
              )
            }
            // The main interaction on the task board, so the hit area is sized
            // for a thumb: 40px of tappable button around a 24px ring, with the
            // negative margin keeping the layout identical.
            className="-m-2 flex shrink-0 items-center justify-center p-2 disabled:opacity-50"
          >
            <span
              className={cn(
                "flex size-6 items-center justify-center rounded-full border transition-colors",
                task.status === "done"
                  ? "border-success bg-success text-white"
                  : task.status === "in_progress"
                    ? "border-primary text-primary"
                    : "border-muted-foreground/40 text-muted-foreground hover:border-primary hover:text-primary",
              )}
            >
              <Icon className="size-3.5" />
            </span>
          </button>

          <div className="min-w-0 flex-1 space-y-2">
            <p
              className={cn(
                "font-medium leading-snug",
                done && "line-through decoration-muted-foreground/60",
              )}
              dir="auto"
            >
              {task.title}
            </p>

            {task.description ? (
              <p className="text-sm text-muted-foreground" dir="auto">
                {task.description}
              </p>
            ) : null}

            <div className="flex flex-wrap items-center gap-1.5">
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
                <Badge variant="neutral" title="Model confidence">
                  {Math.round(task.confidence * 100)}%
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

          <Button
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground"
            aria-label="Delete task"
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2 />
          </Button>
        </div>
      </Card>

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
