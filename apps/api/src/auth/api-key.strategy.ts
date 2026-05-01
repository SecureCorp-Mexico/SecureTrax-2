import { Injectable } from '@nestjs/common';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { IamService } from '../iam/iam.service.js';
import type { Principal } from '../iam/principal.js';
import type { ResourceScope } from '../iam/permissions.js';
import type { AuthRequest, AuthStrategy } from './auth.types.js';

interface StoredApiKey {
  id: string;
  hash: string;
  subjectId: string;
  tenantId: string;
  scope: ResourceScope;
  ipAllowlist?: string[];
  scopes: string[];
  revokedAt?: number;
}

/**
 * Machine API keys: per-key RBAC scopes + IP allowlist. Header form:
 *   `Authorization: ApiKey <id>.<secret>` or via `X-Api-Key` directly.
 */
@Injectable()
export class ApiKeyStrategy implements AuthStrategy {
  readonly name = 'api-key' as const;
  private readonly keys = new Map<string, StoredApiKey>();

  constructor(private readonly iam: IamService) {}

  async authenticate(req: AuthRequest): Promise<Principal | undefined> {
    const candidate = readKey(req);
    if (!candidate) return undefined;
    const hash = sha256Hex(candidate);

    let match: StoredApiKey | undefined;
    for (const key of this.keys.values()) {
      if (constantTimeEq(hash, key.hash)) {
        match = key;
        break;
      }
    }
    if (!match || match.revokedAt) return undefined;

    if (match.ipAllowlist && match.ipAllowlist.length > 0) {
      const remote = readIp(req);
      if (!remote || !match.ipAllowlist.includes(remote)) return undefined;
    }

    const eff = this.iam.effectivePermissions(match.subjectId);
    return {
      subjectId: match.subjectId,
      tenantId: match.tenantId,
      authMethod: 'api-key',
      permissions: eff.permissions,
      scope: match.scope,
      roleIds: eff.roleIds,
    };
  }

  issue(opts: {
    subjectId: string;
    tenantId: string;
    scope: ResourceScope;
    scopes?: string[];
    ipAllowlist?: string[];
  }): { id: string; raw: string } {
    const id = `key-${this.keys.size + 1}`;
    const raw = `${id}.${randomBytes(32).toString('base64url')}`;
    this.keys.set(id, {
      id,
      hash: sha256Hex(raw),
      subjectId: opts.subjectId,
      tenantId: opts.tenantId,
      scope: opts.scope,
      scopes: opts.scopes ?? [],
      ipAllowlist: opts.ipAllowlist,
    });
    return { id, raw };
  }
}

function readKey(req: AuthRequest): string | undefined {
  const xKey = first(req.headers['x-api-key']);
  if (xKey && xKey.length > 0) return xKey;
  const auth = first(req.headers['authorization']);
  if (auth?.startsWith('ApiKey ')) return auth.slice('ApiKey '.length).trim();
  return undefined;
}
function readIp(req: AuthRequest): string | undefined {
  const fwd = first(req.headers['x-forwarded-for']);
  if (fwd) return fwd.split(',')[0]?.trim();
  return undefined;
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
