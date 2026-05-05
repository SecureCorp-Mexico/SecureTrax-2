import { describe, expect, it } from 'vitest';
import {
  approverDigest,
  ed25519Keypair,
  planHash,
  signDeploy,
  signPlanBody,
  verifyApproval,
  verifyDeploy,
} from './crypto.js';
import type { FlightPlan, SignedRemoteMissionDeploy } from './types.js';

function plan(over: Partial<FlightPlan> = {}): FlightPlan {
  return {
    id: 'plan-1',
    tenantId: 'default',
    aircraftId: 'DRONE-3',
    name: 'survey',
    authorId: 'alice',
    notBeforeMs: 1_700_000_000_000,
    notAfterMs: 1_700_000_000_000 + 3_600_000,
    waypoints: [
      { seq: 0, lat: 19.43, lon: -99.13, alt: 50 },
      { seq: 1, lat: 19.44, lon: -99.13, alt: 50 },
    ],
    hash: '',
    approvals: [],
    createdAtMs: 0,
    updatedAtMs: 0,
    ...over,
  };
}

describe('plan signing + verification', () => {
  it('round-trips a valid signature', () => {
    const { publicKey, privateKey } = ed25519Keypair();
    const p = plan();
    const sig = signPlanBody(p, privateKey);
    expect(verifyApproval(p, sig, publicKey)).toBe(true);
  });

  it('rejects when waypoints are tampered with', () => {
    const { publicKey, privateKey } = ed25519Keypair();
    const p = plan();
    const sig = signPlanBody(p, privateKey);
    const tampered = {
      ...p,
      waypoints: [...p.waypoints, { seq: 2, lat: 19.45, lon: -99.13, alt: 50 }],
    };
    expect(verifyApproval(tampered, sig, publicKey)).toBe(false);
  });

  it('rejects when validity window is changed', () => {
    const { publicKey, privateKey } = ed25519Keypair();
    const p = plan();
    const sig = signPlanBody(p, privateKey);
    expect(
      verifyApproval({ ...p, notAfterMs: p.notAfterMs + 1 }, sig, publicKey),
    ).toBe(false);
  });

  it('hash is stable across canonical key reordering', () => {
    const a = plan({ name: 'A' });
    const b = plan({ name: 'A' });
    expect(planHash(a)).toBe(planHash(b));
  });

  it('hash changes when a waypoint changes', () => {
    const a = plan();
    const b = plan({
      waypoints: [...plan().waypoints, { seq: 2, lat: 19.5, lon: -99.13, alt: 50 }],
    });
    expect(planHash(a)).not.toBe(planHash(b));
  });
});

describe('approverDigest', () => {
  it('is order-independent', () => {
    expect(approverDigest(['kid-A', 'kid-B'])).toBe(
      approverDigest(['kid-B', 'kid-A']),
    );
  });
  it('changes with the set', () => {
    expect(approverDigest(['kid-A'])).not.toBe(approverDigest(['kid-A', 'kid-B']));
  });
});

describe('deploy signing + verification', () => {
  it('round-trips a valid deploy signature', () => {
    const { publicKey, privateKey } = ed25519Keypair();
    const cmdNoSig: Omit<SignedRemoteMissionDeploy, 'sig'> = {
      type: 'RemoteMissionDeploy',
      v: 1,
      planId: 'plan-1',
      planHash: 'abc',
      aircraftId: 'DRONE-3',
      tenantId: 'default',
      iatMs: 1_700_000_000_000,
      approverDigest: 'def',
      kid: 'deploy-key-1',
    };
    const sig = signDeploy(cmdNoSig, privateKey);
    const cmd: SignedRemoteMissionDeploy = { ...cmdNoSig, sig };
    expect(verifyDeploy(cmd, publicKey)).toBe(true);
  });

  it('rejects a tampered planHash', () => {
    const { publicKey, privateKey } = ed25519Keypair();
    const base: Omit<SignedRemoteMissionDeploy, 'sig'> = {
      type: 'RemoteMissionDeploy',
      v: 1,
      planId: 'plan-1',
      planHash: 'abc',
      aircraftId: 'DRONE-3',
      tenantId: 'default',
      iatMs: 1_700_000_000_000,
      approverDigest: 'def',
      kid: 'deploy-key-1',
    };
    const sig = signDeploy(base, privateKey);
    const tampered: SignedRemoteMissionDeploy = {
      ...base,
      sig,
      planHash: 'modified-hash',
    };
    expect(verifyDeploy(tampered, publicKey)).toBe(false);
  });
});
