import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

// Track connected cameras: roomId -> socketId
const cameras = {};
// Track admin sockets
const admins = new Set();

io.on('connection', (socket) => {
  console.log('Connected:', socket.id);

  // Camera client registers itself for a room
  socket.on('camera:register', ({ roomId }) => {
    cameras[roomId] = socket.id;
    socket.roomId = roomId;
    socket.isCamera = true;
    console.log(`Camera registered for room ${roomId}`);
    // Notify all admins a new camera is available
    admins.forEach(adminId => {
      io.to(adminId).emit('camera:available', { roomId, socketId: socket.id });
    });
  });

  // Admin registers itself
  socket.on('admin:register', () => {
    admins.add(socket.id);
    socket.isAdmin = true;
    console.log(`Admin registered: ${socket.id}`);
    // Send list of currently active cameras
    socket.emit('camera:list', cameras);
  });

  // WebRTC signaling: offer from admin to camera
  socket.on('webrtc:offer', ({ targetId, offer, roomId }) => {
    io.to(targetId).emit('webrtc:offer', { from: socket.id, offer, roomId });
  });

  // WebRTC signaling: answer from camera to admin
  socket.on('webrtc:answer', ({ targetId, answer }) => {
    io.to(targetId).emit('webrtc:answer', { from: socket.id, answer });
  });

  // ICE candidates
  socket.on('webrtc:ice', ({ targetId, candidate }) => {
    io.to(targetId).emit('webrtc:ice', { from: socket.id, candidate });
  });

  // ── Real detection from camera phone ──────────────────────────────
  socket.on('detection:manual', (data) => {
    const confidence = data.confidence || 0.95;
    const alert = {
      ...data,
      id: `det_${Date.now()}`,
      timestamp: new Date().toISOString(),
      confidence,
      source: 'camera_client',
    };
    
    console.log(`[DETECTION] Room ${data.roomId}: ${data.type} (${Math.round(confidence * 100)}%)`);
    
    // 1. Broadcast to every admin dashboard (CameraGrid)
    admins.forEach(adminId => {
      io.to(adminId).emit('detection:alert', alert);
    });

    // 2. Automatic Escalation for DAF Team (High Confidence)
    if (confidence > 0.4 || data.type === 'fire') {
      console.log(`[ESCALATION] Alert escalated to DAF Team for Room ${data.roomId}`);
      admins.forEach(adminId => {
        io.to(adminId).emit('alert:escalate', {
          roomId: data.roomId,
          type: data.type,
          severity: confidence > 0.8 ? 'high' : 'medium',
          source: 'automated_opencv'
        });
      });
    }
  });

  socket.on('disconnect', () => {
    if (socket.isCamera && socket.roomId) {
      delete cameras[socket.roomId];
      admins.forEach(adminId => {
        io.to(adminId).emit('camera:disconnected', { roomId: socket.roomId });
      });
    }
    if (socket.isAdmin) admins.delete(socket.id);
    console.log('Disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🔥 FireGuard Signaling Server running on port ${PORT}`);
  console.log(`   Admin: http://localhost:5173`);
  console.log(`   Camera: http://<your-ip>:5173/cam\n`);
});
