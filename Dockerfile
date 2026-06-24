# --- Stage 1: Build the Vite SPA ---
FROM node:20-alpine AS builder
WORKDIR /app

# Install all deps (incl. dev) for the build.
COPY package*.json ./
RUN npm install

# Build-time configuration. Vite inlines VITE_* vars at build time, so they
# must be provided as build args (see cloudbuild.yaml / README).
# VITE_UNITY_ASSET_BASE defaults to the same-origin '/unity' path, which
# server.js reverse-proxies to the GCS bucket (avoids CORS).
ARG VITE_PROXY_BASE=""
ARG VITE_UNITY_ASSET_BASE="/unity"
ENV VITE_PROXY_BASE=$VITE_PROXY_BASE
ENV VITE_UNITY_ASSET_BASE=$VITE_UNITY_ASSET_BASE

COPY . .
RUN npm run build

# --- Stage 2: Minimal runtime serving the static build ---
FROM node:20-alpine
WORKDIR /app

# Only the runtime dependency (express) is needed to serve.
COPY package*.json ./
RUN npm install --omit=dev

COPY --from=builder /app/dist ./dist
COPY server.js ./

ENV PORT=8080
EXPOSE 8080
CMD ["npm", "start"]
