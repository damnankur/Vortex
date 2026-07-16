import { Server } from "socket.io";
import Redis from "ioredis";
import { produceMesage } from "./kafka";

const REDIS_HOST = process.env.REDIS_HOST || "localhost";
const REDIS_PORT = Number(process.env.REDIS_PORT) || 6379;
const REDIS_USER = process.env.REDIS_USER || "default";
const REDIS_PASSWORD = process.env.REDIS_PASSWORD || "";

const redisConfig = {
  host: REDIS_HOST,
  port: REDIS_PORT,
  username: REDIS_USER,
  password: REDIS_PASSWORD,
  retryStrategy: (times: number) => Math.min(times * 200, 5000),
  maxRetriesPerRequest: 3,
  connectTimeout: 5000,
  lazyConnect: true,
};

const publisher = new Redis(redisConfig);
const subscriber = new Redis(redisConfig);

class SocketService {
  private _io: Server;

  constructor() {
    console.log("Socket Server init");
    this._io = new Server({
      cors: {
        allowedHeaders: ["*"],
        origin: "*",
      },
    });

    // Connect to Redis (non-blocking)
    publisher.connect().catch((err) =>
      console.error("Redis publisher connection failed:", err.message)
    );
    subscriber.connect().catch((err) =>
      console.error("Redis subscriber connection failed:", err.message)
    );

    // Subscribe when connected
    subscriber.on("connect", () => {
      console.log("Redis subscriber connected");
      subscriber.subscribe("MESSAGES").catch((err) =>
        console.error("Redis subscribe failed:", err.message)
      );
    });
  }

  public socketListeners() {
    const io = this.io;
    console.log("Init the socket listeners");

    io.on("connect", (socket) => {
      console.log("New socket connection", socket.id);

      socket.on("event: message", async ({ message }: { message: String }) => {
        console.log("New Message Received on server", message);
        try {
          if (publisher.status === "connect") {
            await publisher.publish("MESSAGES", JSON.stringify({ message }));
          } else {
            // Redis down — broadcast directly to all clients
            io.emit("message", JSON.stringify({ message }));
          }
        } catch (err) {
          console.error("Failed to publish to Redis:", err);
          io.emit("message", JSON.stringify({ message }));
        }
      });

      socket.on("disconnect", (reason) => {
        console.log("Socket disconnected:", socket.id, reason);
      });
    });

    // Forward Redis messages to all clients
    subscriber.on("message", async (channel, message) => {
      if (channel === "MESSAGES") {
        console.log("new message from redis", message);
        io.emit("message", message);
        try {
          await produceMesage(message);
          console.log("Message Produced into Kafka Broker");
        } catch (err) {
          console.error("Failed to produce to Kafka:", err);
        }
      }
    });
  }

  get io() {
    return this._io;
  }
}

export default SocketService;
