# Environment Variables Guide

## Backend (.env file)

Create `backend/.env`:

```env
# Server Port
PORT=3000

# Frontend URL (for CORS)
# Local development:
FRONTEND_URL=http://localhost:3001

# Production (Netlify):
# FRONTEND_URL=https://your-app-name.netlify.app
```

## Frontend (frontend/index.html)

The frontend automatically detects the backend URL:
- **Local**: Uses `http://localhost:3000`
- **Production**: Uses the same domain as frontend (e.g., Netlify domain)

You can manually set it in `frontend/index.html` around line 140:

```javascript
// Auto-detect (recommended):
const BACKEND_URL = window.location.hostname === 'localhost' 
  ? 'http://localhost:3000' 
  : 'https://your-render-backend.onrender.com';

// Or hardcode for production:
const BACKEND_URL = 'https://secret-chat-backend.onrender.com';
```

## Render Environment Variables

Set these in Render dashboard:

```
PORT=3000
FRONTEND_URL=https://your-netlify-domain.netlify.app
NODE_ENV=production
```

## Important!

✅ After Netlify deployment, update Render's `FRONTEND_URL` with the actual Netlify URL
✅ Redeploy backend after updating environment variables
✅ Never commit `.env` files to GitHub (use `.gitignore`)
