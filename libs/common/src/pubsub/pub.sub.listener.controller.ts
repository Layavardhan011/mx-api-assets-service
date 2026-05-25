import { CacheService } from "@multiversx/sdk-nestjs-cache";
import { Controller, Logger } from "@nestjs/common";
import { EventPattern } from "@nestjs/microservices";

@Controller()
export class PubSubListenerController {
  private logger: Logger;

  constructor(
    private readonly cacheService: CacheService,
  ) {
    this.logger = new Logger(PubSubListenerController.name);
  }

  @EventPattern('deleteCacheKeys')
  async deleteCacheKey(keys: string[]) {
    // S6: Validate PubSub input — prevent arbitrary cache deletion from malformed messages
    if (!Array.isArray(keys)) {
      this.logger.warn('deleteCacheKeys received non-array payload, ignoring');
      return;
    }

    const MAX_BATCH = 100;
    const MAX_KEY_LENGTH = 256;
    const validKeys = keys
      .filter((k): k is string => typeof k === 'string' && k.length > 0 && k.length <= MAX_KEY_LENGTH)
      .slice(0, MAX_BATCH);

    if (validKeys.length !== keys.length) {
      this.logger.warn(`deleteCacheKeys: filtered ${keys.length - validKeys.length} invalid key(s), capped at ${MAX_BATCH}`);
    }

    for (const key of validKeys) {
      this.logger.log(`Deleting local cache key ${key}`);
      await this.cacheService.deleteLocal(key);
    }
  }
}
