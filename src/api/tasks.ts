import { apiFetch, apiFetchPaged, type Paged } from "./client";
import type { Task, TaskCreate, TaskListParams, TaskUpdate, UUID } from "./types";

export const tasksApi = {
  list(params: TaskListParams = {}): Promise<Paged<Task>> {
    return apiFetchPaged<Task>("/tasks", {
      query: {
        project_id: params.project_id,
        meeting_id: params.meeting_id,
        status: params.status,
        severity: params.severity,
        task_type: params.task_type,
        assignee: params.assignee,
        due_before: params.due_before,
        overdue: params.overdue ? true : undefined,
        limit: params.limit ?? 100,
        offset: params.offset ?? 0,
      },
    });
  },

  get(id: UUID) {
    return apiFetch<Task>(`/tasks/${id}`);
  },

  create(body: TaskCreate) {
    return apiFetch<Task>("/tasks", { method: "POST", body });
  },

  update(id: UUID, body: TaskUpdate) {
    return apiFetch<Task>(`/tasks/${id}`, { method: "PATCH", body });
  },

  remove(id: UUID) {
    return apiFetch<void>(`/tasks/${id}`, { method: "DELETE" });
  },
};
