/**
 * Production static server for the Guardians SPA.
 *
 * Serves the Vite build from ./dist, exposes a health check, and falls back to
 * index.html for client-side routes (so /:guardian_id, /missions, etc. work on
 * a hard refresh). Binds to the Cloud Run-provided PORT.
 */
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import httpProxy from 'http-proxy';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = process.env.PORT || 8080;
const DIST = path.join(__dirname, 'dist');

// The Unity WebGL build is hosted in a GCS bucket whose CORS policy only allows
// a fixed origin allowlist. Rather than open the bucket up (or copy ~126MB into
// this image), we reverse-proxy /unity to it so the browser loads the assets
// same-origin. UNITY_UPSTREAM is the bucket origin + base path that contains the
// `unity/` folder; the original '/unity/...' request path is appended.
const UNITY_UPSTREAM = (
  process.env.UNITY_UPSTREAM || 'https://storage.googleapis.com/assets-athena-app'
).replace(/\/$/, '');

// Use http-proxy (raw, streaming byte passthrough) rather than a fetch() proxy.
// This preserves Range and Content-* headers verbatim and streams without
// buffering — essential for the ~49MB unity.wasm, which a fetch()-based proxy
// fails to deliver intact on Cloud Run. Mirrors the Vite dev server + proxy_service.
const unityProxy = httpProxy.createProxyServer({
  target: UNITY_UPSTREAM,
  changeOrigin: true, // Host: storage.googleapis.com (GCS virtual hosting)
});
unityProxy.on('error', (err, _req, res) => {
  console.error('[unity proxy]', err.message);
  if (res && !res.headersSent) {
    res.writeHead(502, { 'Content-Type': 'text/plain' });
  }
  res?.end?.('Unity asset proxy error');
});

// Health check for Cloud Run / uptime probes.
app.get('/healthz', (_req, res) => res.json({ status: 'ok' }));

app.use('/unity', (req, res) => {
  // Under the mount, req.url has '/unity' stripped — restore it so the upstream
  // path becomes <bucket base>/unity/Build/... (prependPath keeps the base).
  req.url = `/unity${req.url}`;
  unityProxy.web(req, res);
});

// Hashed assets are immutable; cache them aggressively. index.html is not.
app.use(
  express.static(DIST, {
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('index.html')) {
        res.setHeader('Cache-Control', 'no-cache');
      } else if (/\.[0-9a-f]{8,}\./i.test(path.basename(filePath))) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      }
    },
  })
);

// SPA fallback — every non-asset route returns index.html.
app.get('*', (_req, res) => {
  res.sendFile(path.join(DIST, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Guardians listening on http://localhost:${PORT}`);
});
