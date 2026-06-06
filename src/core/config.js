/**
 * Global configuration for FireGuard.
 * VITE_SOCKET_URL: The URL of the Socket.io signaling server.
 * In development, defaults to the current origin (usually proxied via Vite to localhost:3001).
 * In production, it should be set via environment variable in the Vercel dashboard.
 */

export const config = {
  socketUrl: import.meta.env.VITE_SOCKET_URL || window.location.origin,
  socketPath: '/socket.io'
};

export default config;
