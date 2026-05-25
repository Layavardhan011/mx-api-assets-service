import { Test, TestingModule } from "@nestjs/testing";
import { AssetsCdnProxyService } from "../../../apps/api/src/endpoints/assets-cdn/services/assets-cdn-proxy.service";
import {
  DistributedCacheService,
  EnvironmentConfigService,
  GithubRepositoryConnector,
  HttpError,
} from "@libs/common";
import { HttpStatus } from "@nestjs/common";
import * as fs from "fs";

jest.mock("fs", () => {
  const originalFs = jest.requireActual("fs");
  return {
    ...originalFs,
    promises: {
      ...originalFs.promises,
      readFile: jest.fn(),
    },
  };
});

describe("AssetsCdnProxyService", () => {
  let service: AssetsCdnProxyService;
  let cacheService: jest.Mocked<DistributedCacheService>;
  let githubConnector: jest.Mocked<GithubRepositoryConnector>;

  beforeEach(async () => {
    const cacheServiceMock = {
      get: jest.fn(),
      set: jest.fn(),
      isReady: jest.fn().mockResolvedValue(true),
      isRedisConnected: jest.fn().mockResolvedValue(true),
    };

    const configServiceMock = {
      githubApiBase: "https://api.github.com/repos/mock/repo",
      githubRawBase: "https://raw.githubusercontent.com/mock/repo/main",
      branch: "main",
      cdnBaseUrl: "https://cdn.example.com",
      githubToken: "mock-token",
    };

    const githubConnectorMock = {
      githubFetch: jest.fn(),
      fetchWithTimeout: jest.fn(),
      limitConcurrency: jest.fn().mockImplementation(async (tasks: (() => Promise<unknown>)[]) => {
        const results = [];
        for (const t of tasks) {
          results.push(await t());
        }
        return results;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AssetsCdnProxyService,
        { provide: DistributedCacheService, useValue: cacheServiceMock },
        { provide: EnvironmentConfigService, useValue: configServiceMock },
        { provide: GithubRepositoryConnector, useValue: githubConnectorMock },
      ],
    }).compile();

    service = module.get<AssetsCdnProxyService>(AssetsCdnProxyService);
    cacheService = module.get(DistributedCacheService);
    githubConnector = module.get(GithubRepositoryConnector);
  });


  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("onModuleInit", () => {
    it("should preload fallback icons into memory and execute syncAll", async () => {
      const mockRead = fs.promises.readFile as jest.Mock;
      mockRead.mockImplementation((filePath: string) => {
        if (filePath.endsWith("default.png")) return Promise.resolve(Buffer.from("mock-png"));
        if (filePath.endsWith("default.svg")) return Promise.resolve(Buffer.from("mock-svg"));
        return Promise.reject(new Error("File not found"));
      });

      const syncAllSpy = jest.spyOn(service, "syncAll").mockResolvedValue(undefined);

      await service.onModuleInit();

      expect(mockRead).toHaveBeenCalledTimes(2);
      expect(syncAllSpy).toHaveBeenCalled();
    });

    it("should handle error gracefully when fallback files are missing", async () => {
      const mockRead = fs.promises.readFile as jest.Mock;
      mockRead.mockRejectedValue(new Error("File missing"));

      const syncAllSpy = jest.spyOn(service, "syncAll").mockResolvedValue(undefined);

      await service.onModuleInit();

      expect(syncAllSpy).toHaveBeenCalled();
    });
  });

  describe("syncCollection", () => {
    it("should sync accounts collection and cache filtered results", async () => {
      const mockAccounts = [
        { name: "erd1address.json", download_url: "https://download/erd1address.json", type: "file" },
        { name: "icons", type: "dir" },
      ];

      const mockResponse = {
        json: jest.fn().mockResolvedValue(mockAccounts),
      } as unknown as Response;

      const mockItemResponse = {
        json: jest.fn().mockResolvedValue({ name: "Account Name", icon: true }),
      } as unknown as Response;

      githubConnector.githubFetch.mockResolvedValue(mockResponse);
      githubConnector.fetchWithTimeout.mockResolvedValue(mockItemResponse);

      await service.syncCollection("mainnet", "accounts");

      expect(githubConnector.githubFetch).toHaveBeenCalledWith(
        "https://api.github.com/repos/mock/repo/contents/accounts?ref=main"
      );
      expect(cacheService.set).toHaveBeenCalledWith(
        "assets-cdn:mainnet:accounts",
        [
          {
            address: "erd1address",
            name: "Account Name",
            icon: true,
            iconPng: "/assets-cdn/accounts/erd1address/icon.png",
            iconSvg: "/assets-cdn/accounts/erd1address/icon.svg",
          },
        ],
        900
      );
    });

    it("should sync tokens collection and resolve correct subfolders", async () => {
      const mockTokens = [
        { name: "TOKEN-123456", path: "tokens/TOKEN-123456", type: "dir" },
      ];

      const mockResponse = {
        json: jest.fn().mockResolvedValue(mockTokens),
      } as unknown as Response;

      const mockItemResponse = {
        json: jest.fn().mockResolvedValue({ name: "Token Name", decimals: 18 }),
      } as unknown as Response;

      githubConnector.githubFetch.mockResolvedValue(mockResponse);
      githubConnector.fetchWithTimeout.mockResolvedValue(mockItemResponse);

      await service.syncCollection("devnet", "tokens");

      expect(githubConnector.githubFetch).toHaveBeenCalledWith(
        "https://api.github.com/repos/mock/repo/contents/devnet/tokens?ref=main"
      );
      expect(cacheService.set).toHaveBeenCalledWith(
        "assets-cdn:devnet:tokens",
        [
          {
            identifier: "TOKEN-123456",
            name: "Token Name",
            decimals: 18,
            pngUrl: "/assets-cdn/devnet/tokens/TOKEN-123456/icon.png",
            svgUrl: "/assets-cdn/devnet/tokens/TOKEN-123456/icon.svg",
          },
        ],
        900
      );
    });
  });

  describe("isReady", () => {
    it("should return true if data exists in cache", async () => {
      cacheService.get.mockResolvedValue([{ identifier: "EGLD" }]);
      const ready = await service.isReady();
      expect(ready).toBe(true);
    });

    it("should return false if cache is empty", async () => {
      cacheService.get.mockResolvedValue(null);
      const ready = await service.isReady();
      expect(ready).toBe(false);
    });
  });

  describe("resolveUrls", () => {
    it("should replace relative asset routes with fully qualified canonical base URLs", () => {
      const input = {
        identifier: "EGLD",
        pngUrl: "/assets-cdn/tokens/EGLD/icon.png",
        nested: {
          avatar: "/assets-cdn/identities/my-id/icon.png",
        },
      };

      const resolved = service.resolveUrls(input);
      expect(resolved).toEqual({
        identifier: "EGLD",
        pngUrl: "https://cdn.example.com/assets-cdn/tokens/EGLD/icon.png",
        nested: {
          avatar: "https://cdn.example.com/assets-cdn/identities/my-id/icon.png",
        },
      });
    });

    it("should use the passed baseUrl if provided", () => {
      const input = {
        pngUrl: "/assets-cdn/tokens/EGLD/icon.png",
      };

      const resolved = service.resolveUrls(input, "https://dynamic.example.com");
      expect(resolved.pngUrl).toBe("https://dynamic.example.com/assets-cdn/tokens/EGLD/icon.png");
    });
  });

  describe("getCollection", () => {
    it("should return cached collections with formatted URLs", async () => {
      const mockCached = [
        { identifier: "TOKEN-1", pngUrl: "/assets-cdn/tokens/TOKEN-1/icon.png" },
      ];
      cacheService.get.mockResolvedValue(mockCached);

      const result = await service.getCollection("mainnet", "tokens");
      expect(result).toEqual([
        { identifier: "TOKEN-1", pngUrl: "https://cdn.example.com/assets-cdn/tokens/TOKEN-1/icon.png" },
      ]);
    });

    it("should return null if cache misses", async () => {
      cacheService.get.mockResolvedValue(null);
      const result = await service.getCollection("mainnet", "tokens");
      expect(result).toBeNull();
    });
  });

  describe("getItem", () => {
    it("should return individual item from cache on cache hit", async () => {
      const mockCached = [
        { identifier: "TOKEN-1", pngUrl: "/assets-cdn/tokens/TOKEN-1/icon.png" },
        { identifier: "TOKEN-2", pngUrl: "/assets-cdn/tokens/TOKEN-2/icon.png" },
      ];
      cacheService.get.mockResolvedValue(mockCached);

      const result = await service.getItem("mainnet", "tokens", "TOKEN-2");
      expect(result).toEqual({
        identifier: "TOKEN-2",
        pngUrl: "https://cdn.example.com/assets-cdn/tokens/TOKEN-2/icon.png",
      });
    });

    it("should fall back to raw GitHub query on cache miss", async () => {
      cacheService.get.mockResolvedValue(null);

      const mockGitHubResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({ name: "Token name" }),
      } as unknown as Response;

      githubConnector.fetchWithTimeout.mockResolvedValue(mockGitHubResponse);

      const result = await service.getItem("mainnet", "tokens", "TOKEN-FALLBACK");
      expect(result).toEqual({
        identifier: "TOKEN-FALLBACK",
        name: "Token name",
        pngUrl: "https://cdn.example.com/assets-cdn/tokens/TOKEN-FALLBACK/icon.png",
        svgUrl: "https://cdn.example.com/assets-cdn/tokens/TOKEN-FALLBACK/icon.svg",
      });
    });

    it("should bubble up HttpError if GitHub raw returns 404", async () => {
      cacheService.get.mockResolvedValue(null);

      const mockGitHubResponse = {
        ok: false,
        status: 404,
      } as unknown as Response;

      githubConnector.fetchWithTimeout.mockResolvedValue(mockGitHubResponse);

      await expect(service.getItem("mainnet", "tokens", "MISSING-TOKEN")).rejects.toThrow(
        new HttpError(HttpStatus.NOT_FOUND, "Not found")
      );
    });
  });

  describe("getIcon", () => {
    it("should throw HttpError for unsupported extensions", async () => {
      await expect(service.getIcon("mainnet", "tokens", "TOKEN", "icon.gif")).rejects.toThrow(
        new HttpError(HttpStatus.BAD_REQUEST, "Invalid icon extension")
      );
    });

    it("should return cached base64 icon on HIT", async () => {
      const mockPngBase64 = Buffer.from("mock-binary").toString("base64");
      cacheService.get.mockResolvedValue(mockPngBase64);

      const result = await service.getIcon("mainnet", "tokens", "TOKEN", "icon.png");

      expect(result.mimeType).toBe("image/png");
      expect(result.buffer.toString()).toBe("mock-binary");
    });

    it("should throw error if icon exceeds 2MB max limit", async () => {
      cacheService.get.mockResolvedValue(null);

      const mockResponse = {
        ok: true,
        arrayBuffer: jest.fn().mockResolvedValue(new ArrayBuffer(3 * 1024 * 1024)), // 3MB
      } as unknown as Response;

      githubConnector.fetchWithTimeout.mockResolvedValue(mockResponse);

      await expect(service.getIcon("mainnet", "tokens", "TOKEN", "icon.png")).rejects.toThrow(
        new HttpError(HttpStatus.BAD_REQUEST, "Icon file exceeds maximum allowed size")
      );
    });

    it("should validate PNG magic bytes when extension is png", async () => {
      cacheService.get.mockResolvedValue(null);

      const badBuffer = Buffer.from([0x00, 0x00, 0x00, 0x00]);
      const mockResponse = {
        ok: true,
        arrayBuffer: jest.fn().mockResolvedValue(badBuffer.buffer.slice(badBuffer.byteOffset, badBuffer.byteOffset + badBuffer.byteLength)),
      } as unknown as Response;

      githubConnector.fetchWithTimeout.mockResolvedValue(mockResponse);

      await expect(service.getIcon("mainnet", "tokens", "TOKEN", "icon.png")).rejects.toThrow(
        new HttpError(HttpStatus.BAD_REQUEST, "Invalid PNG file")
      );
    });

    it("should succeed and cache base64 for valid PNGs", async () => {
      cacheService.get.mockResolvedValue(null);

      const validPng = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
      const mockResponse = {
        ok: true,
        arrayBuffer: jest.fn().mockResolvedValue(validPng.buffer.slice(validPng.byteOffset, validPng.byteOffset + validPng.byteLength)),
      } as unknown as Response;

      githubConnector.fetchWithTimeout.mockResolvedValue(mockResponse);

      const result = await service.getIcon("mainnet", "tokens", "TOKEN", "icon.png");

      expect(result.mimeType).toBe("image/png");
      expect(result.buffer).toEqual(validPng);
      expect(cacheService.set).toHaveBeenCalledWith(
        "assets-cdn:icon:mainnet:tokens:TOKEN:png",
        validPng.toString("base64"),
        900
      );
    });

    it("should return the fallback default PNG if raw image fetch fails and defaultIcon parameter is not falsy", async () => {
      cacheService.get.mockResolvedValue(null);
      githubConnector.fetchWithTimeout.mockResolvedValue({
        ok: false,
        status: 404,
      } as unknown as Response);

      // force service fallback buffers in memory
      (service as any).defaultPng = Buffer.from("fallback-png-loaded");

      const result = await service.getIcon("mainnet", "tokens", "UNKNOWN", "icon.png", "true");

      expect(result.mimeType).toBe("image/png");
      expect(result.buffer.toString()).toBe("fallback-png-loaded");
    });
  });
});
