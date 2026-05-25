import { Token } from "@libs/entities";
import { Injectable } from "@nestjs/common";

@Injectable()
export class TokenRepository {
  private tokens: Token[] = [];

  create(token: Token): Promise<Token> {
    this.tokens.push(token);
    return Promise.resolve(token);
  }

  findAll(): Promise<Token[]> {
    return Promise.resolve(this.tokens);
  }
}
