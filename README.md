# Vortex

A scalable, production-live real-time chat application. Discord-style channels, live presence, and typing indicators over Socket.IO, with a resilient persistence pipeline built on Kafka + PostgreSQL.

**Live:** [https://vortex-web-three.vercel.app](https://vortex-web-three.vercel.app) · Backend: [https://vortex-xxvl.onrender.com](https://vortex-xxvl.onrender.com) (`/healthz`)

## Features

- **Discord-style UI** — channel sidebar, chat pane, member list with online presence, avatar hues, dark theme
- **Real-time channels** — `# general`, `# gaming`, `# music`, `# tech`, `# watercooler` (configurable via `CHANNELS`)
- **Presence + typing** — per-room online roster broadcast, throttled typing indicators, room-scoped message delivery
- **Auth** — JWT-based (`/auth/join`), enforced on REST + Socket.IO handshake, CORS allowlist
- **Hardened** — rate limiting, connection caps, zod env validation (fail-fast), websocket-only transport, pino structured logging, `/metrics` (prom-client)
- **Durable messaging** — every message flows through Kafka (`MESSAGES` topic) to an idempotent consumer that persists to PostgreSQL and broadcasts to the whole room
- **Simulator** — a persona bot fleet that signs up, joins channels, and chats (typing bursts, channel roaming), making the app feel alive from login

## Tech Stack

- **Node.js + TypeScript** — backend (Express + Socket.IO + kafkajs + ioredis + Prisma)
- **Next.js 14** (App Router) — frontend
- **Kafka** — durable message queue (KRaft, SASL_SSL), consumer groups per instance
- **Redis** — Socket.IO adapter (cross-instance pub/sub)
- **PostgreSQL** — persistence via Prisma (`users`, `rooms`, `messages`, `room_memberships`)
- **TurboRepo** — monorepo (`apps/server`, `apps/web`, `simulator`)
- **Docker Compose** — self-hosted backing store on AWS EC2

## Architecture

```
Browser (Next.js)
   │  Socket.IO  (websocket, JWT-auth'd, room-scoped)
   ▼
Socket.IO servers ─── Redis adapter ───► broadcast to all clients in a room
   │  on message
   ▼
Kafka  (topic: MESSAGES, SASL_SSL, one partition)
   │
   ▼
Consumer (idempotent upsert by messageId) ──► PostgreSQL
   └──► broadcast message + presence back through the Redis adapter
```

Message handling is **exactly-once from the app's perspective**: `messageId` is a unique key and the consumer upserts by it, so replays/duplicates are harmless. Multiple server instances can run against the same Kafka topic + Redis adapter without double-persisting or splitting a room.

## Hosted infrastructure (AWS EC2 `44.200.72.5`)

- PostgreSQL 16, Redis 7 (requirepass), Kafka 3.9 KRaft — TLS (SASL_SSL) on the public listener
- Backend deployed on **Render**; frontend deployed on **Vercel**; bot simulator runs as a container on EC2 (`restart: unless-stopped`, connects outbound-only to the backend)
- Secrets live in `/app/.env.prod` on EC2, never committed

## Getting Started (local dev)

Backend + frontend dev mode (expects the backing store reachable via env):

```bash
npm install
cd apps/server && npm run dev   # or: node dist/index.js
cd apps/web && npm run dev
```

Local consumers run in a **separate Kafka consumer group** (`vortex-messages-local`) so they don't steal partitions from the deployed backend.

Simulator (runs personas against a backend URL):

```bash
cd simulator && npm install
BACKEND_URL=http://localhost:5000 node index.js
```

## Project structure

```
apps/server     Express + Socket.IO backend (prisma/, src/{app,index,socket,kafka,redis,auth,metrics,env,types})
apps/web        Next.js frontend (context/SocketProvider.tsx, app/page.tsx)
simulator       persona bot fleet (socket.io-client, personas with message corpora)
terraform       EC2 bootstrap (aspirational)
```

## API

| Endpoint | Method | Auth | Purpose |
| --- | --- | --- | --- |
| `/healthz` | GET | — | health check (uptime) |
| `/metrics` | GET | — | prom-client metrics |
| `/auth/join` | POST | — | issue JWT + return/create user (`{name}`) |
| `/channels` | GET | Bearer | list channels |
| `/messages?roomId=&limit=` | GET | Bearer | message history for a room |
| `/messages` | POST | Bearer | send a message |

## License

MIT