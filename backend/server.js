const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const mongoose = require('mongoose');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');
const cors = require('cors');
const { createAuth } = require('./auth');
const { isTrustedImageUrl } = require('./image-security');
const { createMessageService, registerMessageHandlers } = require('./message-service');
require('dotenv').config();

const app = express();
const server = http.createServer(app);

// Accept one frontend origin or a comma-separated list for both CORS configurations.
const FRONTEND_URLS = (process.env.FRONTEND_URL || 'http://localhost:3001')
  .split(',')
  .map(url => url.trim().replace(/\/+$/, ''))
  .filter(Boolean);
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/secret-chat';

const io = new Server(server, {
  cors: {
    origin: FRONTEND_URLS,
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type'],
    credentials: true
  }
});

// Valid users with passwords from environment variables
const validUsers = {};

// Load user credentials from environment variables
if (process.env.USER_1_NAME && process.env.USER_1_PASSWORD) {
  validUsers[process.env.USER_1_NAME] = process.env.USER_1_PASSWORD;
}
if (process.env.USER_2_NAME && process.env.USER_2_PASSWORD) {
  validUsers[process.env.USER_2_NAME] = process.env.USER_2_PASSWORD;
}

// Never start with publicly known or implicit login credentials.
if (Object.keys(validUsers).length === 0) {
  throw new Error('No chat users configured. Set USER_1_NAME/USER_1_PASSWORD or USER_2_NAME/USER_2_PASSWORD.');
}

const { isValidUser, requireAuth } = createAuth(validUsers);

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// MongoDB Message Schema
const messageSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['message', 'image', 'system'],
    required: true
  },
  username: String,
  message: String,
  imagePath: String,
  imagePublicId: String,
  timestamp: String,
  clientId: String,
  replyTo: mongoose.Schema.Types.ObjectId,
  deleted: { type: Boolean, default: false },
  revision: { type: Number, default: 0 },
  reactions: { type: Map, of: new mongoose.Schema({ username: String, emoji: String }, { _id: false }), default: {} },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

messageSchema.index({ username: 1, clientId: 1 }, {
  unique: true, partialFilterExpression: { clientId: { $type: 'string' } }
});
const Message = mongoose.model('Message', messageSchema);
const ImageUpload = mongoose.model('ImageUpload', new mongoose.Schema({
  username: { type: String, required: true },
  url: { type: String, required: true },
  publicId: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
}));
const messageService = createMessageService({ Message, ImageUpload, cloudName: process.env.CLOUDINARY_CLOUD_NAME, getTime: getDhakaTime });
const UserPreference = mongoose.model('UserPreference', new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  theme: { type: String, enum: ['light', 'dark'], default: 'light' }
}));

// Setup multer with Cloudinary storage
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'secret-chat',
    resource_type: 'image',
    format: async (req, file) => 'jpg',
    public_id: (req, file) => {
      return Date.now() + '-' + Math.round(Math.random() * 1E9);
    }
  }
});

const upload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only images and gifs are allowed'));
    }
  },
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// Middleware
app.use(cors({
  origin: FRONTEND_URLS,
  credentials: true
}));
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// Connect to MongoDB
console.log('🔄 Connecting to MongoDB...');
mongoose.connect(MONGODB_URI, {
  retryWrites: true,
  w: 'majority',
  serverSelectionTimeoutMS: 5000,
  connectTimeoutMS: 10000,
  ssl: true,
  tlsAllowInvalidCertificates: false,
  tlsAllowInvalidHostnames: false
}).then(() => {
  console.log('✅ Connected to MongoDB');
}).catch(() => {
  console.error('❌ MongoDB connection failed. Check database configuration and network access.');
  console.log('⚠️ Note: Backend will still work, but messages/images won\'t persist until MongoDB connects');
  console.log('💡 Common fixes:');
  console.log('   1. Check MongoDB URI is correct');
  console.log('   2. Verify IP is whitelisted in MongoDB Atlas (Network Access)');
  console.log('   3. Try allowing all IPs temporarily (0.0.0.0/0) for testing');
});

// File upload endpoint
app.post('/api/upload', requireAuth, upload.single('file'), async (req, res) => {
  if (!req.file) {
    console.error('❌ Upload failed: No file received');
    return res.status(400).json({ error: 'No file uploaded' });
  }
  
  try {
    if (!isTrustedImageUrl(req.file.path, process.env.CLOUDINARY_CLOUD_NAME)) {
      throw new Error('Unexpected image URL');
    }
    const uploaded = await ImageUpload.create({
      username: req.username,
      url: req.file.path,
      publicId: req.file.filename
    });
    res.json({ uploadId: uploaded._id.toString() });
  } catch (err) {
    // Do not leave a billed asset behind when recording its ownership fails.
    try { await cloudinary.uploader.destroy(req.file.filename); }
    catch { console.error('Could not clean up an unrecorded image upload'); }
    res.status(500).json({ error: 'Could not register image upload. Please try again.' });
  }
});

// Error handler for upload
app.use((err, req, res, next) => {
  if (err.message && err.message.includes('Only images')) {
    return res.status(400).json({ error: err.message });
  }
  console.error('❌ Upload error:', err.message);
  res.status(500).json({ error: 'File upload failed: ' + err.message });
});

// Get chat history endpoint
app.get('/api/messages', requireAuth, async (req, res) => {
  try {
    const messages = await Message.find()
      .sort({ createdAt: -1 })
      .limit(200);
    res.json(await messageService.present(messages.reverse()));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Health check endpoint
app.get('/api/preferences', requireAuth, async (req, res) => {
  res.set('Cache-Control', 'no-store');
  try {
    const preference = await UserPreference.findOne({ username: req.username });
    res.json({ theme: preference?.theme || 'light' });
  } catch (err) {
    res.status(500).json({ error: 'Could not load appearance preference' });
  }
});

app.put('/api/preferences', requireAuth, async (req, res) => {
  const theme = req.body?.theme;
  if (!['light', 'dark'].includes(theme)) {
    return res.status(400).json({ error: 'Theme must be light or dark' });
  }
  try {
    await UserPreference.findOneAndUpdate(
      { username: req.username }, { $set: { theme } },
      { upsert: true, runValidators: true }
    );
    res.json({ theme });
  } catch (err) {
    res.status(500).json({ error: 'Could not save appearance preference' });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Middleware to check authentication for socket.io
io.use((socket, next) => {
  const username = socket.handshake.auth.username;
  const password = socket.handshake.auth.password;
  
  if (!username || !password) {
    return next(new Error('Unauthorized'));
  }
  
  if (!isValidUser(username, password)) {
    return next(new Error('Unauthorized'));
  }
  
  socket.username = username;
  next();
});

// Helper to format timestamp in Dhaka timezone (Asia/Dhaka)
function getDhakaTime() {
  return new Date().toLocaleTimeString('en-US', {
    timeZone: 'Asia/Dhaka',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
}

// Track active socket connections per user
const activeUsers = new Map(); // username -> Set of socket.id

// Socket.io connection handler
io.on('connection', async (socket) => {
  const username = socket.username;
  console.log(`${username} connected`);
  
  if (!activeUsers.has(username)) {
    activeUsers.set(username, new Set());
  }
  const userSockets = activeUsers.get(username);
  const isFirstConnection = userSockets.size === 0;
  userSockets.add(socket.id);
  
  registerMessageHandlers(socket, io, messageService);

  socket.on('disconnect', async () => {
    console.log(`${username} disconnected`);
    
    if (activeUsers.has(username)) {
      const sockets = activeUsers.get(username);
      sockets.delete(socket.id);
      
      // If user has no other active tabs/connections, record leave event
      if (sockets.size === 0) {
        activeUsers.delete(username);
        
        const leaveMessage = new Message({
          type: 'system',
          username: username,
          message: `${username} left the chat`,
          timestamp: getDhakaTime()
        });

        try {
          await leaveMessage.save();
          socket.broadcast.emit('user left', leaveMessage);
        } catch (err) {
          console.error('❌ Error saving leave message:', err.message);
        }
      }
    }
  });
  // Send chat history to the connected user (latest 200 messages in chronological order)
  try {
    const messages = await Message.find()
      .sort({ createdAt: -1 })
      .limit(200);
    if (socket.connected) socket.emit('load messages', await messageService.present(messages.reverse()));
  } catch (err) {
    console.error('❌ Error loading messages:', err.message);
    socket.emit('history error');
  }

  // If this is the user's first connection, record and broadcast join event
  if (isFirstConnection && socket.connected) {
    const joinMessage = new Message({
      type: 'system',
      username: username,
      message: `${username} joined the chat`,
      timestamp: getDhakaTime()
    });

    try {
      await joinMessage.save();
      socket.broadcast.emit('user joined', joinMessage);
    } catch (err) {
      console.error('❌ Error saving join message:', err.message);
    }
  }

});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Chat backend is ready on port ${PORT}`);
  console.log(`Frontend URLs: ${FRONTEND_URLS.join(', ')}`);
});
