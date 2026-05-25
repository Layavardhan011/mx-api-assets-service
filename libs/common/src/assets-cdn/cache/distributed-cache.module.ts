import { Module } from "@nestjs/common";
import { DynamicModuleUtils } from "../../utils/dynamic.module.utils";
import { DistributedCacheService } from "./distributed-cache.service";

@Module({
  imports: [DynamicModuleUtils.getCachingModule()],
  providers: [DistributedCacheService],
  exports: [DistributedCacheService],
})
export class DistributedCacheModule {}
