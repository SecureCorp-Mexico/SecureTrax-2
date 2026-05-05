import {
  Inject,
  Injectable,
  Logger,
  Optional,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import {
  BROADCASTER,
  MQTT_CLIENT,
  SYSTEM_TRACKING_INGESTOR,
  type AssetStatus,
  type IBroadcaster,
  type IMqttClient,
  type ISystemTrackingIngestor,
} from '@securetrax/core';

/**
 * Subscribes to Frigate's MQTT publishings and reflects them into our
 * canonical state:
 *   frigate/<cam>/available  → camera status (online | offline)
 *                              → SystemTrackingIngestor.setStatus
 *                              → broadcast on `assets/<id>/status` and
 *                                `cameras/<id>/status`
 *   frigate/events           → JSON event payload broadcast on
 *                              `cameras/<id>/event` for popup overlays.
 *                              (Persistence into a dedicated `alerts` table
 *                              comes with the alerts module.)
 *
 * Camera identity is established by registering an asset with
 *   attrs.frigateName = "<cam>"
 * via PUT /v1/video/cameras/:id, set up before we expect Frigate frames.
 * If a frame arrives for an unknown frigateName we just log and drop —
 * we don't auto-create cameras (location matters and only humans know it).
 */
@Injectable()
export class FrigateRuntime implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(FrigateRuntime.name);
  private readonly defaultTenant = process.env.FRIGATE_TENANT_ID ?? 'default';
  private unsubAvailable?: () => void;
  private unsubEvents?: () => void;

  constructor(
    @Inject(MQTT_CLIENT) private readonly mqtt: IMqttClient,
    @Inject(SYSTEM_TRACKING_INGESTOR)
    private readonly ingestor: ISystemTrackingIngestor,
    @Optional() @Inject(BROADCASTER) private readonly broadcaster?: IBroadcaster,
  ) {}

  onModuleInit(): void {
    this.unsubAvailable = this.mqtt.subscribe(
      'frigate/+/available',
      (topic, payload) => {
        const parts = topic.split('/');
        const frigateName = parts[1];
        if (!frigateName) return;
        const status = parseAvailability(payload.toString('utf8'));
        this.handleStatus(frigateName, status).catch((e) =>
          this.log.error(
            `frigate status handle failed: ${e instanceof Error ? e.message : String(e)}`,
          ),
        );
      },
    );
    this.unsubEvents = this.mqtt.subscribe(
      'frigate/events',
      (_topic, payload) => {
        const raw = payload.toString('utf8');
        try {
          const ev = JSON.parse(raw) as Record<string, unknown>;
          this.handleEvent(ev);
        } catch {
          // ignore malformed
        }
      },
    );
    this.log.log('frigate runtime online');
  }

  onModuleDestroy(): void {
    this.unsubAvailable?.();
    this.unsubEvents?.();
  }

  private async handleStatus(
    frigateName: string,
    status: AssetStatus,
  ): Promise<void> {
    const tenantId = this.defaultTenant;
    const assetId = await this.ingestor.findAssetByAttr(
      tenantId,
      'frigateName',
      frigateName,
    );
    if (!assetId) {
      this.log.debug(`frigate status for unknown camera ${frigateName} — ignoring`);
      return;
    }
    await this.ingestor.setStatus(tenantId, assetId, status);
  }

  private handleEvent(ev: Record<string, unknown>): void {
    if (!this.broadcaster) return;
    const after =
      typeof ev.after === 'object' && ev.after
        ? (ev.after as Record<string, unknown>)
        : undefined;
    const cam = (after?.camera as string) ?? (ev.camera as string);
    if (!cam) return;
    this.broadcaster.broadcast(`cameras/${cam}/event`, ev);
  }
}

function parseAvailability(s: string): AssetStatus {
  const t = s.trim().toLowerCase();
  if (t === 'online') return 'online';
  if (t === 'offline') return 'offline';
  return 'unknown';
}
