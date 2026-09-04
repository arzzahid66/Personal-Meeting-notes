# Personal Meeting Notes — PWA

Installable web app for the Meeting Notes API. Record a meeting on your phone,
upload the audio straight to Cloudflare R2, transcribe it, and generate
structured tasks with the verbatim transcript line each one came from.

Built against `https://attendance-be.xeventechnologies.com`, all routes under
`/api/mn`. Interactive spec: [`/docs`](https://attendance-be.xeventechnologies.com/docs).

## Stack

Vite · React 19 · TypeScript · Tailwind v4 · Radix primitives · TanStack Query ·
`vite-plugin-pwa` (Workbox) · IndexedDB via `idb`.

## Getting started

```bash
npm install
cp .env.example .env.local     # already present; edit if the API moves
npm run dev                    # http://localhost:5173
```

| Script | What it does |
| --- | --- |
| `npm run dev` | Dev server on port 5173 |
| `npm run build` | Typecheck, bundle, and emit the service worker into `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run typecheck` | Types only |
| `npm run icons` | Regenerate `public/` icons from `scripts/generate-icons.mjs` |

### Environment

| Variable | Default | Notes |
| --- | --- | --- |
| `VITE_API_BASE` | `https://attendance-be.xeventechnologies.com` | No trailing slash, no `/api/mn` suffix |

## Deploying to Vercel

Import the repo; the framework preset is detected as Vite. Build command
`npm run build`, output directory `dist`. [`vercel.json`](vercel.json) already
handles the SPA rewrite and the cache headers (`sw.js` must never be cached).

Set `VITE_API_BASE` as a Vercel environment variable if it differs from the
default.

**After the first deploy, add the production origin to both CORS layers.** They
are separate systems and both must allow the origin, or uploads fail in
production while working perfectly in development:

1. **API CORS** — add `https://<your-app>.vercel.app` to `MN_CORS_ORIGINS` in
   the server's `.env`.
2. **R2 bucket CORS** — Cloudflare dashboard → R2 → bucket → Settings → CORS
   Policy:

```json
[{
  "AllowedOrigins": [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "https://<your-app>.vercel.app"
  ],
  "AllowedMethods": ["GET", "PUT", "HEAD"],
  "AllowedHeaders": ["*"],
  "ExposeHeaders": ["ETag"],
  "MaxAgeSeconds": 3600
}]
```

`PUT` is the one that gets left out. Without it, `GET` preflights still succeed
so the policy looks correct, while every upload is blocked before it leaves the
browser. Verify from a terminal against a presigned URL:

```bash
curl -i -X OPTIONS "<presigned_url>" \
  -H "Origin: https://<your-app>.vercel.app" \
  -H "Access-Control-Request-Method: PUT"
# expect: 204 + Access-Control-Allow-Methods: GET, PUT, HEAD
```

## How the app is put together

```
src/
  api/        typed client for all 23 /api/mn endpoints
    client.ts   fetch wrapper, single-flight token refresh, error normalisation
    upload.ts   presign → PUT to R2 → complete, with the multipart fallback
  db/idb.ts   recording chunks, unsent-recording recovery, refresh token
  hooks/      auth, queries, recorder, wake lock, status polling, upload
  routes/     the nine screens
  components/ shell, pipeline panel, task card, UI primitives
```

### Three behaviours worth knowing

**Generation is a separate step from transcription.** A transcribed meeting has
a transcript and zero tasks until Generate runs. The meeting screen says so
explicitly and makes Generate the dominant action rather than presenting
`transcribed` as a finished state.

**Audio goes straight to Cloudflare.** `POST /audio/presign` → raw `PUT` to R2
(XHR, for upload progress) → `POST /audio/complete`. The API never handles the
bytes. `POST /meetings/{id}/audio` is only used as a fallback when the server
reports object storage is disabled (501), or when a user explicitly retries
through the server after a CORS failure — that path writes to the server's local
disk and never reaches R2.

**Recordings survive the tab.** MediaRecorder emits a chunk every 10 seconds and
each one is written to IndexedDB immediately, a screen wake lock is held and
re-acquired on every `visibilitychange`, and anything left unsent is offered
back on next launch. iOS Safari suspends long recordings otherwise.

### Language

Meetings are code-mixed Urdu and English, so every field that can hold
transcript-derived text — titles, summaries, key points, decisions, source
quotes, the transcript itself — is rendered with `dir="auto"` per element rather
than a document-level direction.

## Pre-integration checklist

- [x] `GET /api/health` returns `{"status":"ok"}`
- [x] `/docs` lists the `/api/mn` routes
- [x] API CORS permits `http://localhost:5173` (verified: login returns a real
      401 from the browser, not a CORS failure)
- [ ] R2 bucket CORS allows your origin with `PUT`
- [ ] A full presign → PUT → complete cycle returns `status: "uploaded"`
- [ ] The object appears in the bucket under `meetings/{meeting_id}/`
- [ ] `ffmpeg`/`ffprobe` on the server's PATH (`duration_seconds` is non-null)
- [ ] Transcribe → poll → generate completes on a short test recording
