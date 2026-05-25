import { Module } from "@nestjs/common";
import { DynamicModuleUtils } from "@libs/common";
import { AssetsCdnModule } from "./assets-cdn/assets-cdn.module";

@Module({
  imports: [
    AssetsCdnModule,
  ],
  providers: [
    DynamicModuleUtils.getNestJsApiConfigService(),
  ],
})
export class EndpointsModule { }
