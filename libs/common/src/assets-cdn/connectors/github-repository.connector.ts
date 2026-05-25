import { Injectable, Logger } from "@nestjs/common";
import { EnvironmentConfigService } from "../config/environment-config.service";

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    Object.setPrototypeOf(this, HttpError.prototype);
  }
}

@Injectable()
export class GithubRepositoryConnector {
  private readonly logger = new Logger(GithubRepositoryConnector.name);
  private readonly fetchTimeoutMs = 10000;
  private readonly maxRetries = 2;
  private readonly baseRetryDelayMs = 250;
  private readonly maxRetryDelayMs = 2000;

  constructor(private readonly configService: EnvironmentConfigService) {}

  private async fetchWithTimeoutOnce(url: string, options: RequestInit = {}, timeout = this.fetchTimeoutMs): Promise<Response> {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
      return response;
    } finally {
      clearTimeout(id);
    }
  }

  private async sleep(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  private isRetryableStatus(status: number): boolean {
    // GitHub transient / throttling / upstream errors
    return status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
  }

  private computeBackoffDelayMs(attempt: number): number {
    const exp = Math.min(this.maxRetryDelayMs, this.baseRetryDelayMs * Math.pow(2, attempt));
    const jitter = Math.floor(Math.random() * 100);
    return exp + jitter;
  }

  async fetchWithTimeout(url: string, options: RequestInit = {}, timeout = this.fetchTimeoutMs): Promise<Response> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const response = await this.fetchWithTimeoutOnce(url, options, timeout);
        if (response.ok) {
          return response;
        }
        if (attempt < this.maxRetries && this.isRetryableStatus(response.status)) {
          const delayMs = this.computeBackoffDelayMs(attempt);
          this.logger.warn(`Retrying fetch (status ${response.status}) in ${delayMs}ms: ${url}`);
          await this.sleep(delayMs);
          continue;
        }
        return response;
      } catch (err: unknown) {
        lastError = err;
        // AbortError / transient network errors: retry
        if (attempt < this.maxRetries) {
          const delayMs = this.computeBackoffDelayMs(attempt);
          this.logger.warn(`Retrying fetch (error) in ${delayMs}ms: ${url}`);
          await this.sleep(delayMs);
          continue;
        }
        break;
      }
    }
    throw lastError instanceof Error ? lastError : new Error("Fetch failed");
  }

  async githubFetch(url: string): Promise<Response> {
    this.logger.debug(`Initiating GitHub API fetch request for URL: ${url}`);
    const headers: Record<string, string> = {
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "MultiversX-Assets-CDN-Enterprise-Proxy",
    };

    const token = this.configService.githubToken;
    if (token) {
      headers["Authorization"] = `token ${token}`;
    }

    const response = await this.fetchWithTimeout(url, { headers });
    if (!response.ok) {
      throw new HttpError(response.status, `GitHub API error: ${response.status}`);
    }
    return response;
  }

  async limitConcurrency<T>(tasks: (() => Promise<T>)[], limit: number): Promise<T[]> {
    const results: Promise<T>[] = [];
    const executing: Promise<unknown>[] = [];
    for (const task of tasks) {
      const p = Promise.resolve().then(() => task());
      results.push(p);
      if (limit <= tasks.length) {
        const e: Promise<unknown> = p.then(() => executing.splice(executing.indexOf(e), 1));
        executing.push(e);
        if (executing.length >= limit) {
          await Promise.race(executing);
        }
      }
    }
    return Promise.all(results);
  }
}
