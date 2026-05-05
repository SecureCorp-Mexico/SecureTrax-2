import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { planHash, verifyApproval } from './crypto.js';
import type { FlightPlan, FlightWaypoint, PlanApproval } from './types.js';

interface UpsertInput {
  id?: string;
  tenantId: string;
  aircraftId: string;
  name: string;
  authorId: string;
  notBeforeMs: number;
  notAfterMs: number;
  waypoints: FlightWaypoint[];
  geofence?: Array<[number, number]>;
}

/**
 * In-memory store for flight plans + their N-of-M approvals. The Drizzle
 * schema lands with the next migration. The interface here is the contract
 * the controller depends on, so swapping it is a single-class change.
 *
 * Approvals are tied to the plan body via an Ed25519 signature; any post-
 * approval edit recomputes the hash, which invalidates existing approvals.
 * The controller calls clearApprovalsIfHashChanged() on every update.
 */
@Injectable()
export class PlansService {
  private readonly plans = new Map<string, FlightPlan>();
  /** kid → approver public key PEM (registered out-of-band; in-memory for now). */
  private readonly approverKeys = new Map<string, string>();

  registerApproverKey(kid: string, publicKeyPem: string): void {
    this.approverKeys.set(kid, publicKeyPem);
  }

  getApproverPublicKey(kid: string): string | undefined {
    return this.approverKeys.get(kid);
  }

  list(tenantId: string): FlightPlan[] {
    return [...this.plans.values()].filter((p) => p.tenantId === tenantId);
  }

  get(tenantId: string, id: string): FlightPlan | undefined {
    const p = this.plans.get(id);
    return p && p.tenantId === tenantId ? p : undefined;
  }

  upsert(input: UpsertInput): FlightPlan {
    const id = input.id ?? `plan-${randomUUID()}`;
    const now = Date.now();
    const existing = this.plans.get(id);
    const draft: FlightPlan = {
      id,
      tenantId: input.tenantId,
      aircraftId: input.aircraftId,
      name: input.name,
      authorId: input.authorId,
      notBeforeMs: input.notBeforeMs,
      notAfterMs: input.notAfterMs,
      waypoints: input.waypoints,
      geofence: input.geofence,
      hash: '',
      approvals: existing?.approvals ?? [],
      createdAtMs: existing?.createdAtMs ?? now,
      updatedAtMs: now,
      deployedAtMs: existing?.deployedAtMs,
    };
    draft.hash = planHash(draft);
    if (existing && existing.hash !== draft.hash) {
      // Mutating semantics: post-edit, all prior approvals are void. The
      // approver UI re-prompts. This is the central safety property — the
      // signature is against the canonical body, so a different hash means
      // the body changed.
      draft.approvals = [];
    }
    this.plans.set(id, draft);
    return draft;
  }

  /**
   * Add an approver signature to a plan. Verifies first; throws on
   * invalid signature or unknown kid.
   */
  addApproval(
    tenantId: string,
    id: string,
    approval: Omit<PlanApproval, 'signedAtMs'> & { signedAtMs?: number },
  ): FlightPlan {
    const p = this.get(tenantId, id);
    if (!p) throw new Error(`plan ${id} not found`);
    const pubKey = this.approverKeys.get(approval.kid);
    if (!pubKey) throw new Error(`unknown approver kid: ${approval.kid}`);
    if (approval.approverId === p.authorId) {
      throw new Error('separation-of-duties: author cannot also approve');
    }
    if (!verifyApproval(p, approval.signature, pubKey)) {
      throw new Error('invalid approval signature');
    }
    if (p.approvals.some((a) => a.approverId === approval.approverId)) {
      throw new Error(
        `approver ${approval.approverId} has already signed plan ${id}`,
      );
    }
    const signed: PlanApproval = {
      approverId: approval.approverId,
      signedAtMs: approval.signedAtMs ?? Date.now(),
      signature: approval.signature,
      kid: approval.kid,
    };
    p.approvals.push(signed);
    p.updatedAtMs = Date.now();
    return p;
  }

  markDeployed(tenantId: string, id: string): FlightPlan {
    const p = this.get(tenantId, id);
    if (!p) throw new Error(`plan ${id} not found`);
    p.deployedAtMs = Date.now();
    p.updatedAtMs = p.deployedAtMs;
    return p;
  }

  /** Test/dev: pre-seed an approver key. */
  seedApprover(kid: string, publicKeyPem: string): void {
    this.approverKeys.set(kid, publicKeyPem);
  }
}
