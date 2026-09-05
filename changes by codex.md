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

## 2026-09-06 — Support multiple frontend origins

- Updated `backend/server.js` to accept a comma-separated list in `FRONTEND_URL` for both Express and Socket.IO CORS.
- Preserved support for a single URL and the localhost default. Whitespace, trailing slashes, and empty list entries are removed.
- Updated `ENV_VARIABLES.md` with multiple-origin configuration and corrected the production backend URL description.
- Verified that both configured origins receive CORS access, an unrelated origin does not, and HTTP upload preflight permits the Authorization header. Checked single-origin and local defaults as well.
- Backend syntax and existing authentication tests passed. Live hosted integration was not tested.
- Deployment: push this update, set the comma-separated frontend origins in Render, and redeploy the backend. No frontend changes are required for this update.

## 2026-09-06 — Show the day alongside message times

- Updated the shared frontend timestamp formatter for text, image, and system messages to display `Today, 12:10 AM`, `Yesterday, 11:59 PM`, or a date such as `3 Sept 2026, 12:00 PM`.
- Both day labels and times use Asia/Dhaka, regardless of the device timezone. Labels are calculated when messages are rendered.
- Older messages without a valid creation date retain their existing timestamp rather than showing an invented date.
- Verified frontend syntax, today/yesterday/older dates, Dhaka midnight, a year boundary, and missing or invalid dates. Backend syntax and authentication tests also passed.
- Deploy the frontend to display these labels. The pending multiple-origin update also requires deploying the backend and configuring Render's `FRONTEND_URL`.
