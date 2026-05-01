import { evalJsonPath } from './jsonpath.js';
import { matchTopicPattern } from './topic-pattern.js';
import type {
  CanonicalEvent,
  CanonicalPositionEvent,
  CanonicalTelemetryEvent,
  CanonicalAlertEvent,
  TopicMapping,
} from './mapping.types.js';

export interface RawMqttMessage {
  tenantId: string;
  topic: string;
  payload: Record<string, unknown> | undefined;
  payloadRaw: string;
  ts: number;
}

/**
 * Apply a sorted list of mappings (highest priority first) to a raw MQTT
 * message. Returns the first matching mapping's canonical event, or undefined
 * if nothing matches. Pure function — no I/O — so it round-trips cleanly in
 * tests and inside the AI assistant's tool-use surface later.
 */
export function applyMappings(
  msg: RawMqttMessage,
  mappings: TopicMapping[],
): CanonicalEvent | undefined {
  for (const m of mappings) {
    if (!m.enabled) continue;
    if (m.tenantId !== msg.tenantId) continue;
    const match = matchTopicPattern(m.topicPattern, msg.topic);
    if (!match.ok) continue;
    const ev = buildEvent(m, msg, match.captures);
    if (ev) return ev;
  }
  return undefined;
}

function buildEvent(
  m: TopicMapping,
  msg: RawMqttMessage,
  captures: Record<string, string>,
): CanonicalEvent | undefined {
  const resolve = (rule: string | undefined): unknown => {
    if (rule === undefined) return undefined;
    if (rule.startsWith('{') && rule.endsWith('}')) {
      const name = rule.slice(1, -1);
      return captures[name];
    }
    if (rule.startsWith('$')) {
      return evalJsonPath(msg.payload, rule);
    }
    return rule;
  };
  const ts = numberOr(resolve(m.rules.ts), msg.ts);
  const tenantId = msg.tenantId;

  if (m.eventType === 'position') {
    const assetId = stringOr(resolve(m.rules.assetId), '');
    const lat = numberOr(resolve(m.rules.lat), NaN);
    const lon = numberOr(resolve(m.rules.lon), NaN);
    if (!assetId || Number.isNaN(lat) || Number.isNaN(lon)) return undefined;
    const ev: CanonicalPositionEvent = {
      kind: 'position',
      tenantId,
      assetId,
      ts,
      lat,
      lon,
      alt: optionalNumber(resolve(m.rules.alt)),
      speed: optionalNumber(resolve(m.rules.speed)),
      heading: optionalNumber(resolve(m.rules.heading)),
      attrs: { topic: msg.topic, mappingId: m.id },
    };
    return ev;
  }
  if (m.eventType === 'telemetry') {
    const assetId = stringOr(resolve(m.rules.assetId), '');
    const metric = stringOr(resolve(m.rules.metric), '');
    const raw = resolve(m.rules.value);
    if (!assetId || !metric || raw === undefined) return undefined;
    const ev: CanonicalTelemetryEvent = {
      kind: 'telemetry',
      tenantId,
      assetId,
      ts,
      metric,
      value: coerceScalar(raw),
      unit: stringOrUndef(resolve(m.rules.unit)),
    };
    return ev;
  }
  // alert
  const ev: CanonicalAlertEvent = {
    kind: 'alert',
    tenantId,
    assetId: stringOrUndef(resolve(m.rules.assetId)),
    ts,
    severity: severityOr(resolve(m.rules.severity), 'info'),
    source: stringOr(resolve(m.rules.source), 'mqtt'),
    message: stringOr(resolve(m.rules.message), ''),
    attrs: { topic: msg.topic, mappingId: m.id },
  };
  return ev;
}

function numberOr(v: unknown, fallback: number): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  }
  return fallback;
}
function optionalNumber(v: unknown): number | undefined {
  if (v === undefined || v === null) return undefined;
  const n = numberOr(v, NaN);
  return Number.isNaN(n) ? undefined : n;
}
function stringOr(v: unknown, fallback: string): string {
  return typeof v === 'string' ? v : v === undefined || v === null ? fallback : String(v);
}
function stringOrUndef(v: unknown): string | undefined {
  return v === undefined || v === null ? undefined : String(v);
}
function coerceScalar(v: unknown): number | string | boolean {
  if (typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean') return v;
  return String(v);
}
function severityOr(
  v: unknown,
  fallback: 'info' | 'warning' | 'critical',
): 'info' | 'warning' | 'critical' {
  return v === 'info' || v === 'warning' || v === 'critical' ? v : fallback;
}
