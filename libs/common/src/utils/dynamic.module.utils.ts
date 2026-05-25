import { MXNEST_CONFIG_SERVICE } from "@multiversx/sdk-nestjs-common";
import { CacheModule, RedisCacheModuleOptions } from "@multiversx/sdk-nestjs-cache";
import { DynamicModule, Provider } from "@nestjs/common";
import { ClientOptions, ClientProxyFactory, Transport } from "@nestjs/microservices";
import { CommonConfigModule, CommonConfigService, SdkNestjsConfigServiceImpl } from "../config";

export class DynamicModuleUtils {
  static getCachingModule(): DynamicModule {
    return CacheModule.forRootAsync({
      imports: [CommonConfigModule],
      useFactory: (configService: CommonConfigService) => new RedisCacheModuleOptions({
        host: configService.config.redis.host,
        port: configService.config.redis.port,
        password: configService.config.redis.password,
      }, {
        poolLimit: 100,
        processTtl: 60,
      }),
      inject: [CommonConfigService],
    });
  }

  static getNestJsApiConfigService(): Provider {
    return {
      provide: MXNEST_CONFIG_SERVICE,
      useClass: SdkNestjsConfigServiceImpl,
    };
  }

  static getPubSubService(): Provider {
    return {
      provide: 'PUBSUB_SERVICE',
      useFactory: (configService: CommonConfigService) => {
        const clientOptions: ClientOptions = {
          transport: Transport.REDIS,
          options: {
            host: configService.config.redis.host,
            port: configService.config.redis.port,
            username: process.env.REDIS_PUBSUB_USER || undefined,
            password: process.env.REDIS_PUBSUB_PASSWORD || configService.config.redis.password,
            retryDelay: 1000,
            retryAttempts: 10,
            retryStrategy: () => 1000,
          },
        };

        return ClientProxyFactory.create(clientOptions);
      },
      inject: [CommonConfigService],
    };
  }
}
