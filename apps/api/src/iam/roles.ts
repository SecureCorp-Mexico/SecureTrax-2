import type { Permission } from './permissions.js';

export interface RolePreset {
  id: string;
  name: string;
  description: string;
  permissions: Permission[];
  /** Roles that conflict with this one (separation-of-duties). */
  exclusiveWith?: string[];
  /** Whether elevated MFA is required for this role's actions. */
  requiresMfa?: boolean;
}

/**
 * Pre-shipped role presets aligning with ISO 27001 separation-of-duties.
 * Customers can clone + customize via the admin UI; these are the defaults.
 */
export const ROLE_PRESETS: RolePreset[] = [
  {
    id: 'Viewer',
    name: 'Viewer',
    description: 'Read-only access to assigned resources.',
    permissions: ['tracking.assets.read', 'video.live.view', 'reports.fleet.read'],
  },
  {
    id: 'Operator',
    name: 'Operator',
    description: 'Day-to-day ops: tracking, live video, geofence triage.',
    permissions: [
      'tracking.assets.read',
      'tracking.assets.write',
      'video.live.view',
      'alerts.acknowledge',
      'reports.fleet.read',
    ],
  },
  {
    id: 'Dispatcher',
    name: 'Dispatcher',
    description: 'Coordinates fleet, dispatches assets, manages geofences.',
    permissions: [
      'tracking.assets.read',
      'tracking.assets.write',
      'video.live.view',
      'alerts.acknowledge',
      'geofences.write',
      'reports.fleet.run',
    ],
  },
  {
    id: 'Maintainer',
    name: 'Maintainer',
    description: 'Manages devices, mappings, and integrations.',
    permissions: [
      'tracking.assets.write',
      'telemetry.mappings.write',
      'devices.write',
    ],
  },
  {
    id: 'FlightAuthor',
    name: 'Flight Author',
    description: 'Drafts flight plans; cannot approve them.',
    permissions: ['aircraft.plans.author', 'tracking.assets.read', 'video.live.view'],
    exclusiveWith: ['FlightApprover'],
    requiresMfa: true,
  },
  {
    id: 'FlightApprover',
    name: 'Flight Approver',
    description:
      'Signs flight plans for deployment. Cannot also be the author of the same plan.',
    permissions: ['aircraft.plans.approve', 'aircraft.plans.read'],
    exclusiveWith: ['FlightAuthor'],
    requiresMfa: true,
  },
  {
    id: 'Pilot',
    name: 'Pilot',
    description: 'Receives signed flight plans + comms; flies in QGroundControl.',
    permissions: [
      'aircraft.plans.read',
      'aircraft.changes.accept',
      'comms.chat.write',
      'comms.voice.connect',
    ],
    requiresMfa: true,
  },
  {
    id: 'Client',
    name: 'Client',
    description:
      'Customer who books flights and watches live. Cannot arm, deploy, or abort.',
    permissions: [
      'aircraft.requests.write',
      'aircraft.missions.read',
      'video.live.view',
      'comms.chat.write',
      'comms.voice.connect',
    ],
  },
  {
    id: 'SecurityAuditor',
    name: 'Security Auditor',
    description: 'Read-only across security events + audit log + compliance evidence.',
    permissions: [
      'compliance.audit.read',
      'compliance.audit.export',
      'security.events.read',
    ],
  },
  {
    id: 'TenantAdmin',
    name: 'Tenant Admin',
    description: 'Tenant-level user/role/scope management; not system-wide.',
    permissions: [
      'iam.users.write',
      'iam.roles.write',
      'iam.scopes.write',
      'tenant.settings.write',
    ],
    requiresMfa: true,
  },
  {
    id: 'SystemAdmin',
    name: 'System Admin',
    description:
      'Cross-tenant admin: license rotation, key management, infrastructure.',
    permissions: ['license.rotate', 'iam.users.write', 'system.write'],
    requiresMfa: true,
  },
];

export function getRolePreset(id: string): RolePreset | undefined {
  return ROLE_PRESETS.find((r) => r.id === id);
}
