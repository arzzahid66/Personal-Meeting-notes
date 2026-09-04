import { apiFetch, apiFetchPaged, type Paged } from "./client";
import type {
  AudioUrlResponse,
  Meeting,
  MeetingCreate,
  MeetingDetail,
  MeetingListParams,
  MeetingProgress,
  MeetingUpdate,
  OutputLanguage,
  UUID,
} from "./types";

export const meetingsApi = {
  list(params: MeetingListParams = {}): Promise<Paged<Meeting>> {
    return apiFetchPaged<Meeting>("/meetings", {
      query: {
        project_id: params.project_id,
        limit: params.limit ?? 50,
        offset: params.offset ?? 0,
      },
    });
  },

  get(id: UUID) {
    return apiFetch<MeetingDetail>(`/meetings/${id}`);
  },

  create(body: MeetingCreate) {
    return apiFetch<Meeting>("/meetings", { method: "POST", body });
  },

  update(id: UUID, body: MeetingUpdate) {
    return apiFetch<Meeting>(`/meetings/${id}`, { method: "PATCH", body });
  },

  remove(id: UUID) {
    return apiFetch<void>(`/meetings/${id}`, { method: "DELETE" });
  },

  status(id: UUID) {
    return apiFetch<MeetingProgress>(`/meetings/${id}/status`);
  },

  /** 202 — begin polling status(). Re-running only retries the failed chunks. */
  transcribe(id: UUID) {
    return apiFetch<Meeting>(`/meetings/${id}/transcribe`, { method: "POST" });
  },

  /** 202 — the separate step that actually produces notes and tasks. */
  generate(id: UUID, outputLanguage?: OutputLanguage) {
    return apiFetch<Meeting>(`/meetings/${id}/generate`, {
      method: "POST",
      body: outputLanguage ? { output_language: outputLanguage } : {},
    });
  },

  /** Paste a transcript and skip audio entirely. Moves straight to transcribed. */
  putTranscript(id: UUID, text: string, language?: string) {
    return apiFetch<Meeting>(`/meetings/${id}/transcript`, {
      method: "POST",
      body: { text, language: language ?? null },
    });
  },

  /**
   * Drops the transcript and its chunk rows so the meeting can be transcribed
   * again from scratch. The server rewinds status to `uploaded` while the audio
   * is still on hand, otherwise to `draft`.
   */
  deleteTranscript(id: UUID) {
    return apiFetch<void>(`/meetings/${id}/transcript`, { method: "DELETE" });
  },

  /** Removes one generated note. Tasks are shared across generations and stay. */
  deleteNote(id: UUID, noteId: UUID) {
    return apiFetch<void>(`/meetings/${id}/notes/${noteId}`, { method: "DELETE" });
  },

  /** Clears every note for a clean re-generate. Idempotent, and leaves tasks. */
  deleteAllNotes(id: UUID) {
    return apiFetch<void>(`/meetings/${id}/notes`, { method: "DELETE" });
  },

  /** 404 once the original audio has been deleted post-transcription. */
  audioUrl(id: UUID) {
    return apiFetch<AudioUrlResponse>(`/meetings/${id}/audio/url`);
  },
};
