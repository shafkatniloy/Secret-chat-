# 🚀 Quick Start - Deploy to Render + Netlify

## Step 1️⃣: Set Up GitHub Repository

```bash
cd /home/safkatniloy/Documents/pilot/secret-chat
git init
git add .
git commit -m "Initial split frontend/backend setup"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/secret-chat.git
git push -u origin main
```

## Step 2️⃣: Deploy Backend to Render

1. Go to [render.com](https://render.com) and sign up
2. Click **"New +"** → **"Web Service"**
3. Connect your GitHub repository `secret-chat`
4. Fill in:
   - **Name**: `secret-chat-backend`
   - **Build Command**: `cd backend && npm install`
   - **Start Command**: `cd backend && npm start`
   - **Region**: Oregon (free tier)
   - **Plan**: Free

5. Click **"Advanced"** and add Environment Variables:
   - `PORT`: `3000`
   - `FRONTEND_URL`: (leave blank for now, update after Netlify deploy)

6. Click **"Create Web Service"** and wait for deployment
7. Once deployed, copy your URL (e.g., `https://secret-chat-backend.onrender.com`)

## Step 3️⃣: Update Frontend with Backend URL

Edit `frontend/index.html` and find this line (around line 140):

```javascript
const BACKEND_URL = window.location.hostname === 'localhost' 
  ? 'http://localhost:3000' 
  : 'https://your-render-url.onrender.com';  // ← UPDATE THIS
```

Replace with your actual Render URL:

```javascript
const BACKEND_URL = window.location.hostname === 'localhost' 
  ? 'http://localhost:3000' 
  : 'https://secret-chat-backend.onrender.com';  // Use your actual URL
```

## Step 4️⃣: Deploy Frontend to Netlify

1. Go to [netlify.com](https://netlify.com) and sign up
2. Click **"Add new site"** → **"Import an existing project"**
3. Choose GitHub and select `secret-chat` repository
4. Fill in:
   - **Build command**: (leave empty)
   - **Publish directory**: `frontend`
5. Click **"Deploy"** and wait
6. Copy your Netlify URL (e.g., `https://secret-chat.netlify.app`)

## Step 5️⃣: Enable Backend CORS

Go back to Render and update the `FRONTEND_URL` environment variable:
- Change `FRONTEND_URL` from `http://localhost:3000` to your Netlify URL
- Redeploy the backend

## ✅ Done! Your chat is live!

- **Frontend**: https://your-app.netlify.app (Netlify)
- **Backend**: https://your-backend.onrender.com (Render)

### Test it:
1. Open your Netlify URL in two browser windows
2. Log in as "Niloy" in one, "Mim" in the other
3. Send messages and images - they should appear in both windows!

---

## 🔧 Local Testing (Before Deployment)

**Terminal 1 - Backend:**
```bash
cd backend
npm start
# Runs on http://localhost:3000
```

**Terminal 2 - Frontend:**
```bash
cd frontend
npm run dev
# Opens http://localhost:3001
```

## 📌 Important Notes

- **Messages are temporary on Render** - they'll be cleared when server restarts (free tier limitation)
- **Uploaded images are temporary** - stored in Render's filesystem
- For production, upgrade to:
  - [MongoDB Atlas](https://www.mongodb.com/cloud/atlas) for persistent messages
  - [Cloudinary](https://cloudinary.com) or AWS S3 for image storage

## 🆘 Troubleshooting

**"Can't connect to backend"**
- Check backend is running on Render
- Visit `https://your-backend.onrender.com/api/health` - should show `{"status":"ok"}`
- Verify `BACKEND_URL` in frontend matches Render URL
- Check CORS settings in `backend/server.js`

**"Images won't load"**
- Render free tier deletes files on restart
- Backend might be sleeping - visit health endpoint to wake it

**"Messages disappear after refresh"**
- Render free tier doesn't persist files
- Upgrade to MongoDB + AWS S3 for production use

**Need help?** Check `DEPLOYMENT.md` for detailed instructions!
