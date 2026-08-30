const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const mongoose = require('mongoose');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');
const cors = require('cors');
require('dotenv').config();

const app = express();
const server = http.createServer(app);

// Get frontend URL and MongoDB URI from environment variables
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3001';
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/secret-chat';

const io = new Server(server, {
  cors: {
    origin: FRONTEND_URL,
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type'],
    credentials: true
  }
});

// Valid users with passwords
const validUsers = {
  'Niloy': 'niloy1488',
  'Mim': 'ohona24'
};

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
  createdAt: {
    type: Date,
    default: Date.now
  }
});

const Message = mongoose.model('Message', messageSchema);

// Setup multer with Cloudinary storage
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'secret-chat',
    resource_type: 'auto',
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
  origin: FRONTEND_URL,
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
}).catch(err => {
  console.error('❌ MongoDB connection error:', err.message);
  console.log('⚠️ Note: Backend will still work, but messages/images won\'t persist until MongoDB connects');
  console.log('💡 Common fixes:');
  console.log('   1. Check MongoDB URI is correct');
  console.log('   2. Verify IP is whitelisted in MongoDB Atlas (Network Access)');
  console.log('   3. Try allowing all IPs temporarily (0.0.0.0/0) for testing');
});

// File upload endpoint
app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    console.error('❌ Upload failed: No file received');
    return res.status(400).json({ error: 'No file uploaded' });
  }
  
  console.log('✅ File uploaded to Cloudinary:', {
    filename: req.file.filename,
    path: req.file.path,
    publicId: req.file.public_id
  });
  
  res.json({
    filename: req.file.filename,
    path: req.file.path,
    publicId: req.file.public_id,
    mimetype: req.file.mimetype
  });
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
app.get('/api/messages', async (req, res) => {
  try {
    const messages = await Message.find().sort({ createdAt: 1 }).limit(100);
    res.json(messages);
  } catch (err) {
    res.status(500).json({ error: err.message });
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
  
  if (!validUsers[username] || validUsers[username] !== password) {
    return next(new Error('Unauthorized'));
  }
  
  socket.username = username;
  next();
});

// Socket.io connection handler
io.on('connection', (socket) => {
  console.log(`${socket.username} connected`);
  
  // Send chat history to the connected user
  Message.find().sort({ createdAt: 1 }).limit(100).then(messages => {
    socket.emit('load messages', messages);
  });
  
  // Notify others that user joined
  const joinMessage = new Message({
    type: 'system',
    message: `${socket.username} joined the chat`,
    timestamp: new Date().toLocaleTimeString()
  });
  
  joinMessage.save().then(() => {
    socket.broadcast.emit('user joined', joinMessage);
  });
  
  socket.on('chat message', async (msg) => {
    const messageData = new Message({
      type: 'message',
      username: socket.username,
      message: msg,
      timestamp: new Date().toLocaleTimeString()
    });
    
    await messageData.save();
    
    // Emit to sender
    socket.emit('chat message', messageData);
    // Broadcast to all other users
    socket.broadcast.emit('chat message', messageData);
  });

  socket.on('image message', async (data) => {
    const messageData = new Message({
      type: 'image',
      username: socket.username,
      imagePath: data.imagePath,
      imagePublicId: data.publicId,
      timestamp: new Date().toLocaleTimeString()
    });
    
    await messageData.save();
    
    // Emit to sender
    socket.emit('image message', messageData);
    // Broadcast to all other users
    socket.broadcast.emit('image message', messageData);
  });

  socket.on('disconnect', async () => {
    console.log(`${socket.username} disconnected`);
    
    const leaveMessage = new Message({
      type: 'system',
      message: `${socket.username} left the chat`,
      timestamp: new Date().toLocaleTimeString()
    });
    
    await leaveMessage.save();
    socket.broadcast.emit('user left', leaveMessage);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Chat backend is ready on port ${PORT}`);
  console.log(`Frontend URL: ${FRONTEND_URL}`);
  console.log(`Database: ${MONGODB_URI}`);
});
