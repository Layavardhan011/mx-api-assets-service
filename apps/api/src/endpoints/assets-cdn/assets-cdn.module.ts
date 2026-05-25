import { Module } from "@nestjs/common";
import { AssetsCdnProxyController } from "./controllers/assets-cdn-proxy.controller";
import { AssetsCdnProxyService } from "./services/assets-cdn-proxy.service";
import { EnvironmentConfigModule, DistributedCacheModule, GithubRepositoryModule } from "@libs/common";

@Module({
  imports: [
    EnvironmentConfigModule,
    DistributedCacheModule,
    GithubRepositoryModule,
  ],
  controllers: [AssetsCdnProxyController],
  providers: [AssetsCdnProxyService],
  exports: [AssetsCdnProxyService],
})
export class AssetsCdnModule {}
