import { createHash, generateKeyPairSync, sign, verify } from 'node:crypto';
import { canonicalize } from '@securetrax/core';
import type { FlightPlan, SignedRemoteMissionDeploy } from './types.js';

/**
 * Canonical plan body — everything that, when changed, should invalidate
 * existing approvals. Authoring metadata (createdAtMs, updatedAtMs) is
 * deliberately excluded so cosmetic edits to the row don't void signatures
 * — but waypoints, geofence, validity window, target aircraft, and tenant
 * are all in.
 */
export function planBody(plan: FlightPlan): Record<string, unknown> {
  return {
    id: plan.id,
    tenantId: plan.tenantId,
    aircraftId: plan.aircraftId,
    name: plan.name,
    notBeforeMs: plan.notBeforeMs,
    notAfterMs: plan.notAfterMs,
    waypoints: plan.waypoints,
    geofence: plan.geofence ?? null,
  };
}

export function planHash(plan: FlightPlan): string {
  return createHash('sha256').update(canonicalize(planBody(plan))).digest('hex');
}

export function signPlanBody(
  plan: FlightPlan,
  privateKeyPem: string,
): string {
  return sign(null, Buffer.from(canonicalize(planBody(plan)), 'utf8'), privateKeyPem)
    .toString('base64');
}

export function verifyApproval(
  plan: FlightPlan,
  signatureB64: string,
  publicKeyPem: string,
): boolean {
  return verify(
    null,
    Buffer.from(canonicalize(planBody(plan)), 'utf8'),
    publicKeyPem,
    Buffer.from(signatureB64, 'base64'),
  );
}

/** Body the deploy key signs and the onboard sidecar verifies. */
export function deployBody(
  cmd: Omit<SignedRemoteMissionDeploy, 'sig' | 'kid'>,
): Record<string, unknown> {
  return {
    type: cmd.type,
    v: cmd.v,
    planId: cmd.planId,
    planHash: cmd.planHash,
    aircraftId: cmd.aircraftId,
    tenantId: cmd.tenantId,
    iatMs: cmd.iatMs,
    approverDigest: cmd.approverDigest,
  };
}

export function signDeploy(
  cmd: Omit<SignedRemoteMissionDeploy, 'sig'>,
  privateKeyPem: string,
): string {
  return sign(null, Buffer.from(canonicalize(deployBody(cmd)), 'utf8'), privateKeyPem)
    .toString('base64');
}

export function verifyDeploy(
  cmd: SignedRemoteMissionDeploy,
  publicKeyPem: string,
): boolean {
  return verify(
    null,
    Buffer.from(canonicalize(deployBody(cmd)), 'utf8'),
    publicKeyPem,
    Buffer.from(cmd.sig, 'base64'),
  );
}

export function approverDigest(kids: string[]): string {
  // sorted to match a sidecar that checks the digest as a set, not a list
  const sorted = [...kids].sort();
  return createHash('sha256').update(sorted.join('|')).digest('hex');
}

/** Test/dev helper. */
export function ed25519Keypair(): { publicKey: string; privateKey: string } {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  return {
    publicKey: publicKey.export({ type: 'spki', format: 'pem' }) as string,
    privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }) as string,
  };
}
