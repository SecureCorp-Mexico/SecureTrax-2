import { Injectable } from '@nestjs/common';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { IamService } from '../iam/iam.service.js';
import type { Principal } from '../iam/principal.js';
import type { AuthRequest, AuthStrategy } from './auth.types.js';

interface StoredPat {
  id: string;
  /** sha256(token) hex, never the token itself. */
  hash: string;
  subjectId: string;
  tenantId: string;
  expiresAt?: number;
  revokedAt?: number;
}

/**
 * Personal Access Tokens — for CLI/scripts. Keys are stored hashed; raw token
 * is only returned at issue time. The DB-backed store lands with the IAM
 * tables; this in-memory version is sufficient to wire the strategy.
 */
@Injectable()
export class PatStrategy implements AuthStrategy {
  readonly name = 'pat' as const;
  private readonly tokens = new Map<string, StoredPat>();

  constructor(private readonly iam: IamService) {}

  async authenticate(req: AuthRequest): Promise<Principal | undefined> {
    const auth = first(req.headers['authorization']);
    if (!auth?.startsWith('PAT ')) return undefined;
    const token = auth.slice('PAT '.length).trim();
    if (token.length === 0) return undefined;
    const hash = sha256Hex(token);

    let match: StoredPat | undefined;
    for (const pat of this.tokens.values()) {
      if (constantTimeEq(hash, pat.hash)) {
        match = pat;
        break;
      }
    }
    if (!match) return undefined;
    if (match.revokedAt) return undefined;
    if (match.expiresAt && Date.now() / 1000 > match.expiresAt) return undefined;

    const eff = this.iam.effectivePermissions(match.subjectId);
    return {
      subjectId: match.subjectId,
      tenantId: match.tenantId,
      authMethod: 'pat',
      permissions: eff.permissions,
      scope: eff.scope,
      roleIds: eff.roleIds,
    };
  }

  /** Test/dev helper: issue a PAT and return the raw token (only time you see it). */
  issue(subjectId: string, tenantId: string, ttlSeconds?: number): { id: string; raw: string } {
    const id = `pat-${this.tokens.size + 1}`;
    const raw = `${id}.${cryptoRandom(32)}`;
    this.tokens.set(id, {
      id,
      hash: sha256Hex(raw),
      subjectId,
      tenantId,
      expiresAt: ttlSeconds ? Math.floor(Date.now() / 1000) + ttlSeconds : undefined,
    });
    return { id, raw };
  }

  revoke(id: string): void {
    const pat = this.tokens.get(id);
    if (pat) pat.revokedAt = Math.floor(Date.now() / 1000);
  }
}

function first(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v;
}
function sha256Hex(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}
function constantTimeEq(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}
function cryptoRandom(bytes: number): string {
  return randomBytes(bytes).toString('base64url');
}
