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
  type IBroadcaster,
  type IMqttClient,
  type ISystemTrackingIngestor,
} from '@securetrax/core';

/**
 * Subscribes to the MAVLink-over-MQTT topic tree the onboard sidecar
 * publishes (`securetrax/<tenant>/<aircraft>/mavlink/<MSG_NAME>`) and:
 *   - rebroadcasts every frame on `aircraft/<aircraft>/mavlink/<MSG>`
 *     for the web HUD to subscribe to.
 *   - feeds GPS_RAW_INT / GLOBAL_POSITION_INT into the canonical position
 *     pipeline via SystemTrackingIngestor — so the aircraft shows up on the
 *     same map as everything else without bespoke wiring.
 *   - updates the asset's online/offline status on HEARTBEAT presence /
 *     absence.
 *
 * Typed flight-telemetry hypertables (flight_telemetry / flight_battery / ...)
 * land with the next migration. For Phase 6 we route the high-value frames
 * through existing storage and broadcast everything else to subscribers.
 */
@Injectable()
export class MavlinkRuntime implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(MavlinkRuntime.name);
  private unsub?: () => void;

  constructor(
    @Inject(MQTT_CLIENT) private readonly mqtt: IMqttClient,
    @Inject(SYSTEM_TRACKING_INGESTOR)
    private readonly ingestor: ISystemTrackingIngestor,
    @Optional() @Inject(BROADCASTER) private readonly broadcaster?: IBroadcaster,
  ) {}

  onModuleInit(): void {
    this.unsub = this.mqtt.subscribe(
      'securetrax/+/+/mavlink/+',
      (topic, payload) => {
        this.handle(topic, payload).catch((e) =>
          this.log.error(
            `mavlink handle failed: ${e instanceof Error ? e.message : String(e)}`,
          ),
        );
      },
    );
    this.log.log('mavlink runtime online');
  }

  onModuleDestroy(): void {
    this.unsub?.();
  }

  private async handle(topic: string, payload: Buffer): Promise<void> {
    const parts = topic.split('/');
    if (parts.length < 5) return;
    const [, tenantId, aircraftId, , msgName] = parts as [
      string,
      string,
      string,
      string,
      string,
    ];
    let parsed: Record<string, unknown> | undefined;
    try {
      parsed = JSON.parse(payload.toString('utf8')) as Record<string, unknown>;
    } catch {
      return;
    }
    if (!parsed) return;

    this.broadcaster?.broadcast(
      `aircraft/${aircraftId}/mavlink/${msgName}`,
      parsed,
    );

    switch (msgName) {
      case 'HEARTBEAT': {
        await this.ingestor.setStatus(tenantId, aircraftId, 'online');
        break;
      }
      case 'GLOBAL_POSITION_INT': {
        const lat = (parsed.lat as number) / 1e7;
        const lon = (parsed.lon as number) / 1e7;
        const alt = (parsed.relative_alt as number) / 1000;
        if (Number.isFinite(lat) && Number.isFinite(lon)) {
          await this.ingestor.ingestPosition(tenantId, {
            assetId: aircraftId,
            ts: Date.now(),
            lat,
            lon,
            alt,
            heading:
              parsed.hdg !== undefined ? (parsed.hdg as number) / 100 : undefined,
            speed:
              parsed.vx !== undefined && parsed.vy !== undefined
                ? Math.sqrt(
                    ((parsed.vx as number) / 100) ** 2 +
                      ((parsed.vy as number) / 100) ** 2,
                  ) * 3.6
                : undefined,
            attrs: { source: 'mavlink', msg: 'GLOBAL_POSITION_INT' },
          });
        }
        break;
      }
      case 'GPS_RAW_INT': {
        // Lower-fidelity fallback when GLOBAL_POSITION_INT isn't published.
        const lat = (parsed.lat as number) / 1e7;
        const lon = (parsed.lon as number) / 1e7;
        if (Number.isFinite(lat) && Number.isFinite(lon)) {
          await this.ingestor.ingestPosition(tenantId, {
            assetId: aircraftId,
            ts: Date.now(),
            lat,
            lon,
            alt:
              parsed.alt !== undefined
                ? (parsed.alt as number) / 1000
                : undefined,
            attrs: { source: 'mavlink', msg: 'GPS_RAW_INT' },
          });
        }
        break;
      }
      // BATTERY_STATUS, ATTITUDE, VFR_HUD, RC_CHANNELS, MISSION_CURRENT, etc.
      // are surfaced on the broadcast topic only until the typed flight_*
      // hypertables land in the next migration.
    }
  }
}
