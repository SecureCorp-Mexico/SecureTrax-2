import { createHash } from 'node:crypto';
import { canonicalize } from '@securetrax/core';
import type { AuditEvent } from './audit.types.js';

export const GENESIS_HASH = '0'.repeat(64);

/**
 * Compute the hash of an event given the previous hash. The "rest of fields"
 * include everything except the hash itself, canonicalized for stability.
 */
export function chainHash(prevHash: string, ev: Omit<AuditEvent, 'hash'>): string {
  const canonical = canonicalize({
    seq: ev.seq,
    ts: ev.ts,
    prevHash,
    tenantId: ev.tenantId,
    subjectId: ev.subjectId ?? null,
    authMethod: ev.authMethod ?? null,
    action: ev.action,
    resource: ev.resource ?? null,
    decision: ev.decision,
    reason: ev.reason ?? null,
    attrs: ev.attrs ?? {},
  });
  return createHash('sha256').update(canonical).digest('hex');
}

/**
 * Re-derive the chain over `events` and return the index of the first row that
 * fails verification (-1 means the chain is intact).
 */
export function verifyChain(events: AuditEvent[]): { ok: boolean; firstBadIndex: number } {
  let prev = GENESIS_HASH;
  for (let i = 0; i < events.length; i++) {
    const ev = events[i]!;
    if (ev.prevHash !== prev) return { ok: false, firstBadIndex: i };
    if (ev.seq !== i + 1) return { ok: false, firstBadIndex: i };
    const expected = chainHash(prev, {
      seq: ev.seq,
      ts: ev.ts,
      tenantId: ev.tenantId,
      subjectId: ev.subjectId,
      authMethod: ev.authMethod,
      action: ev.action,
      resource: ev.resource,
      decision: ev.decision,
      reason: ev.reason,
      attrs: ev.attrs,
      prevHash: prev,
    });
    if (expected !== ev.hash) return { ok: false, firstBadIndex: i };
    prev = ev.hash;
  }
  return { ok: true, firstBadIndex: -1 };
}
