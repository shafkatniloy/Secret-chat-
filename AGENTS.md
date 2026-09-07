# Project instructions — আমাদের কথা

These instructions apply throughout this repository. Follow the user's current explicit instructions when they change the scope or override a project preference.

## Project context

This is a fun personal side project: a browser-based chat for two configured users. The frontend uses HTML, CSS, and JavaScript; the backend uses Express, Socket.IO, MongoDB/Mongoose, and Cloudinary. Frontend hosting uses Cloudflare and/or Netlify, with the backend on Render.

## 1. Work locally first

- Implement authorized changes locally and let the user test them.
- Commit, push, or deploy only when explicitly requested. A previous push request does not authorize publishing later changes.
- Do not ask for additional confirmation for ordinary reversible edits already within the requested scope. Request tool permission when the environment requires it.

## 2. Protect private data

- Never commit `.env`, passwords, tokens, database connection strings, private chat data, or offline test credentials.
- Keep local test adapters and launchers Git-ignored. Check staged file names before committing.
- Do not print secrets in logs, tool output, documentation, or the changelog. Avoid reading private configuration values unless necessary for the task.
- Use environment-configured credentials; do not introduce fallback passwords or production authentication bypasses.

## 3. Keep offline testing current

- The local offline preview must use the actual frontend rather than a stale copied interface.
- Preserve the workflow of opening the offline HTML launcher and refreshing after edits, without requiring a watcher or build command.
- Keep simulation code and credentials separate from production and excluded from Git. Restrict preview activation to local contexts.
- Update the local adapter when changes affect its behavior, if it is available. Do not publish it or reconstruct private credentials if it is absent.
- Clearly explain which checks need a live backend or a second device. Simulated success is not proof of live integration.

## 4. Maintain the changelog

- Document each change in `changes by codex.md`.
- Keep newest entries first, including the actual change order within the same date.
- Record what changed, relevant checks, limitations, and deployment requirements. Do not invent timestamps or test results.
- Never include secrets or test login credentials. Preserve historical entries when sorting them.

## 5. Preserve existing functionality

- Keep authentication, image URL safety and upload ownership, message retries/deduplication, replies, unsend, reactions, themes, and read receipts working.
- Preserve user-specific preferences and visibility rules, plus Asia/Dhaka date/time behavior.
- Keep compatibility with stored messages in mind. Explain migrations or frontend/backend coordination when needed.
- Describe Sent as server-saved and Seen as reported visible by the other user's focused chat; do not equate either with proof that a human read the content.

## 6. Support mobile and desktop

- Keep the header visible and the composer usable while history scrolls, including when the mobile keyboard opens.
- Preserve compact single-row mobile header/composer controls unless the user requests otherwise.
- Use appropriate message widths, distinct unobtrusive system notices, and readable light/dark themes.
- Keep icon controls accessible through labels, focus styles, and usable click/touch targets.

## 7. Validate on the server

- Derive identity from authentication, not a client-supplied username.
- Enforce message ownership and action permissions server-side. Verify image uploads before accepting them as messages.
- Validate IDs, payload types, lengths, and allowed values.
- Render untrusted content through safe DOM APIs such as `textContent`; never interpolate it into HTML.

## 8. Use resources efficiently

- Avoid unnecessary requests, overlapping history loads, duplicate messages, repeated uploads, and unbounded data loading.
- Prefer bounded batches and indexed cursor queries for history work.
- Preserve scroll position and prevent duplicates when merging history and live updates.
- Keep the small, personal-project scope in mind rather than adding unnecessary infrastructure.

## 9. Verify the changes

- Run checks appropriate to the change. Add meaningful regression tests for security, persistence, and nontrivial behavior.
- The backend test command is `npm test --prefix backend`. Check JavaScript syntax and `git diff --check` where relevant.
- Validate mobile/desktop and light/dark behavior when browser testing is available.
- Clearly distinguish automated tests, offline simulation, browser visual checks, and live database/two-device tests. State what could not be verified.
- Do not add redundant tests or repeat checks without a reason.

## 10. Communicate clearly

- Give concise progress updates during work.
- Explain what changed, how it was checked, remaining uncertainty, and how the user can test it.
- State whether changes are local, committed, pushed, or deployed; do not imply deployment just because a push succeeded.
- Explain whether frontend, backend, or both need deployment, and whether open tabs need refreshing.

## 11. Respect scope and user edits

- If the user asks only for an explanation, provide an explanation without editing files.
- If the user asks for a plan before approval, wait for approval before implementation.
- Preserve unrelated user edits. Inspect the working tree before staging or changing files.
- Do not rewrite history, delete data, or change hosted configuration without authorization.
