/**
 * Types for the Meeting Notes API (all routes prefixed /api/mn).
 * Mirrors the live OpenAPI schema at <API_BASE>/openapi.json.
 */

export type UUID = string;
export type OutputLanguage = "en" | "ur";

export type MeetingStatusValue =
  | "draft"
  | "uploaded"
  | "chunking"
  | "transcribing"
  | "transcribed"
  | "generating"
  | "completed"
  | "failed";

export type TaskStatus = "open" | "in_progress" | "done" | "cancelled";
export type TaskType = "task" | "bug" | "feature" | "improvement" | "followup";
export type Severity = "low" | "medium" | "high" | "critical";

export type LlmProvider = "openai" | "gemini";
export type SttProvider = "openai" | "assemblyai";
export type TestableProvider = "openai" | "gemini" | "assemblyai";

/* ---------------------------------------------------------------- auth --- */

export interface User {
  id: UUID;
  name: string;
  email: string;
  is_active: boolean;
  created_at: string;
}

/** GET /auth/me — adds the provider-key flags the onboarding gate reads. */
export interface Me extends User {
  llm_provider: LlmProvider;
  stt_provider: SttProvider;
  default_output_language: OutputLanguage;
  llm_key_configured: boolean;
  stt_key_configured: boolean;
}

export interface SignupResponse {
  message: string;
  user: User;
}

export interface TokenPair {
  access_token: string;
  refresh_token: string;
  token_type: string;
  user: User;
}

export interface AccessTokenResponse {
  access_token: string;
  token_type: string;
}

/* ------------------------------------------------------------ projects --- */

export interface Project {
  id: UUID;
  name: string;
  description: string | null;
  llm_context: string | null;
  system_prompt_override: string | null;
  glossary: string | null;
  default_output_language: OutputLanguage | null;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProjectCreate {
  name: string;
  description?: string | null;
  llm_context?: string | null;
  system_prompt_override?: string | null;
  glossary?: string | null;
  default_output_language?: OutputLanguage | null;
}

export type ProjectUpdate = Partial<ProjectCreate> & { is_archived?: boolean };

/* ------------------------------------------------------------ meetings --- */

export interface Meeting {
  id: UUID;
  project_id: UUID;
  title: string;
  meeting_date: string; // YYYY-MM-DD
  manual_notes: string | null;
  output_language: OutputLanguage | null;
  status: MeetingStatusValue;
  error_message: string | null;
  audio_bytes: number | null;
  duration_seconds: number | null;
  stt_provider: string | null;
  llm_provider: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export interface MeetingDetail extends Meeting {
  transcript: Transcript | null;
  notes: Note[];
  tasks: Task[];
}

export interface MeetingCreate {
  project_id: UUID;
  title: string;
  meeting_date: string;
  manual_notes?: string | null;
  output_language?: OutputLanguage | null;
}

export interface MeetingUpdate {
  title?: string;
  meeting_date?: string;
  manual_notes?: string | null;
  output_language?: OutputLanguage | null;
}

export interface Transcript {
  id: UUID;
  provider: string;
  model: string | null;
  language: string | null;
  text: string;
  has_speaker_labels: boolean;
  word_count: number | null;
  chunk_count: number;
  created_at: string;
}

export interface Note {
  id: UUID;
  summary: string | null;
  key_points: string[] | null;
  decisions: string[] | null;
  llm_provider: string;
  model: string | null;
  output_language: OutputLanguage;
  created_at: string;
}

/** GET /meetings/{id}/status — one shape regardless of which STT provider ran. */
export interface MeetingProgress {
  id: UUID;
  status: MeetingStatusValue;
  stage: string;
  chunks_done: number;
  chunks_total: number;
  percent: number;
  error_message: string | null;
  eta_seconds: number | null;
  eta_text: string | null;
}

export interface MeetingListParams {
  project_id?: UUID;
  limit?: number; // 1-200, default 50
  offset?: number;
}

/* --------------------------------------------------------------- audio --- */

export interface PresignRequest {
  filename: string;
  content_type?: string | null;
}

export interface PresignResponse {
  upload_url: string;
  key: string;
  expires_in: number;
  content_type: string;
  max_duration_min: number;
}

export interface AudioUrlResponse {
  url: string;
  expires_in: number;
}

/* --------------------------------------------------------------- tasks --- */

export interface Task {
  id: UUID;
  meeting_id: UUID | null;
  project_id: UUID;
  title: string;
  description: string | null;
  task_type: TaskType;
  severity: Severity;
  deadline: string | null;
  status: TaskStatus;
  assignee: string | null;
  source_quote: string | null; // null on manually created tasks
  confidence: number | null;
  order_index: number;
  created_at: string;
  updated_at: string;
}

export interface TaskCreate {
  project_id: UUID;
  meeting_id?: UUID | null;
  title: string;
  description?: string | null;
  task_type?: TaskType;
  severity?: Severity;
  deadline?: string | null;
  assignee?: string | null;
}

export interface TaskUpdate {
  title?: string;
  description?: string | null;
  task_type?: TaskType;
  severity?: Severity;
  deadline?: string | null;
  status?: TaskStatus;
  assignee?: string | null;
}

export interface TaskListParams {
  project_id?: UUID;
  meeting_id?: UUID;
  status?: TaskStatus;
  severity?: Severity;
  task_type?: TaskType;
  due_before?: string;
  overdue?: boolean;
  /** Matched case- and whitespace-insensitively; "unassigned" for nobody. */
  assignee?: string;
  limit?: number; // 1-500, default 100
  offset?: number;
}

/* ----------------------------------------------- live transcription --- */

/** GET /deepgram-token — short-lived, never cached or reused across sockets. */
export interface DeepgramToken {
  access_token: string;
  /** Seconds. 300 at time of writing, so a long meeting outlives it. */
  expires_in: number;
}

/**
 * The extractor's own type vocabulary. It overlaps the task board's but is not
 * identical — it has "question" where the board has "followup" — so it is kept
 * separate rather than assumed equal.
 */
export type ExtractedTaskType =
  | "bug"
  | "task"
  | "feature"
  | "improvement"
  | "question";

export interface ExtractedTask {
  /** Null when persist was false: a preview task was never written. */
  id: UUID | null;
  title: string;
  short_description: string;
  description: string;
  type: ExtractedTaskType;
  severity: Severity;
  assignee: string | null;
  /** Verbatim from the transcript, never translated. The evidence. */
  source_quote: string | null;
}

export interface ExtractRequest {
  transcript: string;
  /** False previews without writing anything. */
  persist?: boolean;
  /** True wipes this meeting's tasks first — only for the final sweep. */
  replace_existing?: boolean;
  output_language?: OutputLanguage | null;
}

export interface ExtractResponse {
  meeting_id: UUID;
  persisted: boolean;
  count: number;
  tasks: ExtractedTask[];
}

/* ------------------------------------------------------------ settings --- */

export interface Settings {
  llm_provider: LlmProvider;
  stt_provider: SttProvider;
  llm_model: string | null;
  transcription_model: string | null;
  default_output_language: OutputLanguage;
  system_prompt_override: string | null;
  openai_key_last4: string | null;
  gemini_key_last4: string | null;
  assemblyai_key_last4: string | null;
  serp_key_last4: string | null;
  llm_key_configured: boolean;
  stt_key_configured: boolean;
  effective_system_prompt: string;
}

/** Keys are write-only: send one to store it, omit it to leave it unchanged. */
export interface SettingsUpdate {
  llm_provider?: LlmProvider;
  stt_provider?: SttProvider;
  llm_model?: string | null;
  transcription_model?: string | null;
  default_output_language?: OutputLanguage;
  system_prompt_override?: string | null;
  openai_api_key?: string;
  gemini_api_key?: string;
  assemblyai_api_key?: string;
  serp_api_key?: string;
}

export interface TestKeyResult {
  provider: string;
  ok: boolean;
  detail: string;
}

export interface McpToken {
  id: UUID;
  name: string;
  prefix: string;
  last_used_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

export interface McpTokenCreated extends McpToken {
  token: string;
  warning: string;
}
