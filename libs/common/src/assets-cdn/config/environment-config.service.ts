import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

@Injectable()
export class EnvironmentConfigService {
  constructor(private readonly configService: ConfigService) {}

  get port(): number {
    return this.configService.get<number>("PORT", 3201);
  }

  get githubToken(): string | undefined {
    return this.configService.get<string>("GITHUB_TOKEN");
  }

  get repoOwner(): string {
    return this.configService.get<string>("REPO_OWNER", "Layavardhan011");
  }

  get repoName(): string {
    return this.configService.get<string>("REPO_NAME", "demo-assets");
  }

  get branch(): string {
    return this.configService.get<string>("BRANCH", "main");
  }

  get redisUrl(): string | undefined {
    const url = this.configService.get<string>("REDIS_URL");
    if (url) return url;
    const host = this.configService.get<string>("REDIS_HOST");
    const port = this.configService.get<string>("REDIS_PORT");
    if (host && port) {
      return `redis://${host}:${port}`;
    }
    return undefined;
  }

  get redisPassword(): string | undefined {
    return this.configService.get<string>("REDIS_PASSWORD");
  }

  get allowedOrigin(): string[] {
    const raw = this.configService.get<string>("ALLOWED_ORIGIN", "");
    return raw ? raw.split(",") : [];
  }

  get cdnBaseUrl(): string {
    return this.configService.get<string>("CDN_BASE_URL", "");
  }

  get githubSyncConcurrency(): number | undefined {
    const raw = this.configService.get<string>("GITHUB_SYNC_CONCURRENCY");
    if (!raw) return undefined;
    const value = Number.parseInt(raw, 10);
    return Number.isFinite(value) && value > 0 ? value : undefined;
  }

  get githubSyncAllConcurrency(): number | undefined {
    const raw = this.configService.get<string>("GITHUB_SYNC_ALL_CONCURRENCY");
    if (!raw) return undefined;
    const value = Number.parseInt(raw, 10);
    return Number.isFinite(value) && value > 0 ? value : undefined;
  }

  private sanitizeRepoComponent(value: string): string {
    if (!/^[a-zA-Z0-9._\-/]+$/.test(value)) {
      throw new Error(`Invalid repo component: ${value}`);
    }
    return value;
  }

  get githubApiBase(): string {
    return `https://api.github.com/repos/${this.sanitizeRepoComponent(this.repoOwner)}/${this.sanitizeRepoComponent(this.repoName)}`;
  }

  get githubRawBase(): string {
    return `https://raw.githubusercontent.com/${this.sanitizeRepoComponent(this.repoOwner)}/${this.sanitizeRepoComponent(this.repoName)}/${this.sanitizeRepoComponent(this.branch)}`;
  }
}
