import {
  Inject,
  Injectable,
  Logger,
  Optional,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import {
  ASSETS_REPOSITORY,
  BROADCASTER,
  MQTT_CLIENT,
  type IAssetsRepository,
  type IBroadcaster,
  type IMqttClient,
} from '@securetrax/core';
import {
  approverDigest,
  ed25519Keypair,
  signDeploy,
} from './crypto.js';
import { evaluatePreflight } from './preflight.js';
import { PlansService } from './plans.service.js';
import type {
  DeployResult,
  FlightPlan,
  PreflightResult,
  SignedRemoteMissionDeploy,
} from './types.js';

const MIN_APPROVALS = Number(process.env.AIRCRAFT_MIN_APPROVALS ?? 1);

/**
 * Issues signed RemoteMissionDeploy commands once a plan has the required
 * number of valid approvals AND every pre-flight check passes. Pushes the
 * command onto the broker on `securetrax/<tenant>/<aircraft>/cmd` for the
 * onboard sidecar to verify and execute.
 *
 * Deploy keypair is generated once at boot. In production it lives in Vault;
 * in this slice we keep it in memory for the lifetime of the process and
 * expose the public PEM so an operator can pin it in the sidecar config.
 */
@Injectable()
export class DeployService {
  private readonly log = new Logger(DeployService.name);
  private readonly deployKey = ed25519Keypair();
  private readonly deployKid = `deploy-key-${randomBytes(4).toString('hex')}`;

  constructor(
    private readonly plans: PlansService,
    @Inject(ASSETS_REPOSITORY) private readonly assets: IAssetsRepository,
    @Optional() @Inject(MQTT_CLIENT) private readonly mqtt?: IMqttClient,
    @Optional() @Inject(BROADCASTER) private readonly broadcaster?: IBroadcaster,
  ) {
    this.log.log(
      `deploy keypair generated (kid=${this.deployKid}). Pin the public PEM in the sidecar.`,
    );
  }

  deployPublicKey(): { kid: string; publicKey: string } {
    return { kid: this.deployKid, publicKey: this.deployKey.publicKey };
  }

  async deploy(
    tenantId: string,
    planId: string,
    /** Latest aircraft state — telemetry-fed in production, synthesized in tests. */
    runtimeState?: {
      batteryPercent?: number;
      gpsHdop?: number;
      armed?: boolean;
      hasActiveMission?: boolean;
    },
  ): Promise<DeployResult> {
    const plan = this.plans.get(tenantId, planId);
    if (!plan) {
      return { ok: false, checks: [], reason: `plan ${planId} not found` };
    }
    if (plan.approvals.length < MIN_APPROVALS) {
      return {
        ok: false,
        checks: [],
        reason: `not enough approvals: have ${plan.approvals.length}, need ${MIN_APPROVALS}`,
      };
    }
    const aircraft = await this.assets.get(plan.aircraftId);
    const checks: PreflightResult[] = evaluatePreflight({
      plan,
      aircraft,
      batteryPercent: runtimeState?.batteryPercent,
      gpsHdop: runtimeState?.gpsHdop,
      armed: runtimeState?.armed,
      hasActiveMission: runtimeState?.hasActiveMission,
    });
    const failed = checks.filter((c) => !c.ok);
    if (failed.length > 0) {
      return {
        ok: false,
        checks,
        reason: `pre-flight failed: ${failed.map((f) => f.id).join(', ')}`,
      };
    }

    const cmdNoSig: Omit<SignedRemoteMissionDeploy, 'sig'> = {
      type: 'RemoteMissionDeploy',
      v: 1,
      planId: plan.id,
      planHash: plan.hash,
      aircraftId: plan.aircraftId,
      tenantId,
      iatMs: Date.now(),
      approverDigest: approverDigest(plan.approvals.map((a) => a.kid)),
      kid: this.deployKid,
    };
    const sig = signDeploy(cmdNoSig, this.deployKey.privateKey);
    const signed: SignedRemoteMissionDeploy = { ...cmdNoSig, sig };

    const topic = `securetrax/${tenantId}/${plan.aircraftId}/cmd`;
    this.mqtt?.publish(topic, JSON.stringify(signed), 1);
    this.broadcaster?.broadcast(`flights/${plan.id}/commands`, signed);
    this.plans.markDeployed(tenantId, plan.id);
    this.log.log(
      `deployed plan=${plan.id} → ${plan.aircraftId} (approvals=${plan.approvals.length})`,
    );
    return { ok: true, checks, signedCommand: signed };
  }

  async abort(
    tenantId: string,
    aircraftId: string,
    mode: 'rtl' | 'land' | 'brake',
  ): Promise<void> {
    const cmd = {
      type: 'RemoteAbort' as const,
      v: 1,
      mode,
      aircraftId,
      tenantId,
      iatMs: Date.now(),
    };
    const topic = `securetrax/${tenantId}/${aircraftId}/cmd`;
    this.mqtt?.publish(topic, JSON.stringify(cmd), 1);
    this.broadcaster?.broadcast(`aircraft/${aircraftId}/abort`, cmd);
  }

  /**
   * What the canonical plan body would look like for a given plan id —
   * exposes it so an authorized client can compute the same hash + sign
   * it locally with their own approver key. Used by the test helper and
   * future approver UI.
   */
  planForApproval(tenantId: string, planId: string): FlightPlan | undefined {
    return this.plans.get(tenantId, planId);
  }
}
