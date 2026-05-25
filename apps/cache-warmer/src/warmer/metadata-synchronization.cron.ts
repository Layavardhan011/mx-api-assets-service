import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import {
  DistributedCacheService,
  EnvironmentConfigService,
  GithubRepositoryConnector,
  networkMap,
} from "@libs/common";

@Injectable()
export class MetadataSynchronizationCron implements OnModuleInit {
  private readonly logger = new Logger(MetadataSynchronizationCron.name);
  private isSyncing = false;

  constructor(
    private readonly cacheService: DistributedCacheService,
    private readonly configService: EnvironmentConfigService,
    private readonly githubConnector: GithubRepositoryConnector
  ) {}

  onModuleInit() {
    this.logger.log("Warming up Assets CDN cache on startup...");
    // Run sync asynchronously to not block the main application boot
    this.syncAll().catch((err) => {
      this.logger.error(`Initial synchronization failed: ${err.message}`);
    });
  }

  @Cron("*/10 * * * *")
  async handleCron() {
    this.logger.log("Triggered periodic cache synchronization.");
    await this.syncAll();
  }

  /**
   * Orchestrates the global sync across all networks and types
   */
  async syncAll() {
    if (this.isSyncing) {
      this.logger.warn("Sync is already running. Skipping execution.");
      return;
    }

    this.isSyncing = true;
    this.logger.log("--- Starting Global Background Sync ---");

    const networks = ["mainnet", "testnet", "devnet"];
    const types = ["tokens", "identities", "accounts"];

    const syncTasks: Promise<void>[] = [];
    for (const network of networks) {
      for (const type of types) {
        syncTasks.push(this.syncCollection(network, type));
      }
    }

    try {
      await Promise.all(syncTasks);
      this.logger.log("--- Global Background Sync Completed Successfully ---");
    } catch (error: unknown) {
      this.logger.error(`Error during global sync: ${error instanceof Error ? error.message : error}`);
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * Syncs a single collection type for a network and writes it to the distributed cache
   */
  async syncCollection(network: string, type: string): Promise<void> {
    const baseSegment = networkMap[network];
    const path = baseSegment ? `${baseSegment}/${type}` : type;

    this.logger.log(`[Sync] Starting ${network}/${type}...`);

    try {
      const url = `${this.configService.githubApiBase}/contents/${path}?ref=${this.configService.branch}`;
      const response = await this.githubConnector.githubFetch(url);
      const items = await response.json();

      if (!Array.isArray(items)) {
        this.logger.warn(`[Sync] Expected directory array from GitHub, got ${typeof items}. Skipping ${network}/${type}`);
        return;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tasks = items.map((item: any) => async () => {
        if (type === "accounts" && item.name.endsWith(".json") && item.name !== "icons") {
          const address = item.name.replace(".json", "");
          try {
            const fileContent = await this.githubConnector.fetchWithTimeout(item.download_url).then((r) => r.json());
            const accountData = { address, ...fileContent };
            if (fileContent.icon) {
              const netSegment = network === "mainnet" ? "" : `${network}/`;
              accountData.iconPng = `/assets-cdn/${netSegment}accounts/${address}/icon.png`;
              accountData.iconSvg = `/assets-cdn/${netSegment}accounts/${address}/icon.svg`;
            }
            return accountData;
          } catch (e: unknown) {
            this.logger.error(`[Sync] Failed account ${address}: ${e instanceof Error ? e.message : e}`);
            return null;
          }
        } else if ((type === "tokens" || type === "identities") && item.type === "dir") {
          const infoUrl = `${this.configService.githubRawBase}/${item.path}/info.json`;
          try {
            const infoContent = await this.githubConnector.fetchWithTimeout(infoUrl).then((r) => r.json());
            const key = type === "tokens" ? "identifier" : "identity";
            const itemData = { [key]: item.name, ...infoContent };
            const netSegment = network === "mainnet" ? "" : `${network}/`;
            if (type === "tokens") {
              itemData.pngUrl = `/assets-cdn/${netSegment}tokens/${item.name}/icon.png`;
              itemData.svgUrl = `/assets-cdn/${netSegment}tokens/${item.name}/icon.svg`;
            } else if (type === "identities") {
              itemData.avatar = `/assets-cdn/${netSegment}identities/${item.name}/icon.png`;
            }
            return itemData;
          } catch (e: unknown) {
            this.logger.error(`[Sync] Failed ${type} info for ${item.name}: ${e instanceof Error ? e.message : e}`);
            return null;
          }
        }
        return null;
      });

      // P7: Use higher concurrency for authenticated GitHub requests (5000 req/hour limit)
      const concurrency = this.configService.githubToken ? 15 : 5;
      const results = await this.githubConnector.limitConcurrency(tasks, concurrency);
      const filtered = results.filter(Boolean);

      // Save collection directly into the distributed cache layer
      const cacheKey = `assets-cdn:${network}:${type}`;
      await this.cacheService.set(cacheKey, filtered, 900); // P6: 15 min TTL (matches API service)

      this.logger.log(`[Sync] Finished ${network}/${type} (${filtered.length} items cached)`);
    } catch (error: unknown) {
      this.logger.error(`[Sync] Failed ${network}/${type}: HTTP ${(error as { status?: number })?.status || "unknown"} - ${error instanceof Error ? error.message : error}`);
    }
  }
}
