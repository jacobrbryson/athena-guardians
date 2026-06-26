# Guardians

The Guardians frontend for the **Lake Norman Guardians / Rescue Ratatouille**
augmented-reality adventure system. A mobile-first, cinematic React app where
**Athena** (the shared Unity/WebGL companion) is the main interface.

It authenticates Guardians with a Guardian ID + Guardian Secret, runs on a
JWT session stored in an httpOnly cookie, and reuses the existing Athena
chat / WebSocket / Unity behavior from the `marketing/` app.

---

## How it fits in the Athena monorepo

```
guardians/      ← this app (React + Vite)         talks to →  proxy_service
proxy_service/  ← auth + reverse proxy + WS        talks to →  core_api
core_api/       ← MySQL, sessions, chat, guardians
```

- **Auth:** `guardians` → `POST /auth/guardian-login` on `proxy_service`. The
  proxy validates the credentials against `core_api`
  (`POST /auth/guardian/validate`, which holds the hashed secrets), then mints a
  24h JWT and sets it as an **httpOnly, Secure, SameSite cookie** (`guardian_session`).
- **Chat / Athena:** reuses the existing `proxy_service` endpoints
  (`/api/v1/session`, `/api/v1/message`) and the `/ws` WebSocket. The proxy and
  WS handler accept the session **cookie** in addition to the legacy bearer
  token, so no JWT is ever exposed to JavaScript.

---

## Authentication flow

| Route             | Unauthenticated                                   | Authenticated            |
| ----------------- | ------------------------------------------------- | ------------------------ |
| `/`               | Guardian ID entry → (glitch) → Guardian Secret    | Athena console           |
| `/:guardian_id`   | Skips ID step; Secret entry with ID pre-filled    | Redirects to `/`         |
| `/q/:token`       | Redeems a single-use QR token, then → Athena      | Redirects to `/`         |

- **Guardian ID:** exactly 8 numeric digits.
- **Guardian Secret:** exactly 6 alpha-numeric characters.
- Invalid credentials always show the generic message
  `Guardian credentials not recognized.` — the UI and API never reveal which
  field was wrong.

- **QR login (`/q/:token`):** a single-use, expiring token — **not** the
  permanent secret, which never appears in a URL. It is issued out-of-band
  (`core_api/db/issue-guardian-token.js`) and redeemed via
  `POST /auth/guardian-qr-login` → `core_api POST /auth/guardian/redeem-token`,
  which consumes it atomically (a second redeem fails). A spent/expired/unknown
  token drops the Guardian to the manual gate. Mint one with:
  `node db/issue-guardian-token.js <guardian_id> --base https://<guardians-host>`.

---

## Local development

Prereqs: the `proxy_service` (on `:8080`) and `core_api` running, with the DB
migrated and seeded (see below).

```bash
cd guardians
npm install
npm run dev          # Vite on http://localhost:3000
```

The Vite dev server proxies `/auth`, `/api`, and `/ws` to the proxy
(`VITE_DEV_PROXY_TARGET`, default `http://localhost:8080`) so the session
cookie stays same-origin and there is no CORS to configure.

### Database: migrate + seed guardians (in `core_api`)

```bash
cd core_api
npm run migrate                 # applies 0005_guardian_credentials
npm run seed:guardians:test     # loads db/guardians.test.json
# or load your own JSON:
node db/seed-guardians.js /path/to/guardians.json
```

Test credentials (from `db/guardians.test.json`):

| Guardian ID | Secret  | Adventure              | Type           |
| ----------- | ------- | ---------------------- | -------------- |
| `12345678`  | `A1B2C3`| lake_norman_guardians  | guardian       |
| `87654321`  | `Z9Y8X7`| rescue_ratatouille     | civilian_group |

---

## Build

```bash
npm run build        # outputs ./dist
npm run typecheck    # optional: tsc --noEmit
npm start            # serve ./dist via server.js on PORT (default 8080)
```

---

## Environment variables

`VITE_*` values are **inlined at build time** (Vite), so for Cloud Run they are
passed as Docker `--build-arg`s (see `cloudbuild.yaml`), not as runtime env vars.

| Variable                  | Used by   | Default                                                    | Notes                                                                 |
| ------------------------- | --------- | ---------------------------------------------------------- | --------------------------------------------------------------------- |
| `VITE_PROXY_BASE`         | build     | `""` (same origin)                                         | Public `proxy_service` URL in prod. Empty in dev (Vite proxies).      |
| `VITE_UNITY_ASSET_BASE`   | build     | `https://storage.googleapis.com/assets-athena-app/unity`   | Where the Unity `Build/` directory lives.                             |
| `VITE_DEV_PROXY_TARGET`   | dev only  | `http://localhost:8080`                                     | Where the dev server forwards `/auth`, `/api`, `/ws`.                 |
| `PORT`                    | runtime   | `8080`                                                      | Cloud Run sets this; `server.js` binds to it.                         |

### Proxy-side env vars this app depends on (`proxy_service`)

| Variable                       | Purpose                                                                 |
| ------------------------------ | ----------------------------------------------------------------------- |
| `JWT_SECRET`                   | Signs/verifies the Guardian session JWT (already required).             |
| `CORS_ALLOWED_ORIGINS`         | Comma-separated origins allowed to send the credentialed cookie. **Set this to the deployed Guardians origin in production.** |
| `GUARDIAN_SESSION_COOKIE`      | Cookie name (default `guardian_session`).                               |
| `GUARDIAN_SESSION_TTL_HOURS`   | Session lifetime (default `24`).                                        |
| `GUARDIAN_LOGIN_WINDOW_MS`     | Failed-login throttle window (default 15 min).                          |
| `GUARDIAN_LOGIN_MAX_FAILURES`  | Max failed logins per IP per window (default `10`).                     |

> **Production cross-site cookies:** Cloud Run gives each service its own
> `*.run.app` origin, which is cross-**site**. The proxy therefore sets the
> cookie `SameSite=None; Secure` in Cloud Run, and you must add the Guardians
> origin to `CORS_ALLOWED_ORIGINS` on the proxy. (Putting both services behind
> one domain removes this requirement.)

---

## Deploy to Cloud Run

```bash
# From guardians/ — build, push, deploy via Cloud Build:
gcloud builds submit --config cloudbuild.yaml \
  --substitutions=_VITE_PROXY_BASE=https://YOUR-proxy-url,_VITE_UNITY_ASSET_BASE=https://storage.googleapis.com/assets-athena-app/unity
```

Or build/deploy the container directly:

```bash
docker build \
  --build-arg VITE_PROXY_BASE=https://YOUR-proxy-url \
  --build-arg VITE_UNITY_ASSET_BASE=https://storage.googleapis.com/assets-athena-app/unity \
  -t athena-guardians .
gcloud run deploy athena-guardians --image athena-guardians --region us-central1 --allow-unauthenticated
```

- **Port binding:** `server.js` listens on `process.env.PORT` (Cloud Run sets it).
- **Health check:** `GET /healthz` → `{ "status": "ok" }`.
- **SPA routing:** `server.js` falls back to `index.html` so `/:guardian_id`
  and the Phase 2 routes survive a hard refresh.

After deploying, set `CORS_ALLOWED_ORIGINS` on the proxy to include this app's
Cloud Run URL.

---

## Feature notes

- **Voice input** is click-on / click-off (toggle), not hold-to-talk. Uses the
  Web Speech API; a final transcript is sent hands-free. Hidden where unsupported.
- **Athena's replies are read aloud by default** (SpeechSynthesis). One button
  mutes/unmutes; the preference persists in `localStorage`. TTS failures never
  block chat.
- **Unity Athena** is loaded from `VITE_UNITY_ASSET_BASE` and driven by the same
  bridge protocol as `marketing/` (`athena-unity-ready-for-websocket` →
  `AthenaSocketBridge.ConfigureWebSocket/ConnectWebSocket`).

## Phase 2 (Guardian Network) readiness

`/missions`, `/archive`, `/relics`, and `/evidence` are already registered as
**protected** routes (rendering a placeholder) in `src/App.tsx`. Building them
out is dropping in a real component — no routing or auth rework required.
