import { Injectable, Logger } from '@nestjs/common';
import { IamService } from '../iam/iam.service.js';
import type { Principal } from '../iam/principal.js';
import type { AuthRequest, AuthStrategy } from './auth.types.js';

/**
 * Phase-0 dev JWT strategy. The full implementation in section 10 of the plan
 * verifies signatures against Keycloak's JWKS, enforces audience+issuer, honors
 * step-up MFA claims, and supports key rotation. For Phase 0 we accept any
 * properly-shaped bearer that decodes — sufficient for wiring downstream
 * guards. JwksClient + signature verification land alongside Keycloak realm
 * setup in the next slice.
 */
@Injectable()
export class JwtStrategy implements AuthStrategy {
  readonly name = 'jwt' as const;
  private readonly log = new Logger(JwtStrategy.name);

  constructor(private readonly iam: IamService) {}

  async authenticate(req: AuthRequest): Promise<Principal | undefined> {
    const auth = headerString(req.headers['authorization']);
    if (!auth?.startsWith('Bearer ')) return undefined;
    const token = auth.slice('Bearer '.length).trim();
    if (token.length === 0) return undefined;

    const claims = decodeJwtUnsafe(token);
    if (!claims) return undefined;

    const subjectId = String(claims.sub ?? '');
    const tenantId = String(claims.tenant_id ?? claims.tid ?? 'default');
    if (!subjectId) return undefined;

    const eff = this.iam.effectivePermissions(subjectId);
    return {
      subjectId,
      tenantId,
      authMethod: 'jwt',
      permissions: eff.permissions,
      scope: eff.scope,
      roleIds: eff.roleIds,
      mfaSince:
        typeof claims.amr_ts === 'number'
          ? claims.amr_ts
          : typeof claims.auth_time === 'number'
            ? claims.auth_time
            : undefined,
    };
  }
}

function headerString(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v;
}

function decodeJwtUnsafe(token: string): Record<string, unknown> | undefined {
  const parts = token.split('.');
  if (parts.length !== 3) return undefined;
  try {
    const payload = parts[1] ?? '';
    const json = Buffer.from(payload, 'base64url').toString('utf8');
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}
