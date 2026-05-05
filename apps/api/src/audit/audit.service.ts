import { Injectable, Logger } from '@nestjs/common';
import { chainHash, GENESIS_HASH, verifyChain } from './hash-chain.js';
import type { AuditEvent, AuditEventInput } from './audit.types.js';

/**
 * Append-only hash-chained audit log. The Postgres-backed repository lands
 * with the Drizzle slice as a Timescale hypertable; the chain math, tamper
 * verification, and contract live here so they're shared between in-memory
 * tests, the API runtime, and the offline `compliance-check` CLI.
 */
@Injectable()
export class AuditService {
  private readonly log = new Logger(AuditService.name);
  private readonly events: AuditEvent[] = [];
  private prevHash = GENESIS_HASH;

  append(input: AuditEventInput): AuditEvent {
    const seq = this.events.length + 1;
    const ts = input.ts ?? Date.now();
    const prevHash = this.prevHash;
    const partial: Omit<AuditEvent, 'hash'> = {
      seq,
      ts,
      prevHash,
      tenantId: input.tenantId,
      subjectId: input.subjectId,
      authMethod: input.authMethod,
      action: input.action,
      resource: input.resource,
      decision: input.decision,
      reason: input.reason,
      attrs: input.attrs ?? {},
    };
    const hash = chainHash(prevHash, partial);
    const ev: AuditEvent = { ...partial, hash };
    this.events.push(ev);
    this.prevHash = hash;
    return ev;
  }

  list(): readonly AuditEvent[] {
    return this.events;
  }

  /** Tamper detection: re-derives the chain from genesis. */
  verify(): { ok: boolean; firstBadIndex: number } {
    return verifyChain(this.events);
  }

  /** WORM anchor candidate: { count, headHash } captured for daily anchoring. */
  head(): { count: number; headHash: string } {
    return { count: this.events.length, headHash: this.prevHash };
  }
}
