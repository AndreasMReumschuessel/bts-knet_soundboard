# Security Policy

## Supported versions

BTS Soundboard is in early development. Security fixes are applied to the
latest `main` branch only.

## Reporting a vulnerability

If you discover a security vulnerability, **please do not open a public
issue**. Instead, email the maintainer at
`andreasmaximilian.reumschuessel@bosch.io` with a description and, if possible,
a proof of concept.

You will receive a response within 72 hours. If the vulnerability is confirmed,
a fix will be released as soon as possible and you will be credited (unless you
prefer to remain anonymous).

## Security considerations

### v1 scope

- **No authentication or authorization** — v1 uses a single shared room. Anyone
  who can reach the server can upload, play, and delete sounds. Do not expose
  the server to the public internet without a reverse proxy + auth layer.
- **CORS is permissive** (`*`) in v1 — appropriate for local/LAN use only.
- **No upload rate limiting** — the server enforces `MAX_UPLOAD_BYTES` (25 MiB)
  and `audio/mpeg` MIME validation (including content sniffing), but does not
  rate-limit requests.

### Hardening recommendations for deployment

- Run the server behind a reverse proxy (nginx, Caddy) with TLS.
- Add authentication (e.g., a shared secret header or token) before exposing to
  untrusted networks.
- Restrict CORS to known origins.
- Bind the server to a specific interface, not `0.0.0.0`, if only LAN access
  is needed.
- Regularly back up the `data/sounds/` directory.

### Path traversal protection

Sound file delivery validates `:id` against `^[A-Za-z0-9_-]{1,64}$` and
performs a resolved-path containment check. Uploads write to a server-
generated opaque id, never a user-supplied filename.
