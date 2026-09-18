# syntax=docker/dockerfile:1
#
# Build context is the REPO ROOT (the npm workspace root), so build with:
#   docker build -f apps/server/Dockerfile .
#   docker compose up --build            # uses this file via docker-compose.yml

# ---------------------------------------------------------------------------
# Build stage: install the workspace dependency tree and compile TypeScript
# ---------------------------------------------------------------------------
FROM node:20-slim AS build

# openssl is required by the Prisma query/schema engines on slim images
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Manifests first so the (slow) install layer is cached independently of source changes
COPY package.json package-lock.json turbo.json ./
COPY apps/server/package.json apps/server/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/eslint-config/package.json packages/eslint-config/package.json
COPY packages/typescript-config/package.json packages/typescript-config/package.json
COPY packages/ui/package.json packages/ui/package.json

# No --omit=dev: the server build needs tsc + prisma (devDependencies).
# `prisma generate` runs as part of the server workspace postinstall and only needs
# DATABASE_URL to be present/resolvable — it does not connect to a database.
ENV DATABASE_URL="postgresql://ci:ci@localhost:5432/vortex"
ENV NODE_ENV=development
RUN npm ci --workspace=server

COPY apps/server ./apps/server

RUN npm run build --workspace=server

# ---------------------------------------------------------------------------
# Runtime stage: only the compiled output, Prisma schema and installed deps
# ---------------------------------------------------------------------------
FROM node:20-slim AS runner

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl tini \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
# Overridden to "development" by docker-compose.yml for credential-free local runs.
ENV NODE_ENV=production

COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/apps/server/dist ./apps/server/dist
COPY --from=build --chown=node:node /app/apps/server/prisma ./apps/server/prisma
COPY --from=build --chown=node:node /app/apps/server/package.json ./apps/server/package.json

# CMD is relative to this WORKDIR; node_modules resolves by walking up to /app
WORKDIR /app/apps/server

USER node

EXPOSE 5000

# tini forwards signals (SIGTERM/SIGINT) so the graceful shutdown in src/index.ts runs
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "dist/index.js"]
