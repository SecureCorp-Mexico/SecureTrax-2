import { Global, Module } from '@nestjs/common';
import { JwtStrategy } from './jwt.strategy.js';
import { PatStrategy } from './pat.strategy.js';
import { ApiKeyStrategy } from './api-key.strategy.js';
import { AuthService } from './auth.service.js';
import { AuthMiddleware } from './auth.middleware.js';

@Global()
@Module({
  providers: [JwtStrategy, PatStrategy, ApiKeyStrategy, AuthService, AuthMiddleware],
  exports: [JwtStrategy, PatStrategy, ApiKeyStrategy, AuthService, AuthMiddleware],
})
export class AuthModule {}
