import { IsString, Matches, IsOptional, IsNotIn } from "class-validator";

export const RESERVED_IDENTIFIERS = [
  "constructor",
  "__proto__",
  "prototype",
  "toString",
  "valueOf",
  "hasOwnProperty",
  "isPrototypeOf",
  "propertyIsEnumerable",
  "toLocaleString",
];

export class AddressParam {
  @IsString()
  @Matches(/^erd1[a-z0-9]{58}$/, { message: "Invalid address format" })
  address!: string;
}

export class IdentifierParam {
  @IsString()
  @Matches(/^[a-zA-Z0-9-]{2,50}$/, { message: "Invalid identifier format" })
  @IsNotIn(RESERVED_IDENTIFIERS, { message: "Invalid identifier" })
  identifier!: string;
}

export class IdentityParam {
  @IsString()
  @Matches(/^[a-zA-Z0-9._-]{2,50}$/, { message: "Invalid identity format" })
  @IsNotIn(RESERVED_IDENTIFIERS, { message: "Invalid identity" })
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
