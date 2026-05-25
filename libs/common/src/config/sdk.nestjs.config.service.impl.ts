import { Injectable } from "@nestjs/common";
import { MxnestConfigService } from "@multiversx/sdk-nestjs-common";
import { CommonConfigService } from "./common.config.service";

@Injectable()
export class SdkNestjsConfigServiceImpl implements MxnestConfigService {
  constructor(
    private readonly commonConfigService: CommonConfigService,
  ) { }

  getSecurityAdmins(): string[] {
    return this.commonConfigService.config.security.admins;
  }

  getJwtSecret(): string {
    return ''; // We use only NativeAuth in this template, so we don't need a JWT secret
  }

  getApiUrl(): string {
    return this.commonConfigService.config.urls.api;
  }

  getNativeAuthMaxExpirySeconds(): number {
    return this.commonConfigService.config.nativeAuth.maxExpirySeconds;
  }

  getNativeAuthAcceptedOrigins(): string[] {
    return this.commonConfigService.config.nativeAuth.acceptedOrigins;
  }
}
