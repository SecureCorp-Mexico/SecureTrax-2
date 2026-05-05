import {
  Inject,
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import {
  MQTT_CLIENT,
  SYSTEM_MQTT_ARCHIVER,
  SYSTEM_TRACKING_INGESTOR,
  type IMqttArchiver,
  type IMqttClient,
  type ISystemTrackingIngestor,
} from '@securetrax/core';
import {
  MAPPINGS_REPOSITORY,
  type IMappingsRepository,
} from './mappings.repository.js';
import { applyMappings } from './mapping.engine.js';
import type {
  CanonicalEvent,
  TopicMapping,
} from './mapping.types.js';

/**
 * Glues the shared MQTT client to the archive + mapping engine + canonical
 * pipeline. On every message:
 *   1. parse JSON when possible; mirror raw + parsed into the
 *      `mqtt_messages` hypertable (RLS-scoped per tenant).
 *   2. derive tenantId from the topic (`securetrax/<tenant>/...`).
 *   3. run the per-tenant mapping list (cached, refreshed every 30s).
 *   4. dispatch canonical events:
 *        position  → SystemTrackingIngestor.ingestPosition
 *        telemetry → (deferred — TelemetryIngestor lands with reports)
 *        alert     → (deferred — AlertsIngestor lands with notifications)
 */
@Injectable()
export class TelemetryMqttRuntime implements OnModuleInit {
  private readonly log = new Logger(TelemetryMqttRuntime.name);
  private mappingsByTenant = new Map<string, TopicMapping[]>();
  private nextRefresh = 0;
  private unsub?: () => void;

  constructor(
    @Inject(MQTT_CLIENT) private readonly mqtt: IMqttClient,
    @Inject(SYSTEM_MQTT_ARCHIVER) private readonly archiver: IMqttArchiver,
    @Inject(SYSTEM_TRACKING_INGESTOR)
    private readonly ingestor: ISystemTrackingIngestor,
    @Inject(MAPPINGS_REPOSITORY) private readonly mappings: IMappingsRepository,
  ) {}

  onModuleInit(): void {
    const root = process.env.MQTT_ROOT_SUBSCRIPTION ?? 'securetrax/#';
    this.unsub = this.mqtt.subscribe(root, (topic, payloadRaw, qos, retained) => {
      this.handle(topic, payloadRaw, qos, retained).catch((e) =>
        this.log.error(
          `mqtt handle failed: ${e instanceof Error ? e.message : String(e)}`,
        ),
      );
    });
    this.log.log(`telemetry-mqtt runtime subscribed to ${root}`);
  }

  private async handle(
    topic: string,
    payloadRaw: Buffer,
    qos: 0 | 1 | 2,
    retained: boolean,
  ): Promise<void> {
    const tenantId = tenantFromTopic(topic);
    if (!tenantId) return;

    const raw = payloadRaw.toString('utf8');
    const parsed = tryJson(raw);

    await this.archiver.archive({
      tenantId,
      ts: Date.now(),
      topic,
      payload:
        parsed && typeof parsed === 'object'
          ? (parsed as Record<string, unknown>)
          : { _raw: raw },
      payloadRaw: raw,
      qos,
      retained,
    });

    const mappings = await this.mappingsFor(tenantId);
    if (mappings.length === 0) return;
    const ev = applyMappings(
      {
        tenantId,
        topic,
        payload:
          typeof parsed === 'object' && parsed !== null
            ? (parsed as Record<string, unknown>)
            : undefined,
        payloadRaw: raw,
        ts: Date.now(),
      },
      mappings,
    );
    if (!ev) return;
    await this.dispatch(ev);
  }

  private async dispatch(ev: CanonicalEvent): Promise<void> {
    if (ev.kind === 'position') {
      await this.ingestor.ingestPosition(ev.tenantId, {
        assetId: ev.assetId,
        ts: ev.ts,
        lat: ev.lat,
        lon: ev.lon,
        alt: ev.alt,
        speed: ev.speed,
        heading: ev.heading,
        attrs: ev.attrs,
      });
      return;
    }
    this.log.debug(
      `unhandled canonical event kind=${ev.kind} (handler not yet registered)`,
    );
  }

  private async mappingsFor(tenantId: string): Promise<TopicMapping[]> {
    const now = Date.now();
    if (now < this.nextRefresh && this.mappingsByTenant.has(tenantId)) {
      return this.mappingsByTenant.get(tenantId) ?? [];
    }
    try {
      const list = await this.mappings.list(tenantId);
      list.sort((a, b) => b.priority - a.priority);
      this.mappingsByTenant.set(tenantId, list);
      this.nextRefresh = now + 30_000;
      return list;
    } catch (e) {
      this.log.warn(
        `mapping refresh failed: ${e instanceof Error ? e.message : String(e)}`,
      );
      return this.mappingsByTenant.get(tenantId) ?? [];
    }
  }
}

function tenantFromTopic(topic: string): string | undefined {
  if (topic.startsWith('securetrax/')) {
    const parts = topic.split('/');
    return parts[1] || undefined;
  }
  return 'default';
}

function tryJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return undefined;
  }
}
