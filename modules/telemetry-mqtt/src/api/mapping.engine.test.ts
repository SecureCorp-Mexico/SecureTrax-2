import { describe, expect, it } from 'vitest';
import { applyMappings, type RawMqttMessage } from './mapping.engine.js';
import type { TopicMapping } from './mapping.types.js';

const tenantId = 'default';

function mapping(over: Partial<TopicMapping>): TopicMapping {
  return {
    id: 'm1',
    tenantId,
    name: 't',
    topicPattern: 'securetrax/+/{assetId}/position',
    payloadKind: 'json',
    eventType: 'position',
    enabled: true,
    priority: 0,
    rules: {
      assetId: '{assetId}',
      lat: '$.lat',
      lon: '$.lon',
      ts: '$.ts',
    },
    ...over,
  };
}

function msg(over: Partial<RawMqttMessage>): RawMqttMessage {
  return {
    tenantId,
    topic: 'securetrax/default/TRUCK-1/position',
    payload: { lat: 19.43, lon: -99.13, ts: 1736900000000 },
    payloadRaw: '{}',
    ts: 1736900000000,
    ...over,
  };
}

describe('applyMappings — position', () => {
  it('produces a canonical position event when all required fields resolve', () => {
    const ev = applyMappings(msg({}), [mapping({})]);
    expect(ev).toEqual({
      kind: 'position',
      tenantId: 'default',
      assetId: 'TRUCK-1',
      ts: 1736900000000,
      lat: 19.43,
      lon: -99.13,
      alt: undefined,
      speed: undefined,
      heading: undefined,
      attrs: { topic: 'securetrax/default/TRUCK-1/position', mappingId: 'm1' },
    });
  });

  it('skips disabled mappings', () => {
    expect(applyMappings(msg({}), [mapping({ enabled: false })])).toBeUndefined();
  });

  it('skips mappings whose tenant does not match', () => {
    expect(applyMappings(msg({ tenantId: 'other' }), [mapping({})])).toBeUndefined();
  });

  it('returns first match in priority order (caller is responsible for sort)', () => {
    const lo = mapping({
      id: 'lo',
      priority: 1,
      rules: { assetId: '{assetId}', lat: '$.lat', lon: '$.lon' },
    });
    const hi = mapping({
      id: 'hi',
      priority: 10,
      rules: { assetId: '{assetId}', lat: '$.lat', lon: '$.lon' },
    });
    const ev = applyMappings(msg({}), [hi, lo]);
    if (!ev || ev.kind !== 'position') throw new Error('expected position');
    expect(ev.attrs.mappingId).toBe('hi');
  });

  it('falls back to message ts when rule path resolves to nothing', () => {
    const ev = applyMappings(msg({ payload: { lat: 1, lon: 2 } }), [mapping({})]);
    if (!ev || ev.kind !== 'position') throw new Error('expected position');
    expect(ev.ts).toBe(1736900000000);
  });

  it('rejects messages missing lat/lon', () => {
    expect(applyMappings(msg({ payload: {} }), [mapping({})])).toBeUndefined();
  });

  it('coerces numeric strings to numbers', () => {
    const ev = applyMappings(
      msg({ payload: { lat: '19.43', lon: '-99.13' } as never }),
      [mapping({})],
    );
    if (!ev || ev.kind !== 'position') throw new Error('expected position');
    expect(ev.lat).toBe(19.43);
    expect(ev.lon).toBe(-99.13);
  });
});

describe('applyMappings — telemetry', () => {
  it('emits canonical telemetry events with metric + value', () => {
    const ev = applyMappings(
      msg({
        topic: 'securetrax/default/router-42/lte_rsrp',
        payload: { value: -97 },
      }),
      [
        mapping({
          eventType: 'telemetry',
          topicPattern: 'securetrax/+/{assetId}/{metric}',
          rules: { assetId: '{assetId}', metric: '{metric}', value: '$.value' },
        }),
      ],
    );
    expect(ev).toEqual({
      kind: 'telemetry',
      tenantId,
      assetId: 'router-42',
      ts: 1736900000000,
      metric: 'lte_rsrp',
      value: -97,
      unit: undefined,
    });
  });
});

describe('applyMappings — alert', () => {
  it('emits a canonical alert with severity + message', () => {
    const ev = applyMappings(
      msg({
        topic: 'frigate/cam-1/events',
        payload: { severity: 'warning', source: 'frigate', message: 'person' },
      }),
      [
        mapping({
          eventType: 'alert',
          topicPattern: 'frigate/+/events',
          rules: {
            severity: '$.severity',
            source: '$.source',
            message: '$.message',
          },
        }),
      ],
    );
    if (!ev || ev.kind !== 'alert') throw new Error('expected alert');
    expect(ev.severity).toBe('warning');
    expect(ev.source).toBe('frigate');
    expect(ev.message).toBe('person');
  });
});
