import { IsString, Matches, IsOptional } from "class-validator";

export class AddressParam {
  @IsString()
  @Matches(/^erd1[a-z0-9]{58}$/, { message: "Invalid address format" })
  address!: string;
}

export class IdentifierParam {
  @IsString()
  @Matches(/^[a-zA-Z0-9-]{2,50}$/, { message: "Invalid identifier format" })
  identifier!: string;
}

export class IdentityParam {
  @IsString()
  @Matches(/^[a-zA-Z0-9._-]{2,50}$/, { message: "Invalid identity format" })
  identity!: string;
}

export class WildcardParams {
  @IsString()
  @Matches(/^[a-zA-Z0-9._-]+$/, { message: "Invalid parameter" })
  p1!: string;

  @IsOptional()
  @IsString()
  @Matches(/^[a-zA-Z0-9._-]*$/, { message: "Invalid parameter" })
  p2?: string;
}

export class WildcardItemParams {
  @IsString()
  @Matches(/^[a-zA-Z0-9._-]+$/, { message: "Invalid parameter" })
  p1!: string;

  @IsString()
  @Matches(/^[a-zA-Z0-9._-]+$/, { message: "Invalid parameter" })
  p2!: string;

  @IsOptional()
  @IsString()
  @Matches(/^[a-zA-Z0-9._-]*$/, { message: "Invalid parameter" })
  p3?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[a-zA-Z0-9._-]*$/, { message: "Invalid parameter" })
  p4?: string;
}
