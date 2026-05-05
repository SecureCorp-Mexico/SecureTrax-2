export type EventType = 'position' | 'telemetry' | 'alert';
export type PayloadKind = 'json' | 'text';

export interface TopicMapping {
  id: string;
  tenantId: string;
  name: string;
  topicPattern: string;
  payloadKind: PayloadKind;
  eventType: EventType;
  rules: Record<string, string>;
  enabled: boolean;
  priority: number;
}

export interface CanonicalPositionEvent {
  kind: 'position';
  tenantId: string;
  assetId: string;
  ts: number;
  lat: number;
  lon: number;
  alt?: number;
  speed?: number;
  heading?: number;
  attrs: Record<string, unknown>;
}

export interface CanonicalTelemetryEvent {
  kind: 'telemetry';
  tenantId: string;
  assetId: string;
  ts: number;
  metric: string;
  value: number | string | boolean;
  unit?: string;
}

export interface CanonicalAlertEvent {
  kind: 'alert';
  tenantId: string;
  assetId?: string;
  ts: number;
  severity: 'info' | 'warning' | 'critical';
  source: string;
  message: string;
  attrs: Record<string, unknown>;
}

export type CanonicalEvent =
  | CanonicalPositionEvent
  | CanonicalTelemetryEvent
  | CanonicalAlertEvent;
