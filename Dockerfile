# syntax=docker/dockerfile:1

# ------------------------------------------------------------------
# Stage 1 — Build: install deps and compile the SDK + dApp
# ------------------------------------------------------------------
FROM node:22-alpine AS build

WORKDIR /app

# Copy manifests first for better layer caching
COPY package.json package-lock.json ./
COPY packages/core-sdk/package.json packages/core-sdk/package.json
COPY packages/dapp/package.json packages/dapp/package.json

# Install all workspace dependencies (deterministic via lockfile)
RUN npm ci

# Build-time environment. Vite inlines VITE_* variables at build time,
# so these are ARGs (overridable via docker-compose / --build-arg).
ARG VITE_STELLAR_NETWORK=testnet
ARG VITE_SOROBAN_RPC_URL=
ARG VITE_CONTRACT_ID=
ARG VITE_HORIZON_URL=
ARG VITE_DEBUG=false
ENV VITE_STELLAR_NETWORK=$VITE_STELLAR_NETWORK \
    VITE_SOROBAN_RPC_URL=$VITE_SOROBAN_RPC_URL \
    VITE_CONTRACT_ID=$VITE_CONTRACT_ID \
    VITE_HORIZON_URL=$VITE_HORIZON_URL \
    VITE_DEBUG=$VITE_DEBUG

# Copy the full source tree and build
COPY . .
RUN npm run build

# ------------------------------------------------------------------
# Stage 2 — Runtime: serve the static bundle with nginx
# ------------------------------------------------------------------
FROM nginx:1.27-alpine AS runtime

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/packages/dapp/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1/ >/dev/null 2>&1 || exit 1

CMD ["nginx", "-g", "daemon off;"]
