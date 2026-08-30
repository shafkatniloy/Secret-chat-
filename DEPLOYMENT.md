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

## 💾 Persistent Storage (FREE)

Your app now uses **free** cloud services for permanent data storage:

### MongoDB Atlas (Free - 512MB, always free)
1. Go to [mongodb.com/cloud/atlas](https://www.mongodb.com/cloud/atlas)
2. Sign up (no credit card needed)
3. Create a free cluster
4. Click "Connect" → "Drivers"
5. Copy the connection string
6. Create a `.env` file in `backend/` and add:
   ```
   MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/secret-chat
   ```

### Cloudinary (Free - 10GB storage)
1. Go to [cloudinary.com](https://cloudinary.com)
2. Sign up (no credit card needed)
3. Copy your Cloud Name, API Key, and API Secret from Dashboard
4. Add to `backend/.env`:
   ```
   CLOUDINARY_CLOUD_NAME=your_cloud_name
   CLOUDINARY_API_KEY=your_api_key
   CLOUDINARY_API_SECRET=your_api_secret
   ```

### Benefits
✅ **Messages persist forever** - not lost on server restart  
✅ **Images stored permanently** - on Cloudinary (10GB free)  
✅ **Free tier is generous** - perfect for a 2-user chat app  
✅ **No credit card** needed for either service  
✅ **Unlimited bandwidth** on Cloudinary free tier  

Now your chat is truly production-ready!

## 🆘 Troubleshooting

**Frontend can't connect to backend?**
- Check that `BACKEND_URL` in `frontend/index.html` matches your Render URL
- Check CORS is enabled in `backend/server.js`
- Ensure Render backend is running: visit `https://your-backend.onrender.com/api/health`

**MongoDB connection error?**
- Check MongoDB URI in `.env` is correct
- Visit MongoDB Atlas dashboard → Network Access
- Add your Render IP address to whitelist (or allow all IPs: 0.0.0.0/0)
- Check username and password in connection string

**Images won't upload?**
- Verify Cloudinary credentials in `.env`
- Check API key is active in Cloudinary dashboard
- Ensure file size is under 10MB

**Messages appear locally but disappear after deploy?**
- Make sure `MONGODB_URI` environment variable is set on Render
- Check MongoDB connection is successful: look for ✅ in logs
- Verify .gitignore doesn't exclude `.env` from backend folder
