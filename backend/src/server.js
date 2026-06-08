require('dotenv').config();
const express = require('express');
const http    = require('http');
const { Server } = require('socket.io');
const cors    = require('cors');
const path    = require('path');
const jwt     = require('jsonwebtoken');
const { connectDB } = require('./config/database');

const app    = express();
const server = http.createServer(app);

// CORS origin(s): '*' by default. Set CORS_ORIGIN to a comma-separated allowlist
// (e.g. https://biodiv.wanirman.dev) to lock down in production / on the OLS VPS.
const corsOrigin = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map(s => s.trim())
  : '*';

const io     = new Server(server, { cors: { origin: corsOrigin, methods: ['GET', 'POST'] } });

app.set('io', io);
app.use(cors({ origin: corsOrigin }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

const uploadDir = path.resolve(process.env.UPLOAD_DIR || './uploads');
require('fs').mkdirSync(uploadDir, { recursive: true });
app.use('/uploads', express.static(uploadDir));

// Serve frontend PWA
app.use(express.static(path.resolve(__dirname, '../../frontend/public')));

app.use('/api/auth',      require('./routes/auth'));
app.use('/api/sighting',  require('./routes/sightings'));
app.use('/api/chat',      require('./routes/chat'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/admin',     require('./routes/admin'));
app.use('/api/external',  require('./routes/external'));
app.get('/api/health', (req, res) => res.json({ status: 'ok', timestamp: new Date() }));

// SPA fallback — serves index.html for any non-API, non-file route
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found' });
  res.sendFile(path.resolve(__dirname, '../../frontend/public/index.html'));
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

// Socket.io — JWT auth gate + chat room
io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error('Authentication required'));
  try {
    socket.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    next(new Error('Invalid token'));
  }
});

io.on('connection', socket => {
  console.log(`[WS] ${socket.user?.user_name} connected`);

  socket.join('biodiversity-chat');

  socket.on('disconnect', () => {
    console.log(`[WS] ${socket.user?.user_name} disconnected`);
  });
});

const PORT = process.env.PORT || 3000;

async function start() {
  await connectDB();
  server.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
}

start().catch(err => { console.error(err); process.exit(1); });
