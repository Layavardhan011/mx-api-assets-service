import { ConfigurationLoader, ConfigurationLoaderSettings } from "@multiversx/sdk-nestjs-common";
import { join } from "path";
import { Config } from "../entities/config";

const CONFIG_DIRECTORY = '../../../../config/';
const YAML_CONFIG_FILENAME = CONFIG_DIRECTORY + 'config.yaml';
const CONFIG_SCHEMA_FILENAME = CONFIG_DIRECTORY + 'schema.yaml';

export function configuration(): Config {
  const configPath = join(__dirname, YAML_CONFIG_FILENAME);
  const schemaPath = join(__dirname, CONFIG_SCHEMA_FILENAME);

  const settings = new ConfigurationLoaderSettings({
    configPath,
    schemaPath,
  });

  const config = ConfigurationLoader.getConfiguration<Config>(settings);

  // Programmatic fallback defaults for standard MultiversX boilerplate compatibility
  config.libs.common.network = (process.env.NETWORK as any) || 'mainnet';
  config.libs.common.urls = config.libs.common.urls || {};
  config.libs.common.urls.api = process.env.API_URL || 'https://api.multiversx.com';
  config.libs.common.database = config.libs.common.database || {
    host: 'mongodb://127.0.0.1:27017',
    name: 'template',
  };

  return config;
}
