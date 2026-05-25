import { Module } from "@nestjs/common";
import { EnvironmentConfigModule } from "../config/environment-config.module";
import { GithubRepositoryConnector } from "./github-repository.connector";

@Module({
  imports: [EnvironmentConfigModule],
  providers: [GithubRepositoryConnector],
  exports: [GithubRepositoryConnector],
})
export class GithubRepositoryModule {}
