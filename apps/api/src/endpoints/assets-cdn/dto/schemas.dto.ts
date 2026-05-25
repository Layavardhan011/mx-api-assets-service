import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AccountAssetsSocial {
  @ApiProperty({ type: String, nullable: true }) website!: string | null;
  @ApiProperty({ type: String, nullable: true }) email!: string | null;
  @ApiProperty({ type: String, nullable: true }) blog!: string | null;
  @ApiProperty({ type: String, nullable: true }) twitter!: string | null;
  @ApiProperty({ type: String, nullable: true }) discord!: string | null;
  @ApiProperty({ type: String, nullable: true }) telegram!: string | null;
  @ApiProperty({ type: String, nullable: true }) facebook!: string | null;
  @ApiProperty({ type: String, nullable: true }) instagram!: string | null;
  @ApiProperty({ type: String, nullable: true }) youtube!: string | null;
  @ApiProperty({ type: String, nullable: true }) whitepaper!: string | null;
  @ApiProperty({ type: String, nullable: true }) coinmarketcap!: string | null;
  @ApiProperty({ type: String, nullable: true }) coingecko!: string | null;
  @ApiProperty({ type: String, nullable: true }) linkedin!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) github?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) linktree?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) reddit?: string | null;
}

export class AccountAssets {
  @ApiProperty() address!: string;
  @ApiProperty() name!: string;
  @ApiProperty() description!: string;
  @ApiProperty({ type: AccountAssetsSocial, nullable: true }) social!: AccountAssetsSocial | null;
  @ApiProperty({ type: [String] }) tags!: string[];
  @ApiPropertyOptional({ type: String, nullable: true }) proof?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) icon?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) iconPng?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) iconSvg?: string | null;
}

export class IdentityAssets {
  @ApiProperty() identity!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ type: [String] }) owners!: string[];
  @ApiProperty({ type: String, nullable: true }) description!: string | null;
  @ApiProperty({ type: String, nullable: true }) avatar!: string | null;
  @ApiProperty({ type: String, nullable: true }) twitter!: string | null;
  @ApiProperty({ type: String, nullable: true }) website!: string | null;
  @ApiProperty({ type: String, nullable: true }) location!: string | null;
  @ApiPropertyOptional({ type: Object, nullable: true }) social?: Record<string, unknown> | null;
}

export class NftRank {
  @ApiProperty() identifier!: string;
  @ApiProperty() rank!: number;
}

export class TokenAssets {
  @ApiProperty() identifier!: string;
  @ApiProperty() website!: string;
  @ApiProperty() description!: string;
  @ApiProperty({ enum: ['active', 'inactive'], default: 'inactive' }) status!: string;
  @ApiProperty() name!: string;
  @ApiProperty() pngUrl!: string;
  @ApiProperty() svgUrl!: string;
  @ApiProperty({ type: String, nullable: true }) ledgerSignature!: string | null;
  @ApiPropertyOptional({ type: Object, nullable: true }) lockedAccounts?: Record<string, string> | null;
  @ApiProperty({ type: [String], nullable: true }) extraTokens!: string[] | null;
  @ApiProperty({ enum: ['trait', 'statistical', 'openRarity', 'jaccardDistances', 'custom'], nullable: true }) preferredRankAlgorithm!: string | null;
  @ApiProperty({ type: Number, nullable: true }) priceSource!: number | null;
  @ApiProperty({ type: [NftRank], nullable: true }) ranks!: NftRank[] | null;
  @ApiProperty({ type: Object, nullable: true }) social!: Record<string, unknown> | null;
}
