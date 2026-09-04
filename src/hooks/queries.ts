import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryOptions,
} from "@tanstack/react-query";
import { meetingsApi } from "@/api/meetings";
import { projectsApi } from "@/api/projects";
import { settingsApi } from "@/api/settings";
import { tasksApi } from "@/api/tasks";
import type {
  Meeting,
  MeetingDetail,
  MeetingListParams,
  Project,
  ProjectCreate,
  ProjectUpdate,
  Settings,
  SettingsUpdate,
  Task,
  TaskCreate,
  TaskListParams,
  TaskUpdate,
  UUID,
} from "@/api/types";

export const qk = {
  projects: (includeArchived: boolean) => ["projects", { includeArchived }] as const,
  project: (id: UUID) => ["project", id] as const,
  meetings: (params: MeetingListParams) => ["meetings", params] as const,
  meeting: (id: UUID) => ["meeting", id] as const,
  meetingStatus: (id: UUID) => ["meeting-status", id] as const,
  tasks: (params: TaskListParams) => ["tasks", params] as const,
  settings: () => ["settings"] as const,
  tokens: () => ["mcp-tokens"] as const,
};

/* ------------------------------------------------------------ projects --- */

export function useProjects(includeArchived = false) {
  return useQuery({
    queryKey: qk.projects(includeArchived),
    queryFn: () => projectsApi.list(includeArchived),
  });
}

export function useProject(id: UUID | undefined) {
  return useQuery({
    queryKey: qk.project(id ?? ""),
    queryFn: () => projectsApi.get(id as UUID),
    enabled: Boolean(id),
  });
}

export function useCreateProject() {
  const qc = useQueryClient();
  return useMutation<Project, Error, ProjectCreate>({
    mutationFn: (body) => projectsApi.create(body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["projects"] });
    },
  });
}

export function useUpdateProject(id: UUID) {
  const qc = useQueryClient();
  return useMutation<Project, Error, ProjectUpdate>({
    mutationFn: (body) => projectsApi.update(id, body),
    onSuccess: (project) => {
      qc.setQueryData(qk.project(id), project);
      void qc.invalidateQueries({ queryKey: ["projects"] });
    },
  });
}

export function useDeleteProject() {
  const qc = useQueryClient();
  return useMutation<void, Error, UUID>({
    mutationFn: (id) => projectsApi.remove(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["projects"] });
      void qc.invalidateQueries({ queryKey: ["meetings"] });
      void qc.invalidateQueries({ queryKey: ["tasks"] });
    },
  });
}

/* ------------------------------------------------------------ meetings --- */

export function useMeetings(params: MeetingListParams = {}) {
  return useQuery({
    queryKey: qk.meetings(params),
    queryFn: () => meetingsApi.list(params),
  });
}

export function useMeeting(
  id: UUID | undefined,
  options?: Partial<UseQueryOptions<MeetingDetail>>,
) {
  return useQuery({
    queryKey: qk.meeting(id ?? ""),
    queryFn: () => meetingsApi.get(id as UUID),
    enabled: Boolean(id),
    ...options,
  });
}

export function useCreateMeeting() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: meetingsApi.create,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["meetings"] });
    },
  });
}

export function useUpdateMeeting(id: UUID) {
  const qc = useQueryClient();
  return useMutation<Meeting, Error, Parameters<typeof meetingsApi.update>[1]>({
    mutationFn: (body) => meetingsApi.update(id, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.meeting(id) });
      void qc.invalidateQueries({ queryKey: ["meetings"] });
    },
  });
}

export function useDeleteMeeting() {
  const qc = useQueryClient();
  return useMutation<void, Error, UUID>({
    mutationFn: (id) => meetingsApi.remove(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["meetings"] });
      void qc.invalidateQueries({ queryKey: ["tasks"] });
    },
  });
}

/* --------------------------------------------------------------- tasks --- */

export function useTasks(params: TaskListParams = {}) {
  return useQuery({
    queryKey: qk.tasks(params),
    queryFn: () => tasksApi.list(params),
  });
}

export function useCreateTask() {
  const qc = useQueryClient();
  return useMutation<Task, Error, TaskCreate>({
    mutationFn: (body) => tasksApi.create(body),
    onSuccess: (task) => {
      void qc.invalidateQueries({ queryKey: ["tasks"] });
      void qc.invalidateQueries({ queryKey: qk.meeting(task.meeting_id ?? "") });
    },
  });
}

export function useUpdateTask() {
  const qc = useQueryClient();
  return useMutation<Task, Error, { id: UUID; body: TaskUpdate }>({
    mutationFn: ({ id, body }) => tasksApi.update(id, body),
    onSuccess: (task) => {
      void qc.invalidateQueries({ queryKey: ["tasks"] });
      if (task.meeting_id) {
        void qc.invalidateQueries({ queryKey: qk.meeting(task.meeting_id) });
      }
    },
  });
}

export function useDeleteTask() {
  const qc = useQueryClient();
  return useMutation<void, Error, { id: UUID; meetingId?: UUID | null }>({
    mutationFn: ({ id }) => tasksApi.remove(id),
    onSuccess: (_data, { meetingId }) => {
      void qc.invalidateQueries({ queryKey: ["tasks"] });
      if (meetingId) void qc.invalidateQueries({ queryKey: qk.meeting(meetingId) });
    },
  });
}

/* ------------------------------------------------------------ settings --- */

export function useSettings() {
  return useQuery({ queryKey: qk.settings(), queryFn: settingsApi.get });
}

export function useUpdateSettings() {
  const qc = useQueryClient();
  return useMutation<Settings, Error, SettingsUpdate>({
    mutationFn: (body) => settingsApi.update(body),
    onSuccess: (settings) => {
      qc.setQueryData(qk.settings(), settings);
    },
  });
}

export function useMcpTokens() {
  return useQuery({ queryKey: qk.tokens(), queryFn: settingsApi.listTokens });
}
