import { Module } from '@nestjs/common';
import { TokenRepository } from './repositories/token.repository';
import { UserRepository } from './repositories/user.repository';

@Module({
  providers: [
    TokenRepository,
    UserRepository,
  ],
  exports: [
    TokenRepository,
    UserRepository,
  ],
})
export class DatabaseModule { }
