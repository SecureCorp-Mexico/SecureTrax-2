import { Injectable, Logger } from '@nestjs/common';
import { createRemoteJWKSet, jwtVerify, type JWTPayload, type JWTVerifyGetKey } from 'jose';
import { IamService } from '../iam/iam.service.js';
import type { Principal } from '../iam/principal.js';
import type { AuthRequest, AuthStrategy } from './auth.types.js';

const ALLOWED_ALG = ['RS256', 'RS384', 'RS512', 'ES256', 'ES384', 'PS256'];

interface VerifierOpts {
  issuer: string;
  audience: string;
  jwksUri: string;
}

/**
 * Production JWT strategy. Verifies tokens against Keycloak's JWKS with full
 * signature + audience + issuer + expiry checks via `jose`. Configured by
 * env:
 *   KEYCLOAK_ISSUER   — full realm URL, e.g. http://keycloak:8080/realms/securetrax
 *   KEYCLOAK_AUDIENCE — client_id this API is registered as (default: `securetrax-api`)
 *   KEYCLOAK_JWKS_URI — defaults to <issuer>/protocol/openid-connect/certs
 *
 * Falls back to a dev decode-and-trust mode when those vars aren't set, so
 * `pnpm dev` keeps working without a running Keycloak. Logged loudly so
 * production deployments can't accidentally ship in dev mode.
 */
@Injectable()
export class JwtStrategy implements AuthStrategy {
  readonly name = 'jwt' as const;
  private readonly log = new Logger(JwtStrategy.name);
  private readonly verifier?: { opts: VerifierOpts; jwks: JWTVerifyGetKey };
  private readonly devFallback: boolean;

  constructor(private readonly iam: IamService) {
    const issuer = process.env.KEYCLOAK_ISSUER;
    if (!issuer) {
      this.devFallback = true;
      this.log.warn(
        'KEYCLOAK_ISSUER not set — JWT strategy is in DEV MODE (decode-and-trust). DO NOT ship to production like this.',
      );
      return;
    }
    const audience = process.env.KEYCLOAK_AUDIENCE ?? 'securetrax-api';
    const jwksUri =
      process.env.KEYCLOAK_JWKS_URI ?? `${issuer.replace(/\/$/, '')}/protocol/openid-connect/certs`;
    this.devFallback = false;
    this.verifier = {
      opts: { issuer, audience, jwksUri },
      jwks: createRemoteJWKSet(new URL(jwksUri), { cooldownDuration: 30_000 }),
    };
    this.log.log(`JWT strategy verifying against ${issuer} (audience=${audience})`);
  }

  async authenticate(req: AuthRequest): Promise<Principal | undefined> {
    const auth = headerString(req.headers['authorization']);
    if (!auth?.startsWith('Bearer ')) return undefined;
    const token = auth.slice('Bearer '.length).trim();
    if (!token) return undefined;

    let claims: JWTPayload;
    if (this.verifier) {
      try {
        const result = await jwtVerify(token, this.verifier.jwks, {
          issuer: this.verifier.opts.issuer,
          audience: this.verifier.opts.audience,
          algorithms: ALLOWED_ALG,
        });
        claims = result.payload;
      } catch (e) {
        this.log.debug(
          `jwt verification failed: ${e instanceof Error ? e.message : String(e)}`,
        );
        return undefined;
      }
    } else {
      const decoded = decodeJwtUnsafe(token);
      if (!decoded) return undefined;
      claims = decoded as JWTPayload;
    }

    const subjectId = String(claims.sub ?? '');
    const tenantId = String(
      (claims as Record<string, unknown>)['tenant_id'] ??
        (claims as Record<string, unknown>)['tid'] ??
        'default',
    );
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
        typeof (claims as Record<string, unknown>)['amr_ts'] === 'number'
          ? ((claims as Record<string, unknown>)['amr_ts'] as number)
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
