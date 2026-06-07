import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [
    react(),
  ],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') }
  },
  build: {
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
        cam: path.resolve(__dirname, 'cam.html'),
        guest: path.resolve(__dirname, 'guest.html'),
        daf: path.resolve(__dirname, 'daf.html'),
      }
    }
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      // 1. Existing WebSocket / real-time event pipeline channel proxy
      '/socket.io': {
        target: 'http://127.0.0.1:3001',
        ws: true,
        changeOrigin: true
      },
      // 2. NEW: FastAPI / SQLAlchemy REST authentication interface bridge
      '/api/v1': {
        target: 'http://127.0.0.1:8000', // Points directly to your Uvicorn backend port
        changeOrigin: true,
        secure: false,
      }
    }
  }
});