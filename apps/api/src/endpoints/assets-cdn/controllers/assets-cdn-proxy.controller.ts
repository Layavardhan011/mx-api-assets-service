import { Controller, Get, Param, Res, Req, HttpStatus, HttpException, Logger, Query, Inject } from "@nestjs/common";
import { Request, Response } from "express";
import { NetworkPipe } from "../pipes";
import { AssetsCdnProxyService } from '../services/assets-cdn-proxy.service';
import { resolveParams, HttpError, EnvironmentConfigService } from "@libs/common";
import { ApiTags, ApiParam, ApiExcludeEndpoint, ApiOkResponse, ApiNotFoundResponse, ApiProduces, ApiQuery } from "@nestjs/swagger";
import { AccountAssets, IdentityAssets, TokenAssets } from "../dto/schemas.dto";
import { AddressParam, IdentifierParam, IdentityParam, WildcardParams, WildcardItemParams } from "../dto/param-validators.dto";

const NETWORK_PARAM = {
  name: "network",
  enum: ["mainnet", "testnet", "devnet"],
  required: false,
  description: "The network to fetch assets from. Default is MAINNET",
} as const;

@Controller()
export class AssetsCdnProxyController {
  private readonly logger = new Logger(AssetsCdnProxyController.name);

  constructor(
    private readonly proxyService: AssetsCdnProxyService,
    @Inject(EnvironmentConfigService) private readonly configService: EnvironmentConfigService,
  ) {}

  private getBaseUrl(req: Request): string {
    const configuredBase = this.configService.cdnBaseUrl;
    if (configuredBase) {
      return configuredBase;
    }
    const host = req.get("host") || "localhost:3201";
    const proto = req.secure ? "https" : "http";
    return `${proto}://${host}`;
  }

  private async respondItemOrIcon(
    p1: string,
    p2: string,
    p3: string | undefined,
    p4: string | undefined,
    baseUrl: string,
    res: Response,
    defaultIcon?: string
  ): Promise<unknown> {

    const { id } = resolveParams({ p1, p2, p3 });
    const isIconRequest = (id && p3 && p3.startsWith("icon.")) || (p4 && p4.startsWith("icon."));

    if (isIconRequest) {
      try {
        const { buffer, mimeType } = await this.proxyService.getIcon(p1, p2, p3, p4, defaultIcon);
        res.setHeader("Content-Type", mimeType);
        res.setHeader("Cache-Control", "public, max-age=3600");
        return res.send(buffer);
      } catch (err: unknown) {
        if (err instanceof HttpError) {
          return res.status(err.status).json({ message: err.message, error: err.status === 404 ? "Not Found" : "Error", statusCode: err.status });
        }
        throw new HttpException("Internal Server Error", HttpStatus.INTERNAL_SERVER_ERROR);
      }
    }

    try {
      const item = await this.proxyService.getItem(p1, p2, p3, p4, baseUrl);
      res.setHeader("Cache-Control", "public, max-age=300");
      return res.json(item);
    } catch (err: unknown) {
      if (err instanceof HttpError) {
        return res.status(err.status).json({ message: err.message, error: err.status === 404 ? "Not Found" : "Error", statusCode: err.status });
      }
      throw new HttpException("Internal Server Error", HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @ApiExcludeEndpoint()
  @Get()
  getRoot(@Res() res: Response) {
    return res.status(HttpStatus.NOT_FOUND).json({ message: "default backend - 404", error: "Not Found", statusCode: HttpStatus.NOT_FOUND });
  }

  @ApiExcludeEndpoint()
  @Get("health")
  getHealth() {
    return { status: "ok" };
  }

  // P6: Readiness probe — returns 503 until cache is warmed (use for Kubernetes readinessProbe).
  // /health remains a simple liveness probe that always returns 200.
  @ApiExcludeEndpoint()
  @Get("ready")
  async getReady(@Res() res: Response) {
    const ready = await this.proxyService.isReady();
    if (!ready) {
      return res.status(HttpStatus.SERVICE_UNAVAILABLE).json({ status: "not_ready" });
    }
    return res.json({ status: "ready" });
  }

  // ACCOUNTS GROUP (Swagger Tags)

  @ApiTags("accounts")
  @ApiParam(NETWORK_PARAM)
  @ApiOkResponse({ type: [AccountAssets] })
  @Get("assets-cdn/:network/accounts")
  async getAccountsCollection(@Param("network", NetworkPipe) network: string, @Req() req: Request, @Res() res: Response) {
    const isReady = await this.proxyService.isReady(network, "accounts");
    if (!isReady) {
      res.setHeader("Retry-After", "5");
      return res.status(HttpStatus.SERVICE_UNAVAILABLE).json({ message: "Service initializing, please retry shortly", error: "Service Unavailable", statusCode: HttpStatus.SERVICE_UNAVAILABLE });
    }
    try {
      const data = await this.proxyService.getCollection(network, "accounts", this.getBaseUrl(req));
      if (data) {
        res.setHeader("Cache-Control", "public, max-age=300");
        return res.json(data);
      }
      return res.status(HttpStatus.NOT_FOUND).json({ message: "Not found or synchronization in progress", error: "Not Found", statusCode: HttpStatus.NOT_FOUND });
    } catch (err: unknown) {
      this.logger.error(`Error loading accounts collection for ${network}: ${err instanceof Error ? err.message : err}`);
      throw new HttpException("Internal Server Error", HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @ApiTags("accounts")
  @ApiParam(NETWORK_PARAM)
  @ApiParam({ name: "address", type: String })
  @ApiOkResponse({ type: AccountAssets })
  @ApiNotFoundResponse()
  @Get("assets-cdn/:network/accounts/:address")
  async getAccountItem(@Param("network", NetworkPipe) network: string, @Param() params: AddressParam, @Req() req: Request, @Res() res: Response) {
    return await this.respondItemOrIcon(network, "accounts", params.address, undefined, this.getBaseUrl(req), res);
  }

  @ApiTags("accounts")
  @ApiProduces("image/png")
  @ApiParam(NETWORK_PARAM)
  @ApiParam({ name: "address", type: String })
  @ApiQuery({ name: "default", required: false, type: Boolean, description: "Whether to return the default icon if the identity does not have a custom icon. Default is true" })
  @ApiOkResponse()
  @ApiNotFoundResponse()
  @Get("assets-cdn/:network/accounts/:address/icon.png")
  async getAccountIconPng(
    @Param("network", NetworkPipe) network: string,
    @Param() params: AddressParam,
    @Req() req: Request,
    @Res() res: Response,
    @Query("default") defaultIcon?: string
  ) {
    return await this.respondItemOrIcon(network, "accounts", params.address, "icon.png", this.getBaseUrl(req), res, defaultIcon);
  }

  @ApiTags("accounts")
  @ApiProduces("image/svg+xml")
  @ApiParam(NETWORK_PARAM)
  @ApiParam({ name: "address", type: String })
  @ApiQuery({ name: "default", required: false, type: Boolean, description: "Whether to return the default icon if the identity does not have a custom icon. Default is true" })
  @ApiOkResponse()
  @ApiNotFoundResponse()
  @Get("assets-cdn/:network/accounts/:address/icon.svg")
  async getAccountIconSvg(
    @Param("network", NetworkPipe) network: string,
    @Param() params: AddressParam,
    @Req() req: Request,
    @Res() res: Response,
    @Query("default") defaultIcon?: string
  ) {
    return await this.respondItemOrIcon(network, "accounts", params.address, "icon.svg", this.getBaseUrl(req), res, defaultIcon);
  }

  // ==========================================
  // IDENTITIES GROUP (Swagger Tags)
  // ==========================================
  @ApiTags("identities")
  @ApiParam(NETWORK_PARAM)
  @ApiOkResponse({ type: [IdentityAssets] })
  @Get("assets-cdn/:network/identities")
  async getIdentitiesCollection(@Param("network", NetworkPipe) network: string, @Req() req: Request, @Res() res: Response) {
    const isReady = await this.proxyService.isReady(network, "identities");
    if (!isReady) {
      res.setHeader("Retry-After", "5");
      return res.status(HttpStatus.SERVICE_UNAVAILABLE).json({ message: "Service initializing, please retry shortly", error: "Service Unavailable", statusCode: HttpStatus.SERVICE_UNAVAILABLE });
    }
    try {
      const data = await this.proxyService.getCollection(network, "identities", this.getBaseUrl(req));
      if (data) {
        res.setHeader("Cache-Control", "public, max-age=300");
        return res.json(data);
      }
      return res.status(HttpStatus.NOT_FOUND).json({ message: "Not found or synchronization in progress", error: "Not Found", statusCode: HttpStatus.NOT_FOUND });
    } catch (err: unknown) {
      this.logger.error(`Error loading identities collection for ${network}: ${err instanceof Error ? err.message : err}`);
      throw new HttpException("Internal Server Error", HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @ApiTags("identities")
  @ApiParam(NETWORK_PARAM)
  @ApiParam({ name: "identity", type: String })
  @ApiOkResponse({ type: IdentityAssets })
  @ApiNotFoundResponse()
  @Get("assets-cdn/:network/identities/:identity")
  async getIdentityItem(@Param("network", NetworkPipe) network: string, @Param() params: IdentityParam, @Req() req: Request, @Res() res: Response) {
    return await this.respondItemOrIcon(network, "identities", params.identity, undefined, this.getBaseUrl(req), res);
  }

  @ApiTags("identities")
  @ApiProduces("image/png")
  @ApiParam(NETWORK_PARAM)
  @ApiParam({ name: "identity", type: String })
  @ApiQuery({ name: "default", required: false, type: Boolean, description: "Whether to return the default icon if the identity does not have a custom icon. Default is true" })
  @ApiOkResponse()
  @ApiNotFoundResponse()
  @Get("assets-cdn/:network/identities/:identity/icon.png")
  async getIdentityIconPng(
    @Param("network", NetworkPipe) network: string,
    @Param() params: IdentityParam,
    @Req() req: Request,
    @Res() res: Response,
    @Query("default") defaultIcon?: string
  ) {
    return await this.respondItemOrIcon(network, "identities", params.identity, "icon.png", this.getBaseUrl(req), res, defaultIcon);
  }

  // ==========================================
  // TOKENS GROUP (Swagger Tags)
  // ==========================================
  @ApiTags("tokens")
  @ApiParam(NETWORK_PARAM)
  @ApiOkResponse({ type: [TokenAssets] })
  @Get("assets-cdn/:network/tokens")
  async getTokensCollection(@Param("network", NetworkPipe) network: string, @Req() req: Request, @Res() res: Response) {
    const isReady = await this.proxyService.isReady(network, "tokens");
    if (!isReady) {
      res.setHeader("Retry-After", "5");
      return res.status(HttpStatus.SERVICE_UNAVAILABLE).json({ message: "Service initializing, please retry shortly", error: "Service Unavailable", statusCode: HttpStatus.SERVICE_UNAVAILABLE });
    }
    try {
      const data = await this.proxyService.getCollection(network, "tokens", this.getBaseUrl(req));
      if (data) {
        res.setHeader("Cache-Control", "public, max-age=300");
        return res.json(data);
      }
      return res.status(HttpStatus.NOT_FOUND).json({ message: "Not found or synchronization in progress", error: "Not Found", statusCode: HttpStatus.NOT_FOUND });
    } catch (err: unknown) {
      this.logger.error(`Error loading tokens collection for ${network}: ${err instanceof Error ? err.message : err}`);
      throw new HttpException("Internal Server Error", HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @ApiTags("tokens")
  @ApiParam(NETWORK_PARAM)
  @ApiParam({ name: "identifier", type: String })
  @ApiOkResponse({ type: TokenAssets })
  @ApiNotFoundResponse()
  @Get("assets-cdn/:network/tokens/:identifier")
  async getTokenItem(@Param("network", NetworkPipe) network: string, @Param() params: IdentifierParam, @Req() req: Request, @Res() res: Response) {
    return await this.respondItemOrIcon(network, "tokens", params.identifier, undefined, this.getBaseUrl(req), res);
  }

  @ApiTags("tokens")
  @ApiProduces("image/png")
  @ApiParam(NETWORK_PARAM)
  @ApiParam({ name: "identifier", type: String })
  @ApiQuery({ name: "default", required: false, type: Boolean, description: "Whether to return the default icon if the identity does not have a custom icon. Default is true" })
  @ApiOkResponse()
  @ApiNotFoundResponse()
  @Get("assets-cdn/:network/tokens/:identifier/icon.png")
  async getTokenIconPng(
    @Param("network", NetworkPipe) network: string,
    @Param() params: IdentifierParam,
    @Req() req: Request,
    @Res() res: Response,
    @Query("default") defaultIcon?: string
  ) {
    return await this.respondItemOrIcon(network, "tokens", params.identifier, "icon.png", this.getBaseUrl(req), res, defaultIcon);
  }

  @ApiTags("tokens")
  @ApiProduces("image/svg+xml")
  @ApiParam(NETWORK_PARAM)
  @ApiParam({ name: "identifier", type: String })
  @ApiQuery({ name: "default", required: false, type: Boolean, description: "Whether to return the default icon if the identity does not have a custom icon. Default is true" })
  @ApiOkResponse()
  @ApiNotFoundResponse()
  @Get("assets-cdn/:network/tokens/:identifier/icon.svg")
  async getTokenIconSvg(
    @Param("network", NetworkPipe) network: string,
    @Param() params: IdentifierParam,
    @Req() req: Request,
    @Res() res: Response,
    @Query("default") defaultIcon?: string
  ) {
    return await this.respondItemOrIcon(network, "tokens", params.identifier, "icon.svg", this.getBaseUrl(req), res, defaultIcon);
  }

  // ==========================================
  // WILDCARD SYSTEM FOR COMPATIBILITY
  // ==========================================
  @ApiExcludeEndpoint()
  @Get(["assets-cdn/:p1", "assets-cdn/:p1/:p2"])
  async getCollection(
    @Param() params: WildcardParams,
    @Req() req: Request,
    @Res() res: Response
  ): Promise<unknown> {
    const { p1, p2 } = params;
    const { network, type } = resolveParams({ p1, p2 });
    const isReady = await this.proxyService.isReady(network, type);
    if (!isReady) {
      res.setHeader("Retry-After", "5");
      return res.status(HttpStatus.SERVICE_UNAVAILABLE).json({ message: "Service initializing, please retry shortly", error: "Service Unavailable", statusCode: HttpStatus.SERVICE_UNAVAILABLE });
    }

    try {
      const data = await this.proxyService.getCollection(p1, p2, this.getBaseUrl(req));
      if (data) {
        res.setHeader("Cache-Control", "public, max-age=300");
        return res.json(data);
      }
      return res.status(HttpStatus.NOT_FOUND).json({ message: "Not found or synchronization in progress", error: "Not Found", statusCode: HttpStatus.NOT_FOUND });
    } catch (err: unknown) {
      this.logger.error(`Error loading collection ${p1}/${p2}: ${err instanceof Error ? err.message : err}`);
      throw new HttpException("Internal Server Error", HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @ApiExcludeEndpoint()
  @Get(["assets-cdn/:p1/:p2/:p3", "assets-cdn/:p1/:p2/:p3/:p4"])
  async getItemOrIcon(
    @Param() params: WildcardItemParams,
    @Req() req: Request,
    @Res() res: Response
  ): Promise<unknown> {
    const { p1, p2, p3, p4 } = params;
    return await this.respondItemOrIcon(p1, p2, p3, p4, this.getBaseUrl(req), res);
  }
}
