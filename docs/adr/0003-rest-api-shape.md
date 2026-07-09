# ADR-0003 — REST API shape

- **Date:** 2026-07-09
- **Status:** Accepted
- **Owner:** Architect
- **Related:** ADR-0001 (stack), ADR-0004 (caching)

## Context

The backend serves sound files to clients and lets users upload new ones. The
WS channel (ADR-0002) carries only metadata (`sound_added`, `sound_list`,
`sound_removed`) and `play` events — **never audio bytes**. REST is the
sole transport for file upload, file download, catalog listing, and health.

The REST surface must be small, JSON-typed, and validated. File upload is
`audio/mpeg` only (v1). File delivery must be **path-traversal safe** because
`soundId` becomes part of a filesystem path on the server.

## Options considered

### Upload transport
- **`multipart/form-data`** (chosen) vs. raw body `POST /sounds/:id/file` vs.
  base64 JSON.
  - multipart is the standard for binary upload, streams naturally, and lets
    the client send the suggested `name` as a form field alongside the file.
    Raw-body + separate metadata call is two round-trips. Base64 JSON bloats
    ~33% and forces the whole file into memory. Chosen: multipart.

### File delivery
- **`GET /sounds/:id/file` → binary stream, `Content-Type: audio/mpeg`**
  (chosen) vs. base64 JSON vs. signed URLs / static dir.
  - A direct binary stream is simplest for the client's `fetch()` + Web Audio
    `decodeAudioData()` path and supports HTTP range requests for partial
    reads if needed later. Chosen.

### IDs
- **Server-generated opaque IDs** (chosen). The server assigns `id` on upload
  (URL-safe, no extension, not derived from the filename). Clients never
  choose IDs. This is the foundation of path-traversal safety: the server
  never trusts a client-supplied filename for storage.

### Path-traversal safety
- Reject any `id`/`name` containing path separators or `..` at validation time
  (Zod regex), **and** construct the on-disk path by joining a fixed root with
  the validated id, **and** resolve+verify the result stays inside the root.
  Defense in depth: validate, join, re-check containment.

## Decision

Base URL: `http://<host>:<port>` (default port `8080`). All request/response
bodies are JSON except `GET /sounds/:id/file` (binary) and `POST /sounds`
(multipart). All JSON bodies are validated with Zod schemas from
`packages/shared/src/rest.ts`.

### Endpoints

| Method | Path | Request | Response (JSON) | Notes |
|---|---|---|---|---|
| `GET` | `/health` | — | `HealthResponse { status, version?, clients? }` | `clients` = connected WS count. No auth. |
| `GET` | `/sounds` | — | `SoundListResponse { sounds: SoundMetadata[] }` | Full catalog metadata. |
| `GET` | `/sounds/:id` | — | `SoundResponse` (= `SoundMetadata`) | 404 if unknown. |
| `GET` | `/sounds/:id/file` | — | binary, `Content-Type: audio/mpeg`, `Content-Length` | 404 if unknown. Path-traversal-safe. |
| `POST` | `/sounds` | `multipart/form-data`: field `name` (string), field `file` (audio/mpeg, ≤ `MAX_UPLOAD_BYTES`) | `UploadResponse { sound: SoundMetadata }` | 415 if not `audio/mpeg`; 413 if too large. |
| `DELETE` | `/sounds/:id` | — | `DeleteSoundResponse { soundId }` | 404 if unknown. |

### `SoundMetadata` (defined in `packages/shared/src/sound.ts`)
```
{
  id: string;            // server-generated, URL-safe, no extension
  name: string;          // display name (1..200 chars)
  durationMs: number;    // non-negative int, computed by server on upload
  sizeBytes: number;      // non-negative int
  mime: "audio/mpeg";    // SUPPORTED_MIME (v1)
  uploadedAt: string;    // ISO 8601 with offset
  uploadedBy?: string;   // optional, v1 unused (no auth)
}
```

### Side effects
- On successful `POST /sounds`: the server stores the file, computes
  `durationMs`/`sizeBytes`, persists metadata, **and broadcasts
  `sound_added` (S→C)** to all connected WS clients (ADR-0002).
- On successful `DELETE /sounds/:id`: the server deletes the file + metadata
  **and broadcasts `sound_removed` (S→C)** to all connected WS clients.

### Validation & safety rules (backend-enforced)
- `id` path param: `^[A-Za-z0-9_-]{1,64}$` (Zod). Rejects `/`, `\`, `..`, etc.
- On-disk path = `path.join(BTS_SOUNDS_DIR, id + ".mp3")`; after join, verify
  `resolvedPath` starts with `path.resolve(BTS_SOUNDS_DIR)` — reject otherwise.
- `name` form field: trimmed, length 1..200.
- `file` part: `Content-Type` must be `audio/mpeg` (415 otherwise); size ≤
  `MAX_UPLOAD_BYTES` (413 otherwise). The server MAY sniff the first bytes to
  confirm an MP3 frame header.
- The server never echoes back the raw uploaded filename as the stored `id`.

## Consequences

- ✅ WS stays metadata-only; REST is the sole binary transport. Clean
  separation, small WS frames.
- ✅ Server-generated opaque IDs + regex validation + containment re-check =
  path-traversal safe by construction.
- ✅ Upload/delete fan out via `sound_added`/`sound_removed` so all clients
  learn about catalog changes without polling.
- ⚠️ v1 is single-MIME (`audio/mpeg`) and 25 MiB max. Extending the MIME list
  means editing `SUPPORTED_MIME_TYPES` in `packages/shared` and the server's
  accept check — single source of truth.
- ⚠️ No auth/rate-limiting on REST in v1; the backend MAY add naive upload
  rate-limiting. Documented v2 follow-up.
