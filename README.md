<p align="center">
  <img src="frontend/assets/logo.png" alt="আমাদের কথা logo" width="180" />
</p>

<h1 align="center">আমাদের কথা</h1>

<p align="center">A little chat app for our conversations.</p>

> **Just a fun personal side project.** Built for two people, for learning, experimenting, and making something personal—not as a commercial messaging service.

## About

**আমাদের কথা** (“Our Words”) is a small, browser-based chat app with real-time messages, image sharing, and a few personal touches. It began as a simple private chat and grew into a place to try out interface ideas and learn how a messaging app works behind the scenes.

The interface uses plain HTML, CSS, and JavaScript. A Node.js backend handles the conversations, MongoDB stores messages and preferences, and Cloudinary hosts uploaded images.

## What it can do

- **Real-time conversations** between two configured users, with compact message bubbles and join/leave notices.
- **Image sharing** with authenticated uploads and server-verified ownership.
- **Replies, reactions, and unsend** through a three-dot message menu. Unsent messages leave a deleted-message placeholder.
- **Delivery indicators:** a spinner while sending, a tick once saved, green double ticks when viewed by the other user, and a red alert for failed or unconfirmed sends.
- **Safe retries** that reuse a message ID to avoid duplicate messages.
- **Individual light/dark preferences**, saved per user with a browser-local fallback.
- **Mobile and desktop layouts** with a persistent chat header and compact composer.
- **Dhaka date and time labels**, showing Today, Yesterday, or the date before the time.
- **A personal countdown** shown only to its intended user.

The latest 200 messages load when joining. “Sent” means the server saved the message; “Seen” means the other user's focused chat reported the message visible on screen.

## Built with

| Part | Technology |
| --- | --- |
| Interface | HTML, CSS, vanilla JavaScript |
| Server | Node.js, Express, Socket.IO |
| Database | MongoDB with Mongoose |
| Image uploads | Multer and Cloudinary |
| Frontend hosting | Cloudflare / Netlify |
| Backend hosting | Render |

## Run your own copy

You’ll need Node.js, npm, Python 3 for the simple frontend server, a MongoDB Atlas database, and a Cloudinary account.

1. Clone the repository and open its folder.

2. Install the backend dependencies and create your local configuration:

   ```bash
   npm install --prefix backend
   cp backend/.env.example backend/.env
   ```

3. Fill in `backend/.env` with your MongoDB Atlas connection string, Cloudinary credentials, and your own user names/passwords. For local development, use:

   ```env
   PORT=3000
   FRONTEND_URL=http://localhost:3001
   ```

   The backend requires at least one complete user credential pair. There are no built-in fallback passwords or public demo credentials.

4. Start the backend:

   ```bash
   cd backend
   npm start
   ```

5. In a second terminal, from the repository root, start the frontend:

   ```bash
   npm run dev --prefix frontend
   ```

6. Open **http://localhost:3001** and log in with the credentials you configured.

For deployment, configure the production `BACKEND_URL` in `frontend/index.html` and the allowed frontend origins in Render's `FRONTEND_URL`. Multiple frontend origins can be comma-separated. Use HTTPS for the hosted app.

## Project structure

```text
backend/              Server, authentication, message logic, and tests
frontend/
  assets/             Logo and favicon
  index.html          Chat interface
  chat-state.js       Message state and pending-send reconciliation
changes by codex.md   Development changelog
```

## Checks

```bash
npm test --prefix backend
```

The tests cover authentication, image URL safety and upload ownership, message retries, replies, reactions, unsend, and read-receipt logic. Live database and two-device testing are also useful before deploying changes.

## A note on privacy

This is an experimental personal project, **not an end-to-end encrypted messenger**. The server can access message content, and images are hosted on Cloudinary. Unsend removes content from the chat record; it does not erase downloaded copies or automatically remove the underlying Cloudinary asset.

Keep `.env` files and credentials out of Git. Local offline-preview helpers are intentionally ignored and are not included in a fresh clone.

## Development notes

See [the changelog](changes%20by%20codex.md), [environment configuration](ENV_VARIABLES.md), and [deployment notes](DEPLOYMENT.md) for more detail. Older notes describe the project at the time they were written.

This project will keep changing as new ideas come up. That’s part of the fun.
