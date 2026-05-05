import { Injectable, Logger } from '@nestjs/common';
import { JwtStrategy } from './jwt.strategy.js';
import { PatStrategy } from './pat.strategy.js';
import { ApiKeyStrategy } from './api-key.strategy.js';
import type { Principal } from '../iam/principal.js';
import type { AuthRequest, AuthStrategy } from './auth.types.js';

/**
 * Tries each registered strategy in order. The first that returns a Principal
 * wins. mTLS strategy slots in once device PKI lands.
 */
@Injectable()
export class AuthService {
  private readonly log = new Logger(AuthService.name);
  private readonly strategies: AuthStrategy[];

  constructor(jwt: JwtStrategy, pat: PatStrategy, apiKey: ApiKeyStrategy) {
    this.strategies = [jwt, pat, apiKey];
  }

  async authenticate(req: AuthRequest): Promise<Principal | undefined> {
    for (const s of this.strategies) {
      const principal = await s.authenticate(req);
      if (principal) return principal;
    }
    return undefined;
  }
}
