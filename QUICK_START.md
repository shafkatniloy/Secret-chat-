# 🚀 Quick Start - Deploy to Render + Netlify (with Persistent Storage)

## 🎉 BONUS: Free Persistent Storage!

Before you deploy, set up **FREE** permanent storage:
- **Messages**: [MongoDB Atlas](https://mongodb.com/cloud/atlas) (512MB free)
- **Images**: [Cloudinary](https://cloudinary.com) (10GB free)

📖 **Follow the complete setup guide**: [MONGODB_CLOUDINARY_SETUP.md](MONGODB_CLOUDINARY_SETUP.md)

---

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
   - `MONGODB_URI`: Your MongoDB connection string
   - `CLOUDINARY_CLOUD_NAME`: Your Cloudinary cloud name
   - `CLOUDINARY_API_KEY`: Your Cloudinary API key
   - `CLOUDINARY_API_SECRET`: Your Cloudinary API secret

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

✅ **Messages are now PERMANENT** - stored in MongoDB Atlas (free tier)  
✅ **Uploaded images are PERMANENT** - stored in Cloudinary (free tier)  
✅ **No credit card required** for either service  
✅ **Free forever** - your 2-user chat will never exceed free tier limits

## 🆘 Troubleshooting

**"Can't connect to backend"**
- Check backend is running on Render
- Visit `https://your-backend.onrender.com/api/health` - should show `{"status":"ok"}`
- Verify `BACKEND_URL` in frontend matches Render URL
- Check CORS settings in `backend/server.js`

**"MongoDB connection error"**
- Make sure you added `MONGODB_URI` to Render environment variables
- Check MongoDB whitelist includes Render's IP (0.0.0.0/0 is easier)
- Verify connection string has no typos

**"Images won't upload"**
- Ensure Cloudinary credentials are correct in Render env vars
- Check file size is under 10MB
- Verify API key is active in Cloudinary dashboard

**"Messages disappear after refresh"**
- Check MongoDB Atlas dashboard → confirm data is there
- Verify `MONGODB_URI` environment variable is set on Render
- Look at Render logs - should see ✅ Connected to MongoDB

**Need help?** Check [MONGODB_CLOUDINARY_SETUP.md](MONGODB_CLOUDINARY_SETUP.md) for detailed setup!
