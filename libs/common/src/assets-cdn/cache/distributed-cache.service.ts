import { Injectable, Logger } from "@nestjs/common";
import { CacheService } from "@multiversx/sdk-nestjs-cache";

@Injectable()
export class DistributedCacheService {
  private readonly logger = new Logger(DistributedCacheService.name);

  constructor(private readonly cachingService: CacheService) {}

  async get<T>(key: string): Promise<T | null> {
    try {
      const val = await this.cachingService.get<T>(key);
      return val ?? null;
    } catch (err: unknown) {
      this.logger.error(`Error reading key ${key} from CacheService: ${err instanceof Error ? err.message : err}`);
      return null;
    }
  }

  async set(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
    try {
      await this.cachingService.set(key, value, ttlSeconds ?? 900);
    } catch (err: unknown) {
      this.logger.error(`Error writing key ${key} to CacheService: ${err instanceof Error ? err.message : err}`);
    }
  }

  async isReady(): Promise<boolean> {
    try {
      await this.cachingService.getRemote('health:ping');
      return true;
    } catch {
      return false;
    }
  }

  async isRedisConnected(): Promise<boolean> {
    try {
      await this.cachingService.getRemote('health:ping');
      return true;
    } catch {
      return false;
    }
  }
}
