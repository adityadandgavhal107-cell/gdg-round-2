import { io } from 'socket.io-client';
import bus from './EventBus.js';
import config from './config.js';

const STUN_CONFIG = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

class WebRTCManager {
  constructor() {
    this.socket = null;
    this.peers = {}; // roomId -> RTCPeerConnection
    this.streams = {}; // roomId -> MediaStream
    this.onStreamCallback = null;
    this.onDisconnectCallback = null;
  }

  connect(serverUrl = config.socketUrl) {
    this.socket = io(serverUrl, { path: config.socketPath });

    this.socket.on('connect', () => {
      console.log('Signaling connected');
      this.socket.emit('admin:register');
    });

    this.socket.on('camera:list', (cameras) => {
      // A camera is already connected — initiate offers
      Object.entries(cameras).forEach(([roomId, socketId]) => {
        if (socketId) this.#createOffer(roomId, socketId);
      });
    });

    this.socket.on('camera:available', ({ roomId, socketId }) => {
      bus.emit('camera:new', { roomId });
      this.#createOffer(roomId, socketId);
    });

    this.socket.on('camera:disconnected', ({ roomId }) => {
      this.#closePeer(roomId);
      bus.emit('camera:lost', { roomId });
      if (this.onDisconnectCallback) this.onDisconnectCallback(roomId);
    });

    this.socket.on('webrtc:answer', async ({ from, answer }) => {
      const roomId = Object.keys(this.peers).find(rid => {
        const pc = this.peers[rid];
        return pc && pc._remoteId === from;
      });
      if (!roomId || !this.peers[roomId]) return;
      try {
        await this.peers[roomId].setRemoteDescription(new RTCSessionDescription(answer));
      } catch (e) { console.error('Set remote desc error', e); }
    });

    this.socket.on('webrtc:ice', async ({ from, candidate }) => {
      const roomId = Object.keys(this.peers).find(rid => {
        const pc = this.peers[rid];
        return pc && pc._remoteId === from;
      });
      if (!roomId || !this.peers[roomId]) return;
      try {
        await this.peers[roomId].addIceCandidate(new RTCIceCandidate(candidate));
      } catch (e) { console.warn('ICE error', e); }
    });

    // NOTE: detection:alert is already handled by App.jsx which emits detection:raw.
    // Handling it here too would cause AlertEngine to fire twice per detection.
  }

  async #createOffer(roomId, targetId) {
    const pc = new RTCPeerConnection(STUN_CONFIG);
    pc._remoteId = targetId;
    this.peers[roomId] = pc;

    pc.ontrack = (event) => {
      console.log(`[WEBRTC] Track received for Room ${roomId}`, event.streams[0]);
      const [stream] = event.streams;
      this.streams[roomId] = stream;
      bus.emit('camera:stream', { roomId, stream });
      if (this.onStreamCallback) this.onStreamCallback(roomId, stream);
    };

    pc.onicecandidate = ({ candidate }) => {
      if (candidate) {
        console.log(`[WEBRTC] Sending ICE to ${targetId}`);
        this.socket.emit('webrtc:ice', { targetId, candidate });
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        this.#closePeer(roomId);
      }
    };

    try {
      const offer = await pc.createOffer({ offerToReceiveVideo: true, offerToReceiveAudio: true });
      await pc.setLocalDescription(offer);
      this.socket.emit('webrtc:offer', { targetId, offer, roomId });
    } catch (e) { console.error('Offer error', e); }
  }

  #closePeer(roomId) {
    if (this.peers[roomId]) {
      this.peers[roomId].close();
      delete this.peers[roomId];
    }
    delete this.streams[roomId];
  }

  onStream(cb) { this.onStreamCallback = cb; }
  onDisconnect(cb) { this.onDisconnectCallback = cb; }
  getStream(roomId) { return this.streams[roomId] || null; }
  isConnected() { return !!(this.socket && this.socket.connected); }
  disconnect() { if (this.socket) { this.socket.disconnect(); this.socket = null; } }
}

export const webRTCManager = new WebRTCManager();
export default webRTCManager;
