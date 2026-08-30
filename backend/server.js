const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
require('dotenv').config();

const app = express();
const server = http.createServer(app);

// Get frontend URL from environment variable
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

const io = new Server(server, {
  cors: {
    origin: FRONTEND_URL,
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type'],
    credentials: true
  }
});

// Valid users
const validUsers = ['Niloy', 'Mim'];

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}

// Create messages storage file if it doesn't exist
const messagesFile = path.join(__dirname, 'messages.json');
if (!fs.existsSync(messagesFile)) {
  fs.writeFileSync(messagesFile, JSON.stringify([]));
}

// Setup multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
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

// Helper functions for message storage
function getMessages() {
  try {
    return JSON.parse(fs.readFileSync(messagesFile, 'utf8'));
  } catch (err) {
    return [];
  }
}

function saveMessage(messageData) {
  const messages = getMessages();
  messages.push(messageData);
  fs.writeFileSync(messagesFile, JSON.stringify(messages, null, 2));
}

// Middleware
app.use(cors({
  origin: FRONTEND_URL,
  credentials: true
}));
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// Serve uploaded files
app.use('/uploads', express.static(uploadsDir));

// File upload endpoint
app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  
  res.json({
    filename: req.file.filename,
    path: `/uploads/${req.file.filename}`,
    mimetype: req.file.mimetype
  });
});

// Get chat history endpoint
app.get('/api/messages', (req, res) => {
  const messages = getMessages();
  res.json(messages);
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Middleware to check authentication for socket.io
io.use((socket, next) => {
  const username = socket.handshake.auth.username;
  
  if (!username || !validUsers.includes(username)) {
    return next(new Error('Unauthorized'));
  }
  
  socket.username = username;
  next();
});

// Socket.io connection handler
io.on('connection', (socket) => {
  console.log(`${socket.username} connected`);
  
  // Send chat history to the connected user
  const messages = getMessages();
  socket.emit('load messages', messages);
  
  // Notify others that user joined
  const joinMessage = {
    type: 'system',
    message: `${socket.username} joined the chat`,
    timestamp: new Date().toLocaleTimeString()
  };
  saveMessage(joinMessage);
  socket.broadcast.emit('user joined', joinMessage);
  
  socket.on('chat message', (msg) => {
    const messageData = {
      type: 'message',
      username: socket.username,
      message: msg,
      timestamp: new Date().toLocaleTimeString()
    };
    saveMessage(messageData);
    // Emit to sender
    socket.emit('chat message', messageData);
    // Broadcast to all other users
    socket.broadcast.emit('chat message', messageData);
  });

  socket.on('image message', (data) => {
    const messageData = {
      type: 'image',
      username: socket.username,
      imagePath: data.imagePath,
      timestamp: new Date().toLocaleTimeString()
    };
    saveMessage(messageData);
    // Emit to sender
    socket.emit('image message', messageData);
    // Broadcast to all other users
    socket.broadcast.emit('image message', messageData);
  });

  socket.on('disconnect', () => {
    console.log(`${socket.username} disconnected`);
    const leaveMessage = {
      type: 'system',
      message: `${socket.username} left the chat`,
      timestamp: new Date().toLocaleTimeString()
    };
    saveMessage(leaveMessage);
    socket.broadcast.emit('user left', leaveMessage);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Chat backend is ready on port ${PORT}`);
  console.log(`Frontend URL: ${FRONTEND_URL}`);
});
