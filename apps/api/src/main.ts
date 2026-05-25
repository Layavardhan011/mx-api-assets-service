import * as dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({
  path: resolve(process.cwd(), '.env'),
});

import 'module-alias/register';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { readFileSync } from 'fs';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { join } from 'path';
import { PrivateAppModule } from './private.app.module';
import { PublicAppModule } from './public.app.module';
import * as bodyParser from 'body-parser';
import { Logger, NestInterceptor, ValidationPipe } from '@nestjs/common';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import cookieParser from 'cookie-parser';
import { PubSubListenerModule } from '@libs/common';
import { LoggingInterceptor, MetricsService, RequestCpuTimeInterceptor } from '@multiversx/sdk-nestjs-monitoring';
import { LoggerInitializer } from '@multiversx/sdk-nestjs-common';

import '@multiversx/sdk-nestjs-common/lib/utils/extensions/array.extensions';
import '@multiversx/sdk-nestjs-common/lib/utils/extensions/date.extensions';
import '@multiversx/sdk-nestjs-common/lib/utils/extensions/number.extensions';
import '@multiversx/sdk-nestjs-common/lib/utils/extensions/string.extensions';
import { AppConfigService } from './config/app-config.service';
import { CommonConfigService } from '@libs/common/config/common.config.service';

import compression from "compression";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { Request, Response, NextFunction } from "express";
import { randomUUID } from "crypto";
import { RedisRateLimitStore } from "./rate-limit/redis-rate-limit.store";

async function bootstrap() {
  const publicApp = await NestFactory.create(PublicAppModule);
  publicApp.use(bodyParser.json({ limit: '1mb' }));
  publicApp.useLogger(publicApp.get(WINSTON_MODULE_NEST_PROVIDER));
  publicApp.use(cookieParser());

  // 1. Trust Proxy & Security Headers
  const expressApp = publicApp.getHttpAdapter().getInstance();
  expressApp.set("trust proxy", 1);
  expressApp.disable("x-powered-by");

  // P10: Request correlation ID for cross-service tracing
  publicApp.use((req: Request, res: Response, next: NextFunction) => {
    const correlationId = (req.headers['x-correlation-id'] as string) || randomUUID();
    res.setHeader('X-Correlation-Id', correlationId);
    next();
  });

  // 2. Swagger Init Cache Control Middleware
  publicApp.use((req: Request, res: Response, next: NextFunction) => {
    if (req.path.includes("swagger-ui-init.js") || req.path.includes("dev-helper-initializer.js")) {
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");
    }
    next();
  });

  // 3. Compression — Skip PNG (already compressed); compress JSON, SVG, etc.
  publicApp.use(compression({
    filter: (req: Request, res: Response) => {
      if (req.path.endsWith('.png')) return false;
      return compression.filter(req, res);
    },
  }));

  // 4. Response Size Limit (10MB)
  publicApp.use((req: Request, res: Response, next: NextFunction) => {
    if (req.method === "OPTIONS") return next();
    const _originalJson = res.json.bind(res);
    res.json = function (body: unknown) {
      const serialized = JSON.stringify(body);
      const size = Buffer.byteLength(serialized, "utf8");
      if (size > 10 * 1024 * 1024) {
        return res.status(413).send("Response too large");
      }
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      return res.send(serialized);
    } as typeof _originalJson;
    next();
  });

  // 5. Helmet Security (Skip CSP specifically on swagger docs page to allow inline styles)
  publicApp.use((req: Request, res: Response, next: NextFunction) => {
    const isDocPath = req.path === '/assets-cdn' || req.path === '/assets-cdn/' || req.path === '/' || req.path === '';
    if (isDocPath) {
      helmet({
        contentSecurityPolicy: {
          directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", "data:"],
            connectSrc: ["'self'"],
            objectSrc: ["'none'"],
            upgradeInsecureRequests: [],
          },
        },
        crossOriginResourcePolicy: { policy: "cross-origin" },
        frameguard: { action: "deny" },
        hsts: { maxAge: 31536000, includeSubDomains: true },
      })(req, res, next);
    } else {
      helmet({
        contentSecurityPolicy: {
          directives: {
            defaultSrc: ["'self'"],
            imgSrc: ["'self'", "data:", "https://raw.githubusercontent.com"],
            scriptSrc: ["'self'"],
            objectSrc: ["'none'"],
            upgradeInsecureRequests: [],
          },
        },
        crossOriginResourcePolicy: { policy: "cross-origin" },
        frameguard: { action: "deny" },
        hsts: { maxAge: 31536000, includeSubDomains: true },
      })(req, res, next);
    }
  });

  // 6. Rate Limiter (In-Memory)
  // If Redis is configured and `RATE_LIMIT_USE_REDIS=true`, use a shared store (multi-instance friendly).
  const appConfigService = publicApp.get<AppConfigService>(AppConfigService);
  const commonConfigService = publicApp.get<CommonConfigService>(CommonConfigService);
  const useRedisRateLimit = (process.env.RATE_LIMIT_USE_REDIS || "").toLowerCase() === "true";
  const rateLimitStore =
    useRedisRateLimit && commonConfigService.config.redis.host && commonConfigService.config.redis.port
      ? new RedisRateLimitStore({
          host: commonConfigService.config.redis.host,
          port: commonConfigService.config.redis.port,
          password: commonConfigService.config.redis.password,
          prefix: "rate-limit:public:",
        })
      : undefined;

  const limiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 100, // max 100 requests per IP per window
    standardHeaders: true,
    legacyHeaders: false,
    store: rateLimitStore,
  });
  publicApp.use(limiter);

  // 7. CORS setup matching config
  // Reads ALLOWED_ORIGIN from .env — comma-separated list or "*" for all origins.
  const allowedOrigins = (process.env.ALLOWED_ORIGIN || "*").split(",").map(o => o.trim()).filter(Boolean);
  publicApp.enableCors({
    origin: allowedOrigins.includes("*") ? true : allowedOrigins,
    methods: ["GET", "HEAD", "OPTIONS"],
    credentials: false,
  });

  const privateApp = await NestFactory.create(PrivateAppModule);
  privateApp.use(helmet());

  // S12: Opt-in IP restriction for private/monitoring port.
  // When PRIVATE_API_ALLOWED_IPS is not set, all IPs are allowed (backward compatible).
  // When set (e.g. "127.0.0.1,172.17.0.1"), only those IPs can access metrics/health.
  const privateAllowedIps = (process.env.PRIVATE_API_ALLOWED_IPS || "").split(",").map(ip => ip.trim()).filter(Boolean);
  if (privateAllowedIps.length > 0) {
    privateApp.use((req: Request, res: Response, next: NextFunction) => {
      const clientIp = (req.ip || req.socket.remoteAddress || "").replace(/^::ffff:/, "");
      if (privateAllowedIps.includes(clientIp)) {
        return next();
      }
      return res.status(403).send("Forbidden");
    });
  }
  const privateRateLimitStore =
    useRedisRateLimit && commonConfigService.config.redis.host && commonConfigService.config.redis.port
      ? new RedisRateLimitStore({
          host: commonConfigService.config.redis.host,
          port: commonConfigService.config.redis.port,
          password: commonConfigService.config.redis.password,
          prefix: "rate-limit:private:",
        })
      : undefined;
  privateApp.use(rateLimit({ windowMs: 60 * 1000, max: 60, standardHeaders: true, legacyHeaders: false, store: privateRateLimitStore }));
  const metricsService = privateApp.get<MetricsService>(MetricsService);

  const globalInterceptors: NestInterceptor[] = [];
  globalInterceptors.push(new LoggingInterceptor(metricsService));
  globalInterceptors.push(new RequestCpuTimeInterceptor(metricsService));

  publicApp.useGlobalInterceptors(...globalInterceptors);
  // Validation hardening (non-breaking): keep current behavior but ensure we don't pass through
  // unknown values and that implicit primitives are transformed.
  publicApp.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, transformOptions: { enableImplicitConversion: true } }));

  const description = readFileSync(join(__dirname, '..', 'docs', 'swagger.md'), 'utf8');

  const config = new DocumentBuilder()
    .setTitle('MultiversX Assets CDN')
    .setDescription(description)
    .setVersion('1.0.0')
    .setExternalDoc('MultiversX Docs', 'https://docs.multiversx.com')
    .build();

  const document = SwaggerModule.createDocument(publicApp, config);

  if (document && document.paths) {
    for (const pathKey of Object.keys(document.paths)) {
      const pathItem = document.paths[pathKey];
      if (pathItem) {
        for (const methodKey of Object.keys(pathItem)) {
          const operation = (pathItem as Record<string, unknown>)[methodKey];
          if (operation && typeof operation === "object" && "tags" in operation) {
            const opWithTags = operation as { tags: unknown };
            if (Array.isArray(opWithTags.tags)) {
              opWithTags.tags = opWithTags.tags.filter((tag: unknown) => typeof tag === "string" && tag !== "AssetsCdnProxy");
            }
          }
        }
      }
    }
  }

  SwaggerModule.setup('assets-cdn', publicApp, document, {
    customCss: `
      /* Hide "Description" column only in the static "Responses" list */
      .swagger-ui .responses-table:not(.live-responses-table) .response-col_description,
      .swagger-ui .responses-table:not(.live-responses-table) th.response-col_description,
      .swagger-ui .responses-table:not(.live-responses-table) td.response-col_description {
        display: none !important;
      }

      /* Position the dark mode bulb icon toggle in the header */
      .swagger-ui .topbar .topbar-wrapper {
        display: flex !important;
        justify-content: space-between !important;
        align-items: center !important;
        width: 100% !important;
      }
      .swagger-ui .topbar .topbar-wrapper .dark-mode-toggle {
        margin-left: auto !important;
      }
    `,
  });

  await publicApp.listen(appConfigService.config.port);
  await privateApp.listen(appConfigService.config.privatePort);

  const logger = new Logger('Bootstrapper');

  LoggerInitializer.initialize(logger);

  const pubSubApp = await NestFactory.createMicroservice<MicroserviceOptions>(
    PubSubListenerModule.forRoot(),
    {
      transport: Transport.REDIS,
      options: {
        host: commonConfigService.config.redis.host,
        port: commonConfigService.config.redis.port,
        username: process.env.REDIS_PUBSUB_USER || undefined,
        password: process.env.REDIS_PUBSUB_PASSWORD || commonConfigService.config.redis.password,
        retryAttempts: 100,
        retryDelay: 1000,
        retryStrategy: () => 1000,
      },
    },
  );
  pubSubApp.useLogger(pubSubApp.get(WINSTON_MODULE_NEST_PROVIDER));
  // eslint-disable-next-line @typescript-eslint/no-floating-promises
  pubSubApp.listen();

  logger.log(`Public API active: ${appConfigService.config.port}`);
  logger.log(`Private API active: ${appConfigService.config.privatePort}`);
}

// eslint-disable-next-line @typescript-eslint/no-floating-promises
bootstrap();
