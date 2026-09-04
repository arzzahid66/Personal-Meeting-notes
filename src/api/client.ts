import { kvDelete, kvGet, kvSet } from "@/db/idb";
import type { AccessTokenResponse } from "./types";

export const API_BASE = (
  import.meta.env.VITE_API_BASE ?? "https://attendance-be.xeventechnologies.com"
).replace(/\/+$/, "");

const MN_PREFIX = "/api/mn";
const REFRESH_KEY = "refresh_token";

/**
 * The access token is deliberately memory-only; only the refresh token is
 * persisted (IndexedDB, not localStorage). Guide §10.3.
 */
let accessToken: string | null = null;
let onUnauthenticated: (() => void) | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function getAccessToken() {
  return accessToken;
}

export function getRefreshToken() {
  return kvGet<string>(REFRESH_KEY);
}

export async function setRefreshToken(token: string | null) {
  if (token) await kvSet(REFRESH_KEY, token);
  else await kvDelete(REFRESH_KEY);
}

/** Registered by the auth provider so a dead session can bounce to /login. */
export function setUnauthenticatedHandler(fn: (() => void) | null) {
  onUnauthenticated = fn;
}

/* --------------------------------------------------------------- errors --- */

type ValidationDetail = { loc: (string | number)[]; msg: string; type: string };

export class ApiError extends Error {
  readonly status: number;
  readonly body: unknown;
  /** Populated for 422 so a form can map errors onto its fields. */
  readonly fieldErrors: Record<string, string>;

  constructor(status: number, body: unknown) {
    super(errorMessage(body));
    this.name = "ApiError";
    this.status = status;
    this.body = body;
    this.fieldErrors = fieldErrors(body);
  }
}

/**
 * FastAPI returns two different bodies: a plain string `detail` for application
 * errors, and an array of field errors for 422. Guide §8.1.
 */
export function errorMessage(body: unknown): string {
  const detail = (body as { detail?: unknown } | null | undefined)?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return (detail as ValidationDetail[])
      .map((e) => `${e.loc?.at(-1) ?? "field"}: ${e.msg}`)
      .join(", ");
  }
  return "Something went wrong";
}

function fieldErrors(body: unknown): Record<string, string> {
  const detail = (body as { detail?: unknown } | null | undefined)?.detail;
  if (!Array.isArray(detail)) return {};
  const out: Record<string, string> = {};
  for (const e of detail as ValidationDetail[]) {
    const field = String(e.loc?.at(-1) ?? "");
    if (field && !out[field]) out[field] = e.msg;
  }
  return out;
}

/* -------------------------------------------------------------- refresh --- */

// Concurrent 401s must produce exactly one refresh call. Guide §3.3.
let refreshing: Promise<boolean> | null = null;

async function doRefresh(): Promise<boolean> {
  const token = await getRefreshToken();
  if (!token) return false;
  try {
    const res = await fetch(`${API_BASE}${MN_PREFIX}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: token }),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as AccessTokenResponse;
    accessToken = data.access_token;
    return true;
  } catch {
    return false;
  }
}

async function forceLogout() {
  accessToken = null;
  await setRefreshToken(null);
  onUnauthenticated?.();
}

/* ----------------------------------------------------------------- core --- */

export interface RequestOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
  /** Skip the Authorization header (signup / login / refresh). */
  anonymous?: boolean;
  query?: Record<string, string | number | boolean | undefined | null>;
}

function buildUrl(path: string, query?: RequestOptions["query"]) {
  const url = new URL(`${API_BASE}${MN_PREFIX}${path}`);
  for (const [k, v] of Object.entries(query ?? {})) {
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
  }
  return url.toString();
}

async function rawFetch(path: string, opts: RequestOptions): Promise<Response> {
  const { body, anonymous, query, headers, ...rest } = opts;
  const isForm = body instanceof FormData;

  return fetch(buildUrl(path, query), {
    ...rest,
    // The browser must set its own multipart boundary — never set Content-Type
    // on FormData, it is the classic silent 422 on the audio endpoint.
    headers: {
      ...(isForm || body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(anonymous || !accessToken ? {} : { Authorization: `Bearer ${accessToken}` }),
      ...(headers as Record<string, string> | undefined),
    },
    body: isForm ? body : body === undefined ? undefined : JSON.stringify(body),
  });
}

/** Sends the request, refreshing the access token at most once on a 401. */
async function request(
  path: string,
  opts: RequestOptions,
  retry = true,
): Promise<Response> {
  let res: Response;
  try {
    res = await rawFetch(path, opts);
  } catch {
    throw new ApiError(0, {
      detail:
        "Could not reach the server. Check your connection and try again.",
    });
  }

  if (res.status === 401 && retry && !opts.anonymous) {
    refreshing ??= doRefresh().finally(() => {
      refreshing = null;
    });
    if (await refreshing) return request(path, opts, false);
    await forceLogout();
  }

  if (!res.ok) throw new ApiError(res.status, await safeJson(res));
  return res;
}

/** Fetch a /api/mn route and parse its JSON body. */
export async function apiFetch<T>(
  path: string,
  opts: RequestOptions = {},
): Promise<T> {
  const res = await request(path, opts);
  if (res.status === 204) return undefined as T;
  return (await safeJson(res)) as T;
}

export interface Paged<T> {
  items: T[];
  /**
   * From X-Total-Count. Null when the header is unreadable — which, for a
   * cross-origin request, also happens when the server sends it but does not
   * list it in Access-Control-Expose-Headers. Callers fall back to paging by
   * whether a full page came back.
   */
  total: number | null;
}

/** A list route, plus the total the server reports for the whole collection. */
export async function apiFetchPaged<T>(
  path: string,
  opts: RequestOptions = {},
): Promise<Paged<T>> {
  const res = await request(path, opts);
  const header = res.headers.get("X-Total-Count");
  const total = header === null ? null : Number.parseInt(header, 10);
  return {
    items: ((await safeJson(res)) ?? []) as T[],
    total: total === null || Number.isNaN(total) ? null : total,
  };
}

async function safeJson(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { detail: text };
  }
}
