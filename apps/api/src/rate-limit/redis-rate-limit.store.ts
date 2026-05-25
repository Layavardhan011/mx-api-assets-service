import IORedis from "ioredis";
import type { Store, Options } from "express-rate-limit";

type RedisRateLimitStoreOptions = {
  host: string;
  port: number;
  password?: string;
  prefix?: string;
};

export class RedisRateLimitStore implements Store {
  localKeys = false;
  windowMs = 60_000;
  readonly prefix: string;
  private readonly redis: IORedis;

  constructor(options: RedisRateLimitStoreOptions) {
    this.prefix = options.prefix ?? "rate-limit:";
    this.redis = new IORedis({
      host: options.host,
      port: options.port,
      password: options.password,
      maxRetriesPerRequest: 2,
      enableOfflineQueue: true,
      lazyConnect: true,
    });
  }

  init(options: Options): void {
    this.windowMs = options.windowMs;
    // Fire-and-forget connect; express-rate-limit does not await init.
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    this.redis.connect().catch(() => undefined);
  }

  private key(key: string): string {
    return `${this.prefix}${key}`;
  }

  async increment(key: string) {
    const redisKey = this.key(key);
    const now = Date.now();

    const script = `
      local current = redis.call("INCR", KEYS[1])
      local ttl = redis.call("PTTL", KEYS[1])
      if ttl < 0 then
        redis.call("PEXPIRE", KEYS[1], ARGV[1])
        ttl = ARGV[1]
      end
      return {current, ttl}
    `;

    const result = (await this.redis.eval(script, 1, redisKey, String(this.windowMs))) as [number, number];
    const totalHits = Number(result[0] ?? 0);
    const ttlMs = Number(result[1] ?? this.windowMs);
    const resetTime = Number.isFinite(ttlMs) ? new Date(now + Math.max(0, ttlMs)) : undefined;

    return { totalHits, resetTime };
  }

  async decrement(key: string) {
    const redisKey = this.key(key);
    try {
      const val = await this.redis.decr(redisKey);
      if (typeof val === "number" && val <= 0) {
        await this.redis.del(redisKey);
      }
    } catch {
      // best-effort
    }
  }

  async resetKey(key: string) {
    try {
      await this.redis.del(this.key(key));
    } catch {
      // best-effort
    }
  }

  async shutdown() {
    try {
      await this.redis.quit();
    } catch {
      // best-effort
    }
  }
}

