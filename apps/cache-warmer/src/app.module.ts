import { Module } from '@nestjs/common';
import { ApiMetricsController, CommonConfigModule, DynamicModuleUtils, HealthCheckController } from '@libs/common';
import { ApiMetricsModule } from '@libs/common';
import { LoggingModule } from '@multiversx/sdk-nestjs-common';
import { AppConfigModule } from './config/app-config.module';
import { ScheduleModule } from '@nestjs/schedule';
import { WarmerService } from './warmer/warmer.service';
import { ServicesModule } from '@libs/services';
import {
  EnvironmentConfigModule,
  DistributedCacheModule,
  GithubRepositoryModule,
} from "@libs/common";
import { MetadataSynchronizationCron } from './warmer/metadata-synchronization.cron';

@Module({
  imports: [
    LoggingModule,
    ApiMetricsModule,
    ScheduleModule.forRoot(),
    CommonConfigModule,
    AppConfigModule,
    ServicesModule,
    EnvironmentConfigModule,
    DistributedCacheModule,
    GithubRepositoryModule,
  ],
  providers: [
    DynamicModuleUtils.getPubSubService(),
    WarmerService,
    MetadataSynchronizationCron,
  ],
  controllers: [
    ApiMetricsController,
    HealthCheckController,
  ],
})
export class AppModule { }
