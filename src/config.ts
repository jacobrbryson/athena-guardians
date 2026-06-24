/**
 * Runtime configuration, sourced from Vite env vars (build-time) with safe
 * defaults for local development.
 */

// Base URL of the proxy_service. Empty string ('') = same origin, which is the
// local-dev setup (Vite proxies /auth, /api and /ws to the proxy). In
// production set VITE_PROXY_BASE to the deployed proxy_service URL.
export const PROXY_BASE: string = (import.meta.env.VITE_PROXY_BASE ?? '').replace(
  /\/$/,
  ''
);

// Base URL where the Unity WebGL build lives (the `Build/` directory sits under
// this path). Defaults to the SAME-ORIGIN path '/unity', which both the Vite
// dev server and the production server.js reverse-proxy to the shared GCS
// bucket. Serving the assets same-origin avoids CORS (the bucket only allows a
// fixed origin allowlist) without copying ~126MB into this app. Override with
// VITE_UNITY_ASSET_BASE to point at a CORS-enabled CDN/bucket directly.
export const UNITY_ASSET_BASE: string = (
  import.meta.env.VITE_UNITY_ASSET_BASE ?? '/unity'
).replace(/\/$/, '');

// Supported adventures.
export const ADVENTURE_KEYS = ['lake_norman_guardians', 'rescue_ratatouille'] as const;
export type AdventureKey = (typeof ADVENTURE_KEYS)[number];

/** Build a full proxy URL for a path like '/api/v1/session'. */
export function proxyUrl(path: string): string {
  return `${PROXY_BASE}${path}`;
}

/** Build the WebSocket URL for the chat/Unity bridge. */
export function wsUrl(path: string): string {
  const base = PROXY_BASE || window.location.origin;
  return base.replace(/^http/, 'ws') + path;
}
