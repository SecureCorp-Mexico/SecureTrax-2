import { describe, expect, it } from 'vitest';
import { AuditService } from './audit.service.js';
import { verifyChain } from './hash-chain.js';

describe('AuditService hash chain', () => {
  it('appends events with monotonic seq + linked prevHash', () => {
    const a = new AuditService();
    const e1 = a.append({
      tenantId: 'default',
      subjectId: 'alice',
      action: 'login',
      decision: 'allowed',
    });
    const e2 = a.append({
      tenantId: 'default',
      subjectId: 'alice',
      action: 'tracking.assets.read',
      decision: 'allowed',
    });
    expect(e1.seq).toBe(1);
    expect(e2.seq).toBe(2);
    expect(e2.prevHash).toBe(e1.hash);
    expect(a.head()).toEqual({ count: 2, headHash: e2.hash });
  });

  it('verify() passes on an untouched chain', () => {
    const a = new AuditService();
    for (let i = 0; i < 10; i++) {
      a.append({ tenantId: 'default', action: `op-${i}`, decision: 'allowed' });
    }
    expect(a.verify()).toEqual({ ok: true, firstBadIndex: -1 });
  });

  it('verify() detects a tampered field', () => {
    const a = new AuditService();
    a.append({ tenantId: 'default', action: 'a', decision: 'allowed' });
    a.append({ tenantId: 'default', action: 'b', decision: 'allowed' });
    a.append({ tenantId: 'default', action: 'c', decision: 'allowed' });

    const events = [...a.list()];
    // Simulate a DBA flipping a denial to an allowance.
    const tampered = { ...events[1]!, decision: 'allowed' as const, action: 'b-tampered' };
    const tamperedList = [events[0]!, tampered, events[2]!];
    expect(verifyChain(tamperedList)).toEqual({ ok: false, firstBadIndex: 1 });
  });

  it('verify() detects deletion (broken seq)', () => {
    const a = new AuditService();
    a.append({ tenantId: 'default', action: 'a', decision: 'allowed' });
    a.append({ tenantId: 'default', action: 'b', decision: 'allowed' });
    a.append({ tenantId: 'default', action: 'c', decision: 'allowed' });

    const events = [...a.list()];
    const withGap = [events[0]!, events[2]!];
    expect(verifyChain(withGap)).toEqual({ ok: false, firstBadIndex: 1 });
  });

  it('logs both allowed and denied decisions', () => {
    const a = new AuditService();
    a.append({ tenantId: 'default', action: 'aircraft.deploy', decision: 'denied', reason: 'no-mfa' });
    a.append({ tenantId: 'default', action: 'aircraft.deploy', decision: 'allowed' });
    expect(a.list()[0]!.decision).toBe('denied');
    expect(a.list()[0]!.reason).toBe('no-mfa');
    expect(a.verify().ok).toBe(true);
  });
});
