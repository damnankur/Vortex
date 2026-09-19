import Redis from "ioredis";
import { env } from "../env";
import { logger } from "../lib/logger";

class CacheService {
  private redis: Redis;
  private localCache = new Map<string, { data: string; expiresAt: number }>();
  private isConnected = false;

  constructor() {
    this.redis = new Redis({
      host: env.REDIS_HOST,
      port: env.REDIS_PORT,
      username: env.REDIS_USER,
      password: env.REDIS_PASSWORD || undefined,
      retryStrategy: (times) => Math.min(times * 200, 3000),
      maxRetriesPerRequest: 2,
      connectTimeout: 4000,
      lazyConnect: false,
    });

    this.redis.on("connect", () => {
      this.isConnected = true;
      logger.info("High-speed Redis cache connected");
    });

    this.redis.on("error", (err) => {
      this.isConnected = false;
      logger.warn({ err: err.message }, "Redis cache unavailable, using in-memory fast tier");
    });
  }

  public async get<T>(key: string): Promise<T | null> {
    try {
      if (this.isConnected) {
        const val = await this.redis.get(key);
        if (val) return JSON.parse(val) as T;
      }
    } catch {
      // Fall through to memory
    }

    const local = this.localCache.get(key);
    if (local && local.expiresAt > Date.now()) {
      try {
        return JSON.parse(local.data) as T;
      } catch {
        return null;
      }
    }
    return null;
  }

  public async set(key: string, value: unknown, ttlSeconds = 60): Promise<void> {
    const serialized = JSON.stringify(value);
    this.localCache.set(key, { data: serialized, expiresAt: Date.now() + ttlSeconds * 1000 });

    try {
      if (this.isConnected) {
        await this.redis.setex(key, ttlSeconds, serialized);
      }
    } catch {
      // Memory cache is already populated
    }
  }

  public async del(key: string): Promise<void> {
    this.localCache.delete(key);
    try {
      if (this.isConnected) {
        await this.redis.del(key);
      }
    } catch {
      // ignore
    }
  }

  public async invalidateChannel(roomId: string): Promise<void> {
    const prefix = `vortex:channel:${roomId}`;
    for (const k of this.localCache.keys()) {
      if (k.startsWith(prefix)) {
        this.localCache.delete(k);
      }
    }

    try {
      if (this.isConnected) {
        const keys = await this.redis.keys(`${prefix}*`);
        if (keys.length > 0) {
          await this.redis.del(...keys);
        }
      }
    } catch {
      // ignore
    }
  }
}

export const cache = new CacheService();
export default cache;
