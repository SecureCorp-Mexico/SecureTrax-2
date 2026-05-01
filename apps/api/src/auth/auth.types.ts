import type { Principal } from '../iam/principal.js';

export interface AuthRequest {
  principal?: Principal;
  headers: Record<string, string | string[] | undefined>;
}

export interface AuthStrategy {
  readonly name: 'jwt' | 'pat' | 'api-key' | 'mtls';
  /** Returns the decoded principal if this strategy applies, otherwise undefined. */
  authenticate(req: AuthRequest): Promise<Principal | undefined>;
}
