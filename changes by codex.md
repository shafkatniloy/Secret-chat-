# Changes by Codex

## 2026-09-06 — Authenticate chat history and image uploads

### Changes

- Added `backend/auth.js` with shared credential validation and HTTP Basic authentication middleware.
- Protected `GET /api/messages` and `POST /api/upload`. Requests without valid credentials receive HTTP 401.
- Placed upload authentication before file processing so unauthorized requests cannot upload to Cloudinary.
- Updated Socket.IO authentication to use the shared validator, which rejects inherited object properties and non-string credentials.
- Updated `frontend/index.html` to send an Authorization header when uploading images, using the current socket credentials in memory with UTF-8 encoding support.
- Prevented image uploads when the socket is disconnected.
- Added `backend/auth.test.js` and an `npm test` script in `backend/package.json`.

### Verification

- `npm test --prefix backend` passed, covering missing, malformed, incorrect, and valid credentials, UTF-8 credentials, password colons, and invalid socket credential types.
- Backend JavaScript and frontend inline JavaScript syntax checks passed.
- Live MongoDB and Cloudinary integration was not tested.

### Deployment

- Redeploy both the backend and frontend together to activate the changes.
- Production must use HTTPS: HTTP Basic authentication encodes credentials but does not encrypt them; HTTPS protects them in transit.

### Scope

This update protects the two HTTP routes. It is not a complete security audit or a claim that all security issues have been resolved.

This log contains no passwords, tokens, connection strings, environment variable values, or private chat data. Keep future entries free of those values as well.
