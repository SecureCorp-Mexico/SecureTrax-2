/**
 * Canonical flight-plan + deploy types. Stored in-memory in this slice; the
 * Drizzle migration adding flight_plans / flight_logs / flight_commands lands
 * with the next slice.
 */

export interface FlightWaypoint {
  /** Plan-relative sequence number, starting at 0. */
  seq: number;
  lat: number;
  lon: number;
  /** Altitude in meters, AMSL or AGL — depends on `frame`. */
  alt: number;
  /** MAVLink frame: 0=global, 3=relative-to-home. */
  frame?: number;
  /** MAVLink command id (e.g. 16 = NAV_WAYPOINT, 22 = NAV_TAKEOFF). */
  command?: number;
  params?: number[];
}

export interface FlightPlan {
  id: string;
  tenantId: string;
  /** Asset id of the target aircraft (or `aircraft-group:<id>`). */
  aircraftId: string;
  name: string;
  authorId: string;
  /** Start of the validity window in epoch ms. */
  notBeforeMs: number;
  /** End of the validity window in epoch ms. */
  notAfterMs: number;
  waypoints: FlightWaypoint[];
  /** Optional convex-polygon geofence as [[lat,lon],...]; all waypoints must be inside. */
  geofence?: Array<[number, number]>;
  /** Hex-encoded sha256 of the canonicalized plan. Recomputed on save. */
  hash: string;
  approvals: PlanApproval[];
  createdAtMs: number;
  updatedAtMs: number;
  /** Set once the plan has been deployed at least once. */
  deployedAtMs?: number;
}

export interface PlanApproval {
  approverId: string;
  /** epoch ms the signature was produced. */
  signedAtMs: number;
  /** base64-encoded Ed25519 signature over the canonical plan body. */
  signature: string;
  /** kid of the keypair that signed (so we can rotate without breaking history). */
  kid: string;
}

export type PreflightCheckId =
  | 'aircraft.online'
  | 'aircraft.disarmed'
  | 'gps.fix'
  | 'battery.threshold'
  | 'window.valid'
  | 'geofence.contains_waypoints'
  | 'no.conflicting_mission';

export interface PreflightResult {
  id: PreflightCheckId;
  ok: boolean;
  detail?: string;
}

export interface DeployResult {
  ok: boolean;
  /** Per-check results — populated even when ok is true. */
  checks: PreflightResult[];
  /** Reason text if ok is false. */
  reason?: string;
  /** The signed command body the onboard sidecar verifies. */
  signedCommand?: SignedRemoteMissionDeploy;
}

export interface SignedRemoteMissionDeploy {
  type: 'RemoteMissionDeploy';
  v: 1;
  planId: string;
  planHash: string;
  aircraftId: string;
  tenantId: string;
  /** Issued-at epoch ms (used for replay protection by the sidecar). */
  iatMs: number;
  /** Hex-encoded sha256 of the ordered approver kids (for transparency). */
  approverDigest: string;
  /** Base64 Ed25519 signature over the canonical command body. */
  sig: string;
  /** kid of the deploy key (separate from the per-approver keys). */
  kid: string;
}
