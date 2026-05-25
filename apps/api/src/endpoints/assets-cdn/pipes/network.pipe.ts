import { PipeTransform, BadRequestException } from '@nestjs/common';

export class NetworkPipe implements PipeTransform<string, string> {
  private readonly allowed = ['mainnet', 'testnet', 'devnet'];
  transform(value: string): string {
    const network = (value ?? '').toLowerCase();
    if (!network) {
      return 'mainnet'; // default
    }
    if (!this.allowed.includes(network)) {
      throw new BadRequestException(`Invalid network '${value}'. Allowed values: ${this.allowed.join(', ')}`);
    }
    return network;
  }
}
