# Vortex

A scalable real-time chat application using Redis PubSub Architecture along with Kafka for scaling WebSockets.

## Tech Stack

- **Node.js & TypeScript** — Backend
- **Redis** — PubSub for real-time message distribution
- **Kafka** — Message queue for high-throughput handling
- **Prisma + PostgreSQL** — Persistent data storage
- **Socket.IO** — WebSocket connections
- **Next.js** — Frontend
- **TurboRepo** — Monorepo management

## Getting Started

```bash
npm install
npm run dev
```

## Architecture

```
Client → Socket.IO → Redis PubSub → Multiple Servers
                ↘ Kafka → PostgreSQL
```

## License

MIT
