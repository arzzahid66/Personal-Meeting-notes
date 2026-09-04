import { apiFetch } from "./client";
import type { Project, ProjectCreate, ProjectUpdate, UUID } from "./types";

export const projectsApi = {
  list(includeArchived = false) {
    return apiFetch<Project[]>("/projects", {
      query: { include_archived: includeArchived },
    });
  },

  get(id: UUID) {
    return apiFetch<Project>(`/projects/${id}`);
  },

  create(body: ProjectCreate) {
    return apiFetch<Project>("/projects", { method: "POST", body });
  },

  update(id: UUID, body: ProjectUpdate) {
    return apiFetch<Project>(`/projects/${id}`, { method: "PATCH", body });
  },

  /** Distinct assignee names across the project's tasks, for a picker. */
  assignees(id: UUID) {
    return apiFetch<{ assignees: string[] }>(`/projects/${id}/assignees`);
  },

  /** Cascades to every meeting and task in the project. */
  remove(id: UUID) {
    return apiFetch<void>(`/projects/${id}`, { method: "DELETE" });
  },
};
