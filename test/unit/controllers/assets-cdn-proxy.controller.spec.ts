import { Test, TestingModule } from "@nestjs/testing";
import { AssetsCdnProxyController } from "../../../apps/api/src/endpoints/assets-cdn/controllers/assets-cdn-proxy.controller";
import { AssetsCdnProxyService } from "../../../apps/api/src/endpoints/assets-cdn/services/assets-cdn-proxy.service";
import { EnvironmentConfigService, HttpError } from "@libs/common";
import { HttpStatus } from "@nestjs/common";
import { Request, Response } from "express";

describe("AssetsCdnProxyController", () => {
  let controller: AssetsCdnProxyController;
  let service: jest.Mocked<AssetsCdnProxyService>;

  beforeEach(async () => {
    const serviceMock = {
      isReady: jest.fn(),
      getCollection: jest.fn(),
      getItem: jest.fn(),
      getIcon: jest.fn(),
    };

    const configServiceMock = {
      cdnBaseUrl: "https://cdn.example.com",
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AssetsCdnProxyController],
      providers: [
        { provide: AssetsCdnProxyService, useValue: serviceMock },
        { provide: EnvironmentConfigService, useValue: configServiceMock },
      ],
    }).compile();

    controller = module.get<AssetsCdnProxyController>(AssetsCdnProxyController);
    service = module.get(AssetsCdnProxyService);
  });


  afterEach(() => {
    jest.clearAllMocks();
  });

  const mockRequest = (host = "localhost:3201", secure = false): Partial<Request> => ({
    get: jest.fn().mockReturnValue(host),
    secure,
  });

  const mockResponse = (): Partial<Response> => {
    const res: Partial<Response> = {};
    res.status = jest.fn().mockReturnValue(res);
    res.send = jest.fn().mockReturnValue(res);
    res.setHeader = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
  };

  describe("getRoot", () => {
    it("should return default 404 response", () => {
      const res = mockResponse();
      controller.getRoot(res as Response);

      expect(res.status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
      expect(res.json).toHaveBeenCalledWith({ message: "default backend - 404", error: "Not Found", statusCode: HttpStatus.NOT_FOUND });
    });
  });

  describe("getHealth", () => {
    it("should return ok status", () => {
      const result = controller.getHealth();
      expect(result).toEqual({ status: "ok" });
    });
  });

  describe("getAccountsCollection", () => {
    it("should return 503 if service is not ready", async () => {
      service.isReady.mockResolvedValue(false);

      const req = mockRequest();
      const res = mockResponse();

      await controller.getAccountsCollection("mainnet", req as Request, res as Response);

      expect(res.setHeader).toHaveBeenCalledWith("Retry-After", "5");
      expect(res.status).toHaveBeenCalledWith(HttpStatus.SERVICE_UNAVAILABLE);
      expect(res.json).toHaveBeenCalledWith({ message: "Service initializing, please retry shortly", error: "Service Unavailable", statusCode: HttpStatus.SERVICE_UNAVAILABLE });
    });

    it("should return cached collections with 300s max-age cache-control", async () => {
      service.isReady.mockResolvedValue(true);
      const mockData = [{ address: "erd1address", name: "Mock Account" }];
      service.getCollection.mockResolvedValue(mockData);

      const req = mockRequest();
      const res = mockResponse();

      await controller.getAccountsCollection("mainnet", req as Request, res as Response);

      expect(service.getCollection).toHaveBeenCalledWith("mainnet", "accounts", "https://cdn.example.com");
      expect(res.setHeader).toHaveBeenCalledWith("Cache-Control", "public, max-age=300");
      expect(res.json).toHaveBeenCalledWith(mockData);
    });

    it("should return 404 if collection is not found or synchronizing", async () => {
      service.isReady.mockResolvedValue(true);
      service.getCollection.mockResolvedValue(null);

      const req = mockRequest();
      const res = mockResponse();

      await controller.getAccountsCollection("mainnet", req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
      expect(res.json).toHaveBeenCalledWith({ message: "Not found or synchronization in progress", error: "Not Found", statusCode: HttpStatus.NOT_FOUND });
    });
  });

  describe("getAccountItem", () => {
    it("should fetch account item and return json response", async () => {
      service.isReady.mockResolvedValue(true);
      const mockItem = { address: "erd1address", name: "Mock Name" };
      service.getItem.mockResolvedValue(mockItem);

      const req = mockRequest();
      const res = mockResponse();

      await controller.getAccountItem("mainnet", { address: "erd1address" }, req as Request, res as Response);

      expect(service.getItem).toHaveBeenCalledWith("mainnet", "accounts", "erd1address", undefined, "https://cdn.example.com");
      expect(res.setHeader).toHaveBeenCalledWith("Cache-Control", "public, max-age=300");
      expect(res.json).toHaveBeenCalledWith(mockItem);
    });

    it("should handle service throw with HttpError gracefully", async () => {
      service.isReady.mockResolvedValue(true);
      service.getItem.mockRejectedValue(new HttpError(HttpStatus.NOT_FOUND, "Account not found"));

      const req = mockRequest();
      const res = mockResponse();

      await controller.getAccountItem("mainnet", { address: "erd1address" }, req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
      expect(res.json).toHaveBeenCalledWith({ message: "Account not found", error: "Not Found", statusCode: HttpStatus.NOT_FOUND });
    });
  });

  describe("getAccountIconPng", () => {
    it("should fetch icon binary and respond with raw buffer and content type header", async () => {
      service.isReady.mockResolvedValue(true);
      const mockBuffer = Buffer.from("png-binary");
      service.getIcon.mockResolvedValue({ buffer: mockBuffer, mimeType: "image/png" });

      const req = mockRequest();
      const res = mockResponse();

      await controller.getAccountIconPng(
        "mainnet",
        { address: "erd1address" },
        req as Request,
        res as Response,
        "true"
      );

      expect(service.getIcon).toHaveBeenCalledWith("mainnet", "accounts", "erd1address", "icon.png", "true");
      expect(res.setHeader).toHaveBeenCalledWith("Content-Type", "image/png");
      expect(res.setHeader).toHaveBeenCalledWith("Cache-Control", "public, max-age=3600");
      expect(res.send).toHaveBeenCalledWith(mockBuffer);
    });
  });
});
