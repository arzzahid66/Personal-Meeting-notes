import type { MeetingStatusValue, Severity, TaskStatus, TaskType } from "@/api/types";

/** The lifecycle table from guide §4.1, verbatim. */
export const MEETING_STAGES: Record<
  MeetingStatusValue,
  { label: string; percent: number; busy: boolean; hint: string }
> = {
  draft: {
    label: "Waiting for audio",
    percent: 0,
    busy: false,
    hint: "No audio yet. Record or upload a file to start.",
  },
  uploaded: {
    label: "Queued",
    percent: 5,
    busy: false,
    hint: "Audio stored and validated. Ready to transcribe.",
  },
  chunking: {
    label: "Splitting audio",
    percent: 10,
    busy: true,
    hint: "The recording is being segmented for transcription.",
  },
  transcribing: {
    label: "Transcribing",
    percent: 30,
    busy: true,
    hint: "Turning speech into text, chunk by chunk.",
  },
  transcribed: {
    label: "Transcribed",
    percent: 70,
    busy: false,
    hint: "Transcript is ready. Generate to extract notes and tasks.",
  },
  generating: {
    label: "Generating notes",
    percent: 85,
    busy: true,
    hint: "Extracting notes and tasks from the transcript.",
  },
  completed: {
    label: "Done",
    percent: 100,
    busy: false,
    hint: "Notes and tasks are ready.",
  },
  failed: {
    label: "Failed",
    percent: 0,
    busy: false,
    hint: "Read the message and retry the same step.",
  },
};

/** Statuses where a pipeline job is running and /status should be polled. */
export const ACTIVE_STATUSES: MeetingStatusValue[] = [
  "chunking",
  "transcribing",
  "generating",
];

export function isActiveStatus(status: MeetingStatusValue | undefined): boolean {
  return status ? ACTIVE_STATUSES.includes(status) : false;
}

export function canTranscribe(status: MeetingStatusValue): boolean {
  return status === "uploaded" || status === "failed";
}

/** Generation is permitted from transcribed, generating, completed or failed. */
export function canGenerate(status: MeetingStatusValue): boolean {
  return (
    status === "transcribed" ||
    status === "completed" ||
    status === "failed" ||
    status === "generating"
  );
}

export function canUploadAudio(status: MeetingStatusValue): boolean {
  return !isActiveStatus(status);
}

export type StatusTone = "neutral" | "default" | "success" | "warning" | "destructive";

export function statusTone(status: MeetingStatusValue): StatusTone {
  if (status === "failed") return "destructive";
  if (status === "completed") return "success";
  if (isActiveStatus(status)) return "default";
  if (status === "transcribed") return "warning";
  return "neutral";
}

/* --------------------------------------------------------------- tasks --- */

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  open: "Open",
  in_progress: "In progress",
  done: "Done",
  cancelled: "Cancelled",
};

export const TASK_TYPE_LABEL: Record<TaskType, string> = {
  task: "Task",
  bug: "Bug",
  feature: "Feature",
  improvement: "Improvement",
  followup: "Follow-up",
};

/**
 * The extractor speaks a slightly different vocabulary from the task board — it
 * returns "question" where the board has "followup" — and either side may gain
 * a value before the other. Unknown values are humanised rather than rendered
 * as "undefined".
 */
export function taskTypeLabel(type: string): string {
  if (type in TASK_TYPE_LABEL) return TASK_TYPE_LABEL[type as TaskType];
  if (type === "question") return "Question";
  return type.charAt(0).toUpperCase() + type.slice(1).replace(/_/g, " ");
}

export const SEVERITY_LABEL: Record<Severity, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  critical: "Critical",
};

export const SEVERITY_CLASS: Record<Severity, string> = {
  low: "bg-sev-low/15 text-sev-low",
  medium: "bg-sev-medium/15 text-sev-medium",
  high: "bg-sev-high/18 text-sev-high",
  critical: "bg-sev-critical/18 text-sev-critical",
};

export const TASK_STATUS_ORDER: TaskStatus[] = [
  "open",
  "in_progress",
  "done",
  "cancelled",
];

/** Status is shown as a named chip, so each state needs its own tone. */
export const STATUS_CLASS: Record<TaskStatus, string> = {
  open: "bg-muted text-muted-foreground",
  in_progress: "bg-primary/12 text-primary",
  done: "bg-success/15 text-success",
  cancelled: "bg-muted text-muted-foreground line-through",
};
