import { openDB, type DBSchema, type IDBPDatabase } from "idb";

/**
 * Local durable storage.
 *
 * Two jobs, both from §10.2/§10.3 of the integration guide:
 *   1. Recording chunks are written here as MediaRecorder emits them, so a
 *      backgrounded tab or an iOS Safari suspend loses at most one chunk
 *      instead of a 90-minute meeting.
 *   2. The refresh token lives here rather than in localStorage.
 */

export type SessionState =
  | "recording"
  | "ready"
  | "uploading"
  | "uploaded"
  | "failed";

export interface RecordingSession {
  id: string;
  meetingId: string | null;
  meetingTitle: string;
  mimeType: string;
  createdAt: number;
  updatedAt: number;
  durationMs: number;
  bytes: number;
  chunkCount: number;
  state: SessionState;
  lastError: string | null;
}

interface ChunkRow {
  key: string; // `${sessionId}:${seq padded}`
  sessionId: string;
  seq: number;
  blob: Blob;
}

interface MnDB extends DBSchema {
  kv: { key: string; value: unknown };
  sessions: {
    key: string;
    value: RecordingSession;
    indexes: { by_state: SessionState; by_updated: number };
  };
  chunks: {
    key: string;
    value: ChunkRow;
    indexes: { by_session: string };
  };
}

let dbPromise: Promise<IDBPDatabase<MnDB>> | null = null;

function db() {
  dbPromise ??= openDB<MnDB>("meeting-notes", 1, {
    upgrade(d) {
      d.createObjectStore("kv");
      const sessions = d.createObjectStore("sessions", { keyPath: "id" });
      sessions.createIndex("by_state", "state");
      sessions.createIndex("by_updated", "updatedAt");
      const chunks = d.createObjectStore("chunks", { keyPath: "key" });
      chunks.createIndex("by_session", "sessionId");
    },
  });
  return dbPromise;
}

/* ------------------------------------------------------------------ kv --- */

export async function kvGet<T>(key: string): Promise<T | undefined> {
  return (await db()).get("kv", key) as Promise<T | undefined>;
}

export async function kvSet(key: string, value: unknown): Promise<void> {
  await (await db()).put("kv", value, key);
}

export async function kvDelete(key: string): Promise<void> {
  await (await db()).delete("kv", key);
}

/* ------------------------------------------------------------ sessions --- */

export async function createSession(
  init: Pick<RecordingSession, "id" | "meetingId" | "meetingTitle" | "mimeType">,
): Promise<RecordingSession> {
  const now = Date.now();
  const session: RecordingSession = {
    ...init,
    createdAt: now,
    updatedAt: now,
    durationMs: 0,
    bytes: 0,
    chunkCount: 0,
    state: "recording",
    lastError: null,
  };
  await (await db()).put("sessions", session);
  return session;
}

export async function getSession(id: string) {
  return (await db()).get("sessions", id);
}

export async function patchSession(
  id: string,
  patch: Partial<RecordingSession>,
): Promise<RecordingSession | undefined> {
  const d = await db();
  const current = await d.get("sessions", id);
  if (!current) return undefined;
  const next = { ...current, ...patch, updatedAt: Date.now() };
  await d.put("sessions", next);
  return next;
}

/** Sessions that still hold audio nobody has successfully uploaded. */
export async function listUnfinishedSessions(): Promise<RecordingSession[]> {
  const all = await (await db()).getAll("sessions");
  return all
    .filter((s) => s.state !== "uploaded" && s.chunkCount > 0)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function deleteSession(id: string): Promise<void> {
  const d = await db();
  const tx = d.transaction(["sessions", "chunks"], "readwrite");
  const keys = await tx.objectStore("chunks").index("by_session").getAllKeys(id);
  await Promise.all(keys.map((k) => tx.objectStore("chunks").delete(k)));
  await tx.objectStore("sessions").delete(id);
  await tx.done;
}

/* -------------------------------------------------------------- chunks --- */

export async function appendChunk(
  sessionId: string,
  seq: number,
  blob: Blob,
): Promise<void> {
  const d = await db();
  const tx = d.transaction(["chunks", "sessions"], "readwrite");
  await tx
    .objectStore("chunks")
    .put({ key: chunkKey(sessionId, seq), sessionId, seq, blob });
  const session = await tx.objectStore("sessions").get(sessionId);
  if (session) {
    await tx.objectStore("sessions").put({
      ...session,
      chunkCount: Math.max(session.chunkCount, seq + 1),
      bytes: session.bytes + blob.size,
      updatedAt: Date.now(),
    });
  }
  await tx.done;
}

/** Reassemble a session's chunks, in order, into one Blob for upload. */
export async function assembleSession(
  sessionId: string,
  mimeType: string,
): Promise<Blob> {
  const rows = await (await db())
    .getAllFromIndex("chunks", "by_session", sessionId);
  rows.sort((a, b) => a.seq - b.seq);
  return new Blob(
    rows.map((r) => r.blob),
    { type: mimeType },
  );
}

function chunkKey(sessionId: string, seq: number) {
  return `${sessionId}:${String(seq).padStart(6, "0")}`;
}
