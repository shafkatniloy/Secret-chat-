# Secret Chat - Deployment Guide

This project is split into frontend and backend for easy deployment.

## 📁 Project Structure

```
secret-chat/
├── backend/              # Node.js + Socket.io server (Deploy to Render)
│   ├── server.js
│   ├── package.json
│   └── .env.example
├── frontend/             # Static HTML/CSS/JS (Deploy to Netlify)
│   ├── index.html
│   └── package.json
├── netlify.toml         # Netlify configuration
├── render.yaml          # Render configuration
└── README.md
```

## 🚀 Local Development

### Backend (runs on port 3000)
```bash
cd backend
npm install
cp .env.example .env
npm start
```

### Frontend (runs on port 3001)
```bash
cd frontend
npm run dev
# Open http://localhost:3001
```

## ☁️ Deploy to Render (Backend)

1. Push code to GitHub
2. Go to [render.com](https://render.com)
3. Click "New +" → "Web Service"
4. Connect your GitHub repository
5. Set:
   - **Build Command**: `cd backend && npm install`
   - **Start Command**: `cd backend && npm start`
   - **Environment Variables**:
     - `PORT`: `3000`
     - `FRONTEND_URL`: `https://your-netlify-domain.netlify.app`

6. Deploy!
7. Copy your Render URL (e.g., `https://secret-chat-backend.onrender.com`)

## 🌐 Deploy to Netlify (Frontend)

1. Push code to GitHub
2. Go to [netlify.com](https://netlify.com)
3. Click "Add new site" → "Import an existing project"
4. Connect your GitHub repository
5. Set:
   - **Build command**: (leave empty)
   - **Publish directory**: `frontend`
6. Deploy!

### Update Frontend with Backend URL

After deploying backend to Render, you need to update the frontend:

**In `frontend/index.html`, find this line:**
```javascript
const BACKEND_URL = window.location.hostname === 'localhost' 
  ? 'http://localhost:3000' 
  : 'https://your-render-url.onrender.com';  // Change this!
```

Replace with your actual Render URL, then redeploy to Netlify.

## 🔐 Security Notes

- Only "Niloy" and "Mim" can access the chat (edit in `backend/server.js`)
- Images are stored on Render's filesystem (will be cleared on redeploy)
- Messages stored in `messages.json` (will be cleared on Render redeploy)
- For production, use MongoDB for persistent storage

## 💾 Persistent Storage (Optional Upgrade)

To keep messages and images after redeployment:
- Use MongoDB Atlas (free tier available)
- Use AWS S3 for image storage
- Contact me for help setting this up!

## 🆘 Troubleshooting

**Frontend can't connect to backend?**
- Check that `BACKEND_URL` in `frontend/index.html` matches your Render URL
- Check CORS is enabled in `backend/server.js`
- Ensure Render backend is running: visit `https://your-backend.onrender.com/api/health`

**Images not loading?**
- Check image path in browser console
- Ensure Render backend is running
- Images are temporary - they're deleted when Render server restarts

**Messages disappear?**
- Render deletes temporary files on server restart
- For persistent storage, upgrade to MongoDB setup
