import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// During local development the proxy_service runs on :8080. We proxy the auth,
// API and WebSocket paths to it so the browser sees a single origin — that
// keeps the httpOnly session cookie same-origin and avoids CORS entirely.
//
// In production the app talks to the proxy_service directly via VITE_PROXY_BASE
// (a different origin), relying on SameSite=None cookies + the proxy CORS
// allowlist instead.
const PROXY_TARGET = process.env.VITE_DEV_PROXY_TARGET || 'http://localhost:8080';

// The Unity WebGL build lives in a GCS bucket that only allows a fixed CORS
// origin allowlist. We reverse-proxy /unity to it so the browser loads the
// assets same-origin (no CORS). Mirrors the production server.js behavior.
const UNITY_UPSTREAM =
  process.env.UNITY_UPSTREAM || 'https://storage.googleapis.com/assets-athena-app';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/auth': { target: PROXY_TARGET, changeOrigin: true },
      '/api': { target: PROXY_TARGET, changeOrigin: true },
      '/ws': { target: PROXY_TARGET, changeOrigin: true, ws: true },
      '/unity': { target: UNITY_UPSTREAM, changeOrigin: true },
    },
  },
});
