# Changes by Codex

## 2026-09-08 — Introduce the project in the GitHub README

- Replaced the minimal README with a logo-first introduction to আমাদের কথা, highlighting that it is a fun personal side project.
- Documented features, the technology stack, local setup, tests, project structure, and privacy limitations without including credentials.
- Verified the logo/document links and diff whitespace.

## 2026-09-08 — Move countdown into a secondary header

- Moved the countdown directly below the main chat header, retaining its content-width size and Niloy-only visibility.
- Applied a dark reddish background (`#701f2a`) and light text in both themes. Countdown target and format remain unchanged.
- Updated the local offline preview adapter for the renamed countdown handler.
- Verified frontend and preview JavaScript syntax and diff whitespace. Browser visual verification was not performed.

## 2026-09-08 — Enable countdown in offline preview

- Updated the local, Git-ignored `frontend/offline-preview.js` adapter to start the countdown after its simulated Niloy login.
- Open `frontend/offline-test.html` and use `a` for both username and password to preview the countdown without a backend connection.
- Verified the adapter's JavaScript syntax. Browser visual verification was not performed.

## 2026-09-08 — Add Niloy-only countdown footer

- Added a compact, content-width secondary footer beneath the message composer in `frontend/index.html`.
- Displays only `x days, x hours, x minutes`, counting down to September 24, 2026, at midnight Bangladesh time (UTC+06:00).
- Shows the footer after successful login as `Niloy`; hides and clears it on logout or an unauthorized connection error and for other users.
- Updates every second and stays at `0 days, 0 hours, 0 minutes` after the target date.
- Verified frontend JavaScript syntax, countdown calculation, expiry, user visibility, and diff whitespace. Browser visual verification was not performed.
- Deploy the frontend to publish this change.

## 2026-09-08 — Green seen indicator

- Colored the Seen double tick green, with a brighter green in dark mode for contrast. Other delivery indicators are unchanged.

## 2026-09-08 — Compact delivery icons and read receipts

- Replaced visible delivery text with a single tick for Sent, double tick for Seen, spinning indicator for Sending, and red alert for Failed/Not confirmed, keeping the existing status position. Icons are 12px, with a 15px-wide double tick.
- The red alert doubles as the Retry control, retaining an accessible name and explanatory tooltip. Failed and unconfirmed states remain distinct internally; retries reuse the original message ID.
- Added authenticated, persisted read receipts. A user cannot mark their own message seen; repeated receipts do not increment revisions again. Deleted/system messages are not newly marked seen.
- The frontend reports incoming messages only when their bubbles are visible in the focused, visible chat. Scrolling, focus changes, and rendering trigger batched checks. Merely connecting or opening a background tab does not send read receipts.
- Added local-only offline support and a Simulate Mim viewing messages control for checking double ticks without implying a real recipient viewed anything.
- Existing tests and new receipt ownership/idempotency, visibility/focus, and SVG state tests passed. Backend/frontend syntax and whitespace checks passed. Live two-device and browser visual testing remain necessary.
- Requires deploying both backend and frontend, then refreshing open tabs. Changes are local and have not been pushed.

## 2026-09-07 — Delivery states, retries, replies, unsend, and reactions

- Added optimistic Sending, server-confirmed Sent, Failed, and Not confirmed states for text and image messages, with Retry controls. Sent means stored by the server, not delivered to/read by another device.
- Added per-user client message IDs and a partial unique MongoDB index. Retries return the original saved message; concurrent duplicate attempts cannot create duplicate messages. Sends wait for index initialization.
- Registered message actions and disconnect cleanup before awaiting history. Reconnection reloads confirmed history while retaining pending drafts, and message revisions prevent stale history/acknowledgements from restoring deleted content or old reactions.
- Pending text and already-uploaded image IDs are kept in per-user tab session storage when available. Raw files that have not finished uploading remain in memory only and need selecting again after a reload. No credentials are stored in this outbox.
- Added a three-dot message menu with Reply, React, and owner-only Unsend for everyone. Replies show a quoted preview and a cancelable composer preview; clicking a quote jumps to the original when it is loaded.
- Unsend removes message text/image references from the message record and leaves a deleted-message placeholder. Reply previews update to Message deleted. This implementation has no unsend time limit; it does not erase downloaded copies or delete the underlying Cloudinary upload asset.
- Reactions support six emoji choices, one per user per message, with replacement/removal and visible counts. Atomic updates preserve the other user's reaction. System notices and deleted messages cannot be replied to or reacted to.
- Retained image upload ownership checks and safe DOM rendering; no client-supplied reply text or image URL is trusted by the backend.
- Updated the Git-ignored offline adapter with a sample incoming message, local reply/react/unsend behavior, and selectors to simulate save failures or lost confirmations. It still uses the same production frontend and makes no network requests.
- Added service/client regression tests covering duplicate IDs and uniqueness conflicts, invalid input, replies, ownership, reaction changes, image retries, persistence failures, stale revisions, per-user outbox restoration, delayed callbacks, and listener registration order.
- All five backend test files passed. Full offline UI simulation checks passed for login, sending, failed-save/lost-confirmation retries, reply, react, and unsend without network calls. Syntax, diff whitespace, and installed-Mongoose schema/index/Map serialization checks passed. Browser visual testing and live MongoDB/two-device integration were not available.
- Deployment requires both backend and frontend, including the new `frontend/chat-state.js` asset. Refresh old chat tabs after deployment because sends now require client IDs. No environment variable changes are required. All changes remain local until approved for push.

## 2026-09-06 — Remove fallback credentials and database URI logging

- Removed hardcoded fallback login passwords. The backend now refuses to start when no complete user credential pair is configured; existing environment-configured logins remain supported.
- Removed startup logging of the MongoDB connection string and replaced raw database connection errors with a generic diagnostic so connection details are not printed there.
- Cleared password values in `.env.example` and documented that unique passwords must be configured. Local `.env` and Render settings were not changed.
- Added regression tests for missing/incomplete credentials, explicit two-user login configuration, wrong passwords, and a single configured user.
- All backend authentication, credential configuration, and image-security tests passed, along with backend syntax and diff whitespace checks.
- Requires backend deployment only. This change does not remove existing Git history or previously generated hosting logs.

## 2026-09-06 — Prevent image-message HTML injection

- Replaced message, image, and system-notice HTML interpolation with DOM element creation and textContent, including usernames and timestamp fallbacks.
- Added strict HTTPS Cloudinary raster-image URL checks. Both history endpoints redact image URLs outside the configured Cloudinary account; the frontend blocks unsafe URLs and shows an unavailable-image placeholder. Stored records are not deleted or rewritten.
- Recorded uploaded image URLs, Cloudinary public IDs, and authenticated owners in a MongoDB ImageUpload collection. The upload API now returns an upload ID; image messages submit that ID, and the server resolves its URL after verifying ownership.
- Restricted Cloudinary uploads to image resources and used the upload adapter's filename field for the public ID. Attempt cleanup if database registration fails.
- Added image-message acknowledgements, visible chat errors, and session checks to prevent a completed upload from being sent through a different login session.
- Kept blob image previews restricted to local offline mode.
- Added regression coverage for unsafe URLs, historical messages, invalid/unknown/other-user upload IDs, ignored client URL overrides, authenticated upload ownership, failed-registration cleanup, socket save/broadcast behavior, and safe DOM rendering.
- Authentication and image-security tests, backend/frontend syntax, and diff whitespace checks passed. Live Cloudinary/MongoDB integration and browser visual checks were not performed.
- Deploy both frontend and backend together, then refresh open chat tabs: older clients sending raw image URLs are deliberately rejected. No new environment variables are required; the existing CLOUDINARY_CLOUD_NAME must match the account storing the images.

## 2026-09-06 — Single-row mobile header and composer

- Kept the mobile logo/title, username, Logout, and theme switch on one row using compact spacing and controls. Long names/title text truncate rather than expanding the header.
- Moved mobile theme status text into a small overlay below the header so it does not add another header row.
- Kept the message input, Send, and attachment control on one row; the input shrinks to available space while buttons remain usable.
- Verified JavaScript syntax, diff whitespace, backend authentication tests, and Git exclusion of offline test files. Visual device testing was unavailable.

## 2026-09-06 — Icon-only upload control

- Removed the visible Image label, retaining an Upload image accessible name and tooltip on the icon button.

## 2026-09-06 — Custom image button icon

- Replaced the Image button's paperclip emoji with the supplied Lucide link SVG, preserving its 24px size and 3px stroke.
- Centered the icon and label with spacing; the SVG inherits the button text color and is hidden from screen readers because the Image label identifies the action.

## 2026-09-06 — Blend theme switch with the header

- Changed the theme slider track from black to transparent with a subtle white border, allowing the light/dark header background to show through.
- Kept the white thumb and monochrome icons for visible switch states.

## 2026-09-06 — Preview the actual frontend without a watcher

- Replaced the copied offline page with a Git-ignored launcher that opens the current `index.html` in local preview mode. Saving the main frontend and refreshing now shows changes immediately, without Python or regeneration.
- Moved local simulation and test credentials into a separate Git-ignored JavaScript adapter. Preview mode is restricted to local file/loopback addresses; hosted sites always load the real chat client.
- Local preview blocks connection requests and does not load the Socket.IO CDN. Login stays disabled until the selected adapter loads.
- Retired the old local generator. The offline launcher and adapter remain excluded from Git.
- Verified frontend/adapter syntax, launcher routing, local-only activation, hosted-site exclusion, and Git ignore rules. Browser visual verification was unavailable.

## 2026-09-06 — Keep the offline preview in sync

- Added a Git-ignored local preview generator with an optional watch mode. It rebuilds the offline HTML from the current production frontend when that file changes, preserving the local simulation overrides.
- Preview users refresh the generated page after saving frontend changes. This checks layout and local interactions; production authentication, database persistence, and live messaging still need integration testing.
- Verified successful regeneration, generated JavaScript syntax, removal of external scripts, and Git exclusion of both local preview files. Neither the helper nor the preview is intended for deployment.

## 2026-09-06 — Local-only offline preview

- Added a Git ignore rule for a separate offline HTML preview. Its test credentials and preview implementation are excluded from commits.
- Production authentication is unchanged. The local preview simulates chat and image display without remote requests, with a connection-blocking content policy and no Socket.IO CDN dependency.
- The preview is a snapshot of the current frontend and must be regenerated to include future interface changes. It is not a backend integration test.
- Verified the ignore rule, inline JavaScript syntax, and network isolation settings. Test credentials are intentionally omitted from this log.

## 2026-09-06 — Compact header controls and offline theme fallback

- Reduced the theme switch to 60 × 32px with 16px monochrome icons and a 24px sliding thumb.
- Right-aligned the account controls and switch even when theme status text wraps onto its own line.
- Added browser-local theme caching keyed by username, with no passwords stored. Local file previews skip preference API requests and explain that sync is unavailable.
- Theme changes remain applied when cloud saving fails. Pending browser preferences are retried on the next login/reconnection; successful cloud loads/saves update the local cache.
- If browser storage is unavailable, the interface explains that the theme is only applied for the current session.
- Verified frontend syntax, offline switching, separate-user caching, restoration, pending sync retry, and diff whitespace. Browser visual checks were unavailable.
- Cross-device theme persistence still requires deploying the pending backend preference endpoints and using an allowed HTTP(S) frontend origin.

## 2026-09-06 — Separate monochrome theme slider

- Moved the appearance control after Logout, separated from the username/logout group by spacing and a divider.
- Replaced the text/emoji control with a pill switch, sliding white thumb, and black/white SVG sun and moon icons.
- Preserved per-user preference saving, keyboard operation, accessible switch state, disabled state during saves, and visible focus styling. Respects reduced-motion preferences.
- Verified frontend syntax and that switching themes updates the slider state without replacing its icons.

## 2026-09-06 — Persistent header and individual appearance preferences

- Made the chat header sticky within the chat container; the message list scrolls independently. Header controls wrap on small screens.
- Renamed the chat header and browser title to `আমাদের কথা`.
- Added an accessible light/dark switch and dark colors for the chat, message bubbles, inputs, and notices.
- Added authenticated GET/PUT `/api/preferences` endpoints backed by a MongoDB user preference collection. Each preference is keyed by the authenticated username, never a client-supplied username.
- Load each user's theme on login/reconnection, save changes across devices, reset appearance on logout, and ignore stale responses from previous sessions. Failed saves restore the previous theme and show an error in the header.
- Verified authentication, independent preferences for two users, rejected invalid themes, database error handling, frontend save success/failure behavior, JavaScript syntax, and existing authentication tests. Live database and browser visual verification were not performed.
- Deployment requires both the backend and frontend updates. No new environment variables are required.

## 2026-09-06 — Use compact message bubbles

- Text and image messages now fit their content, capped at 75% of the message area or 560px on larger screens and 88% on narrow phones.
- Own messages align right with a light purple background; incoming messages align left. Join/leave notices are compact and centered with a 480px maximum width.
- Prevented bubbles from shrinking vertically in the scrollable message list and retained wrapping for long content.
- Restored the current username on socket reconnection so message alignment remains correct after reconnecting.
- Verified frontend JavaScript syntax and rendering classes for own, incoming, image, and system messages. Browser visual verification remains unavailable.

## 2026-09-06 — Fix responsive login and chat layout

- Fixed the login card becoming a horizontal row after logout or socket disconnection by explicitly setting its flex direction to column.
- Replaced the login lock emoji and visible title with the supplied logo, retaining an accessible image label.
- Kept the login card at a consistent maximum width on desktop and mobile, with internal scrolling for short viewports and inputs that fit its width.
- Used the dynamic viewport height and sized the chat inside the body's padding to prevent vertical overflow. Limited desktop chat width and rounded its container.
- Allowed long headers and timestamps to wrap, and placed the composer input above its buttons on narrow phones. Mobile input text uses 16px sizing.
- JavaScript syntax, logo reference, login layout rules, and diff whitespace checks passed. Browser visual verification was unavailable in this session.

## 2026-09-06 — Add custom favicon and chat header logo

- Linked the supplied `frontend/assets/favicon.png` as the browser tab icon.
- Replaced the chat header's speech-bubble emoji with the supplied `frontend/assets/logo.png`, displayed at 40 × 40 pixels without stretching.
- Kept the existing Secret Chat title and used an empty image alt attribute to avoid repeating the adjacent title for screen readers.
- Verified both local PNG assets and their HTML references. Deploy the frontend to publish these changes.

## 2026-09-06 — Show the day alongside message times

- Updated the shared frontend timestamp formatter for text, image, and system messages to display `Today, 12:10 AM`, `Yesterday, 11:59 PM`, or a date such as `3 Sept 2026, 12:00 PM`.
- Both day labels and times use Asia/Dhaka, regardless of the device timezone. Labels are calculated when messages are rendered.
- Older messages without a valid creation date retain their existing timestamp rather than showing an invented date.
- Verified frontend syntax, today/yesterday/older dates, Dhaka midnight, a year boundary, and missing or invalid dates. Backend syntax and authentication tests also passed.
- Deploy the frontend to display these labels. The pending multiple-origin update also requires deploying the backend and configuring Render's `FRONTEND_URL`.

## 2026-09-06 — Support multiple frontend origins

- Updated `backend/server.js` to accept a comma-separated list in `FRONTEND_URL` for both Express and Socket.IO CORS.
- Preserved support for a single URL and the localhost default. Whitespace, trailing slashes, and empty list entries are removed.
- Updated `ENV_VARIABLES.md` with multiple-origin configuration and corrected the production backend URL description.
- Verified that both configured origins receive CORS access, an unrelated origin does not, and HTTP upload preflight permits the Authorization header. Checked single-origin and local defaults as well.
- Backend syntax and existing authentication tests passed. Live hosted integration was not tested.
- Deployment: push this update, set the comma-separated frontend origins in Render, and redeploy the backend. No frontend changes are required for this update.

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
