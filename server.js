/**
 * Production static server for the Guardians SPA.
 *
 * Serves the Vite build from ./dist, exposes a health check, and falls back to
 * index.html for client-side routes (so /:guardian_id, /missions, etc. work on
 * a hard refresh). Binds to the Cloud Run-provided PORT.
 */
import path from 'path';
import { Readable } from 'stream';
import { fileURLToPath } from 'url';
import express from 'express';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = process.env.PORT || 8080;
const DIST = path.join(__dirname, 'dist');

// The Unity WebGL build is hosted in a GCS bucket whose CORS policy only allows
// a fixed origin allowlist. Rather than open the bucket up (or copy ~126MB into
// this image), we reverse-proxy /unity to it so the browser loads the assets
// same-origin. Range requests are forwarded so Unity's streaming loader works.
// Bucket root that contains the `unity/` folder. The original '/unity/...' path
// is preserved when proxying (matches the Vite dev-server convention).
const UNITY_UPSTREAM = (
  process.env.UNITY_UPSTREAM || 'https://storage.googleapis.com/assets-athena-app'
).replace(/\/$/, '');

const PASS_THROUGH_HEADERS = [
  'content-type',
  'content-length',
  'accept-ranges',
  'content-range',
  'etag',
  'last-modified',
  'cache-control',
];

// Health check for Cloud Run / uptime probes.
app.get('/healthz', (_req, res) => res.json({ status: 'ok' }));

app.use('/unity', async (req, res) => {
  // req.originalUrl keeps the '/unity' prefix (req.url drops it under the mount).
  const upstreamUrl = `${UNITY_UPSTREAM}${req.originalUrl}`;
  try {
    const headers = {};
    if (req.headers.range) headers.range = req.headers.range;
    const upstream = await fetch(upstreamUrl, { headers });

    res.status(upstream.status);
    for (const h of PASS_THROUGH_HEADERS) {
      const v = upstream.headers.get(h);
      if (v) res.setHeader(h, v);
    }
    if (!upstream.body) {
      res.end();
      return;
    }
    Readable.fromWeb(upstream.body).pipe(res);
  } catch (err) {
    console.error(`[unity proxy] ${upstreamUrl}:`, err.message);
    res.status(502).end('Unity asset proxy error');
  }
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
