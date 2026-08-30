# 📜 Project Changelog & Architecture Summary (By Antigravity)

This document provides a comprehensive summary of all architectural changes, features, security implementations, and bug fixes made to the **Secret Chat** project up to the present.

---

## 🏗️ 1. Project Architecture & Structure

The repository was structured into a clean decoupled backend and frontend architecture:

```
secret-chat/
├── backend/                        # Node.js + Express + Socket.io Server
│   ├── server.js                   # Application server, Socket handlers, MongoDB models
│   ├── package.json                # Dependencies (Express, Mongoose, Multer, Cloudinary, Socket.io)
│   ├── .env.example                # Template for environment variables (no secrets)
│   └── .gitignore                  # Backend-specific ignore rules
├── frontend/                       # Client Application
│   ├── index.html                  # Single-page interface (HTML/CSS/Vanilla JS)
│   └── package.json                # Frontend local dev server script
├── render.yaml                     # Render backend deployment configuration
├── netlify.toml                    # Netlify frontend deployment configuration
├── DEPLOYMENT.md                   # Full step-by-step production deployment instructions
├── MONGODB_CLOUDINARY_SETUP.md     # Setup guide for MongoDB Atlas & Cloudinary
└── CHANGES_BY_ANTIGRAVITY.md       # Project changelog and implementation summary
```

---

## 🚀 2. Features & Functional Implementations

### A. Real-Time Chat & Persistence
- **Socket.io Integration**: Low-latency bidirectional event broadcasting for real-time text and media messaging.
- **MongoDB Atlas Integration**: Replaced local file storage with permanent cloud storage via Mongoose schemas.
- **Message History Loading**: Automatically fetches and loads the latest 200 messages upon logging in, sorted in exact chronological order.
- **Persistent Media Hosting**: Integrated **Cloudinary** via Multer storage (`multer-storage-cloudinary`) with 10MB limit and image/GIF MIME validation.

### B. User Presence (Join / Leave Tracking)
- **Active Connection Management**: Backend tracks open socket instances per user to prevent duplicate notifications during page refreshes or multi-tab usage.
- **Join & Leave Notifications**: When a user logs in or disconnects, an event is saved to MongoDB with their name and timestamp and broadcast to active participants.
- **Timestamped System Bubbles**: Displays formatted system status messages in the chat feed (e.g., *Niloy joined the chat • 9:30 PM*).

### C. Timezone & Localization (Dhaka Time / GMT+6)
- **Server Timestamp Utility (`getDhakaTime`)**: Standardized all server timestamp generation to `Asia/Dhaka` timezone in 12-hour format (`hh:mm A`), preventing cloud server clocks (e.g. Render UTC) from skewing timestamps.
- **Client Timestamp Formatter (`formatDhakaTime`)**: Formats ISO `createdAt` dates into Dhaka time directly in the client to ensure historical and live messages remain uniform.

### D. User Interface & Experience
- **Responsive Gradient Theme**: Designed with mobile-first CSS styling, smooth slide-up animations, custom scrollbars, and modern typography.
- **Two Distinct Screens**:
  - **Login Screen**: Minimalist card with username and password inputs, form validation, and feedback banners.
  - **Chat Room**: Header with active username and logout button, message list, sticky input bar, and auto-scrolling.
- **Ergonomic Controls**: Arranged input field, send button, and image attachment button for mobile accessibility.
- **XSS Protection**: Sanitizes user messages with client-side HTML entity encoding.

---

## 🔒 3. Security & Configuration Highlights

- **Credential & Secret Protection**: All connection strings, Cloudinary API credentials, and user passwords are extracted into environment variables.
- **Authentication**: Socket.io connection middleware authenticates usernames and passwords against configured credentials before granting chat access.
- **Git Hygiene**: Configured `.gitignore` to prevent committing `.env` secrets, uploaded media files, local storage files, and dependencies.

---

## 🛠️ 4. Major Bug Fixes & Optimizations

| Issue / Bug | Root Cause | Solution Implemented |
| :--- | :--- | :--- |
| **Messages disappearing after logout** | Query used `.sort({ createdAt: 1 }).limit(100)`, which only returned the first 100 oldest messages ever sent. | Updated query to sort by `{ createdAt: -1 }` (latest first), limit to 200, and reverse into chronological order. |
| **Database flooded by system records** | Every socket disconnect/reconnect wrote unmanaged join/leave spam to MongoDB. | Implemented connection tracking (`activeUsers` map) to only record real session transitions and purged legacy spam. |
| **Wrong message timestamps** | Server generated timestamps based on host system's default timezone (UTC on Render). | Added explicit `timeZone: 'Asia/Dhaka'` formatting on both backend and frontend. |
| **Duplicate socket listeners upon re-login** | Repeatedly calling `connectToChat` on logout/login registered multiple event handlers. | Added `socket.removeAllListeners()`, `socket.disconnect()`, and `{ forceNew: true }` upon connection. |

---

## 📋 5. Summary of Git Commits

- `293a3c3` - Initial repository setup.
- `1917e73` - Integrated MongoDB Atlas and Cloudinary for persistent storage.
- `f9dfefd` - Cleaned up repository structure into separated `backend/` and `frontend/` directories.
- `5487422` - Fixed Cloudinary image URL resolution and upload error handling.
- `5a2599c` - Major UI redesign and mobile responsiveness improvements.
- `cc340dd` / `b4b6844` - Added password authentication and environment variable credential management.
- `bc574b1` - Optimized input action button order.
- `877e4e1` - Fixed message timestamps to use Dhaka timezone (`Asia/Dhaka`).
- `34afb83` - Resolved message persistence bug on logout by fetching newest messages and removing system spam.
- `21a2082` - Added active session tracking with timestamped join and leave events for both users.
