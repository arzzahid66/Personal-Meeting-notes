import { Quote } from "lucide-react";
import type { ExtractedTask } from "@/api/types";
import { SEVERITY_CLASS, SEVERITY_LABEL, taskTypeLabel } from "@/lib/meeting";
import { Badge } from "./ui/badge";
import { Card } from "./ui/card";

/**
 * A task as the extractor just returned it, before the board reloads from the
 * API. Read-only on purpose: it appears mid-meeting, and the editable version
 * is the saved row on the task board.
 */
export function ExtractedTaskCard({ task }: { task: ExtractedTask }) {
  return (
    <Card className="animate-in p-3">
      <div className="space-y-2">
        <p className="font-medium leading-snug" dir="auto">
          {task.title}
        </p>

        {task.short_description ? (
          <p className="text-sm text-muted-foreground" dir="auto">
            {task.short_description}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-1.5">
          <Badge className={SEVERITY_CLASS[task.severity]}>
            {SEVERITY_LABEL[task.severity]}
          </Badge>
          <Badge variant="outline">{taskTypeLabel(task.type)}</Badge>
          {task.assignee ? (
            <Badge variant="neutral" dir="auto">
              {task.assignee}
            </Badge>
          ) : null}
          {task.id === null ? <Badge variant="warning">Preview</Badge> : null}
        </div>

        {/* Collapsed by default: it is the evidence, consulted when a task looks
            wrong, not something to read on every card. */}
        {task.source_quote ? (
          <details className="group">
            <summary className="cursor-pointer text-xs text-muted-foreground">
              What was said
            </summary>
            <blockquote className="mt-1.5 flex gap-2 rounded-lg bg-muted/60 p-2.5 text-sm text-muted-foreground">
              <Quote className="mt-0.5 size-3.5 shrink-0 opacity-60" />
              <span dir="auto">{task.source_quote}</span>
            </blockquote>
          </details>
        ) : null}
      </div>
    </Card>
  );
}
