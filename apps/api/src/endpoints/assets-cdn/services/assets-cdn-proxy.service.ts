import { Injectable, Logger, HttpStatus, OnModuleInit } from "@nestjs/common";
import {
  DistributedCacheService,
  EnvironmentConfigService,
  GithubRepositoryConnector,
  getGithubPath,
  getRawUrl,
  resolveParams,
  sanitize,
  networkMap,
  HttpError,
} from "@libs/common";
import * as fs from "fs";
import * as path from "path";

interface GithubRepoItem {
  name: string;
  type: string;
  download_url: string;
  path: string;
}

const MAX_ICON_SIZE = 2 * 1024 * 1024; // S5: 2MB max icon size

@Injectable()
export class AssetsCdnProxyService implements OnModuleInit {
  private readonly logger = new Logger(AssetsCdnProxyService.name);
  private isSyncing = false;
  private defaultPng: Buffer | null = null;
  private defaultSvg: Buffer | null = null;

  constructor(
    private readonly cacheService: DistributedCacheService,
    private readonly configService: EnvironmentConfigService,
    private readonly githubConnector: GithubRepositoryConnector
  ) {}

  async onModuleInit() {
    // P3: Preload default fallback icons into memory once (avoid sync fs on every request)
    const basePath = path.join(process.cwd(), "apps", "api", "src", "assets", "default-images");
    try { this.defaultPng = await fs.promises.readFile(path.join(basePath, "default.png")); } catch { /* no default PNG available */ }
    try { this.defaultSvg = await fs.promises.readFile(path.join(basePath, "default.svg")); } catch { /* no default SVG available */ }
    if (this.defaultPng || this.defaultSvg) {
      this.logger.log(`Preloaded default fallback icons (PNG: ${!!this.defaultPng}, SVG: ${!!this.defaultSvg})`);
    }

    // P5: Only run initial cache warm-up here; periodic sync is handled by the jobs-service cron
    this.logger.log("Starting initial cache warm-up...");
    this.syncAll().catch((err) => {
      this.logger.error(`Initial sync failed: ${err.message}`);
    });
  }

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

      const tasks = items.map((item: GithubRepoItem) => async () => {
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

      // Use configurable concurrency (defaults preserved)
      const concurrency = this.configService.githubSyncConcurrency ?? (this.configService.githubToken ? 50 : 15);
      const results = await this.githubConnector.limitConcurrency(tasks, concurrency);
      const filtered = results.filter(Boolean);
      const cacheKey = `assets-cdn:${network}:${type}`;
      await this.cacheService.set(cacheKey, filtered, 900); // 15 min TTL

      // Performance: also store an indexed view for O(1) lookups in getItem()
      // Keep TTL consistent with the collection cache to preserve behavior.
      const matchKey = type === "accounts" ? "address" : (type === "tokens" ? "identifier" : "identity");
      const index: Record<string, Record<string, unknown>> = {};
      for (const item of filtered) {
        if (item && typeof item === "object") {
          const keyVal = (item as Record<string, unknown>)[matchKey];
          if (typeof keyVal === "string" && keyVal.length > 0) {
            index[keyVal] = item as Record<string, unknown>;
          }
        }
      }
      await this.cacheService.set(`${cacheKey}:index`, index, 900);

      this.logger.log(`[Sync] Finished ${network}/${type} (${filtered.length} items cached)`);
    } catch (error: unknown) {
      this.logger.error(`[Sync] Failed ${network}/${type}: ${error instanceof Error ? error.message : error}`);
    }
  }

  async syncAll() {
    if (this.isSyncing) {
      this.logger.warn("Sync is already running. Skipping execution.");
      return;
    }
    this.isSyncing = true;
    this.logger.log("--- Starting Global Background Sync ---");
    const networks = ["mainnet", "testnet", "devnet"];
    const types = ["tokens", "identities", "accounts"];
    try {
      const tasks = networks.flatMap((network) =>
        types.map((type) => async () => {
          await this.syncCollection(network, type).catch((err) => {
            this.logger.error(`[Sync] Unhandled error in ${network}/${type}: ${err.message}`);
          });
        })
      );

      // Reduce burstiness against GitHub by limiting how many network/type syncs run at once.
      const syncAllConcurrency =
        this.configService.githubSyncAllConcurrency ?? (this.configService.githubToken ? 4 : 2);
      await this.githubConnector.limitConcurrency(tasks, syncAllConcurrency);

      const ready = await this.isReady();
      this.logger.log(`--- Global Background Sync Completed. Cache ready: ${ready} ---`);
    } catch (error: unknown) {
      this.logger.error(`Error during global sync: ${error instanceof Error ? error.message : error}`);
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * Check if sync is ready. If no data has been synchronised yet, returns false.
   */
  async isReady(network: string = "mainnet", type: string = "tokens"): Promise<boolean> {
    const hasData = await this.cacheService.get(`assets-cdn:${network}:${type}`);
    return hasData !== null;
  }

  /**
   * Helper to format relative CDN URLs into absolute ones using request host or CDN_BASE_URL.
   */
  resolveUrls<T>(data: T, baseUrl?: string): T {
    const resolvedBase = baseUrl || this.configService.cdnBaseUrl;
    if (!resolvedBase || !data) return data;

    const walk = (val: unknown): unknown => {
      if (!val) return val;
      if (Array.isArray(val)) return val.map(walk);
      if (typeof val === "object") {
        const copy: Record<string, unknown> = { ...(val as Record<string, unknown>) };
        for (const key in copy) {
          if (typeof copy[key] === "string" && (copy[key] as string).startsWith("/assets-cdn/")) {
            copy[key] = `${resolvedBase}${copy[key]}`;
          } else if (typeof copy[key] === "object" && copy[key] !== null) {
            copy[key] = walk(copy[key]);
          }
        }
        return copy;
      }
      return val;
    };

    return walk(data) as T;
  }

  /**
   * Fetch a full collection from Cache
   */
  async getCollection(p1: string, p2?: string, baseUrl?: string): Promise<Record<string, unknown>[] | null> {
    const { network, type } = resolveParams({ p1, p2 });
    const cacheKey = `assets-cdn:${network}:${type}`;
    const items = await this.cacheService.get<Record<string, unknown>[]>(cacheKey);
    return items ? this.resolveUrls(items, baseUrl) : null;
  }

  /**
   * Fetch a single item by key (fallback to Github if cache miss)
   */
  async getItem(p1: string, p2: string, p3?: string, p4?: string, baseUrl?: string): Promise<unknown> {
    const { network, type } = resolveParams({ p1, p2, p3 });
    let { id } = resolveParams({ p1, p2, p3 });
    if (p4) id = p3 || "";

    // 1. Try Cache first
    const cacheKey = `assets-cdn:${network}:${type}`;
    const matchKey = type === "accounts" ? "address" : (type === "tokens" ? "identifier" : "identity");

    // Fast-path: indexed lookup (newer deployments)
    const index = await this.cacheService.get<Record<string, Record<string, unknown>>>(`${cacheKey}:index`);
    const indexedHit = index ? index[id] : undefined;
    if (indexedHit) {
      return this.resolveUrls(indexedHit, baseUrl);
    }

    // Backwards compatible: fall back to scanning the collection array
    const items = await this.cacheService.get<Record<string, unknown>[]>(cacheKey);
    if (items) {
      const matched = items.find((item: Record<string, unknown>) => item[matchKey] === id);
      if (matched) {
        return this.resolveUrls(matched, baseUrl);
      }
    }

    // 2. Cache Miss: Fetch directly from Github Raw
    const path = getGithubPath(network, type, id);
    this.logger.log(`Cache miss. Fetching fallback item directly from GitHub: ${path}`);

    try {
      const url = `${this.configService.githubRawBase}/${path}`;
      const response = await this.githubConnector.fetchWithTimeout(url);
      if (!response.ok) {
        if (response.status === 404) {
          throw new HttpError(HttpStatus.NOT_FOUND, "Not found");
        }
        throw new HttpError(response.status, `GitHub fetch failed: ${response.status}`);
      }

      const content = await response.json();
      const matchKey = type === "accounts" ? "address" : (type === "tokens" ? "identifier" : "identity");
      const result: Record<string, unknown> = { [matchKey]: id, ...content };

      const netSegment = network === "mainnet" ? "" : `${network}/`;
      if (type === "tokens") {
        result.pngUrl = `/assets-cdn/${netSegment}tokens/${id}/icon.png`;
        result.svgUrl = `/assets-cdn/${netSegment}tokens/${id}/icon.svg`;
      } else if (type === "identities") {
        result.avatar = `/assets-cdn/${netSegment}identities/${id}/icon.png`;
      } else if (type === "accounts" && content.icon) {
        result.iconPng = `/assets-cdn/${netSegment}accounts/${id}/icon.png`;
        result.iconSvg = `/assets-cdn/${netSegment}accounts/${id}/icon.svg`;
      }

      return this.resolveUrls(result, baseUrl);
    } catch (error: unknown) {
      if (error instanceof HttpError) {
        throw error;
      }
      this.logger.error(`Error in fallback fetch for ${path}: ${error instanceof Error ? error.message : error}`);
      throw new HttpError(HttpStatus.INTERNAL_SERVER_ERROR, "Internal Server Error");
    }
  }

  /**
   * Fetch asset icon/logo binary
   */
  async getIcon(p1: string, p2: string, p3?: string, p4?: string, defaultIcon?: string): Promise<{ buffer: Buffer; mimeType: string }> {
    const { p1: cleanP1, p2: cleanP2, p3: cleanP3, p4: cleanP4 } = {
      p1: sanitize(p1),
      p2: sanitize(p2),
      p3: sanitize(p3),
      p4: sanitize(p4),
    };

    const { network, type } = resolveParams({ p1: cleanP1, p2: cleanP2, p3: cleanP3 });
    let { id } = resolveParams({ p1: cleanP1, p2: cleanP2, p3: cleanP3 });
    const fileName = cleanP4 || cleanP3 || "";
    const parts = fileName.split(".");
    const ext = parts.length > 1 ? parts[parts.length - 1] : "";

    if (ext !== "svg" && ext !== "png") {
      throw new HttpError(HttpStatus.BAD_REQUEST, "Invalid icon extension");
    }

    if (!cleanP4) {
      id = cleanP2;
    }

    this.logger.log(`Fetching icon binary: ${network}/${type}/${id} (${ext})`);

    // P1: Check icon cache first (avoid hitting GitHub on every request)
    const iconCacheKey = `assets-cdn:icon:${network}:${type}:${id}:${ext}`;
    const cachedIcon = await this.cacheService.get<string>(iconCacheKey);
    if (cachedIcon) {
      this.logger.log(`Icon cache HIT: ${iconCacheKey}`);
      return {
        buffer: Buffer.from(cachedIcon, "base64"),
        mimeType: ext === "svg" ? "image/svg+xml" : "image/png",
      };
    }

    try {
      let rawUrl = "";
      if (type === "accounts") {
        const accountPath = getGithubPath(network, type, id);
        const accountUrl = `${this.configService.githubRawBase}/${accountPath}`;
        const accountResponse = await this.githubConnector.fetchWithTimeout(accountUrl);
        if (!accountResponse.ok) {
          throw new HttpError(HttpStatus.NOT_FOUND, "Account info not found");
        }
        const accountData = await accountResponse.json();
        const iconName = sanitize(accountData.icon || id);
        rawUrl = getRawUrl(network, type, id, `icons/${iconName}.${ext}`, this.configService.githubRawBase);
      } else {
        rawUrl = getRawUrl(network, type, id, `logo.${ext}`, this.configService.githubRawBase);
      }

      const response = await this.githubConnector.fetchWithTimeout(rawUrl);
      if (!response.ok) {
        throw new HttpError(HttpStatus.NOT_FOUND, "Icon file not found");
      }

      const arrayBuffer = await response.arrayBuffer();

      // S5: Validate icon size (max 2MB)
      if (arrayBuffer.byteLength > MAX_ICON_SIZE) {
        throw new HttpError(HttpStatus.BAD_REQUEST, "Icon file exceeds maximum allowed size");
      }

      const iconBuffer = Buffer.from(arrayBuffer);

      // S5: Validate PNG magic bytes (89 50 4E 47)
      if (ext === "png" && iconBuffer.length >= 4 &&
          (iconBuffer[0] !== 0x89 || iconBuffer[1] !== 0x50 || iconBuffer[2] !== 0x4E || iconBuffer[3] !== 0x47)) {
        throw new HttpError(HttpStatus.BAD_REQUEST, "Invalid PNG file");
      }

      // P1: Cache the icon binary (base64) for 15 minutes
      await this.cacheService.set(iconCacheKey, iconBuffer.toString("base64"), 900);

      return {
        buffer: iconBuffer,
        mimeType: ext === "svg" ? "image/svg+xml" : "image/png",
      };
    } catch (error: unknown) {
      if (error instanceof HttpError && error.status === HttpStatus.NOT_FOUND) {
        if (defaultIcon === "false") {
          throw error;
        }
        // P3: Use preloaded default icons instead of sync filesystem reads
        if (ext === "png" && this.defaultPng) {
          this.logger.log(`Serving preloaded default fallback: default.png`);
          return {
            buffer: this.defaultPng,
            mimeType: "image/png",
          };
        } else if (ext === "svg" && this.defaultSvg) {
          this.logger.log(`Serving preloaded default fallback: default.svg`);
          return {
            buffer: this.defaultSvg,
            mimeType: "image/svg+xml",
          };
        } else if (ext === "png") {
          this.logger.log(`Serving dynamic 1x1 transparent PNG fallback`);
          const transparentPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
          return {
            buffer: transparentPng,
            mimeType: "image/png",
          };
        }
      }
      if (error instanceof HttpError) {
        throw error;
      }
      this.logger.error(`Error fetching icon ${network}/${type}/${id}: ${error instanceof Error ? error.message : error}`);
      throw new HttpError(HttpStatus.INTERNAL_SERVER_ERROR, "Internal Server Error");
    }
  }
}
