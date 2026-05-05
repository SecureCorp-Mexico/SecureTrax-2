import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import {
  SYSTEM_TRACKING_INGESTOR,
  type ISystemTrackingIngestor,
} from '@securetrax/core';
import { TraccarClient } from './client.js';
import {
  assetIdForTraccar,
  normalizeTraccarPosition,
  type TraccarDevice,
  type TraccarSocketFrame,
} from './types.js';
import {
  readTraccarConfigFromEnv,
  type TraccarAdapterConfig,
} from './config.js';

/**
 * Live Traccar integration. Logs in once, opens `/api/socket`, and feeds every
 * incoming position into the canonical pipeline (system-context ingest →
 * positions hypertable → broadcast on `assets/<id>/position`). Devices are
 * upserted into `assets` on connect and on each `devices` frame.
 *
 * If TRACCAR_URL isn't set the adapter cleanly opts out — the REST POST and
 * the simulator path keep working.
 */
@Injectable()
export class TraccarAdapter implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(TraccarAdapter.name);
  private readonly cfg: TraccarAdapterConfig | undefined;
  private client?: TraccarClient;
  private socket?: { close: () => void };
  /** Traccar numeric device id → our asset id */
  private readonly deviceIdToAsset = new Map<number, string>();
  private retry = 0;
  private destroyed = false;

  constructor(
    @Inject(SYSTEM_TRACKING_INGESTOR)
    private readonly ingestor: ISystemTrackingIngestor,
  ) {
    this.cfg = readTraccarConfigFromEnv();
  }

  async onModuleInit(): Promise<void> {
    if (!this.cfg) {
      this.log.log('TRACCAR_URL not set — adapter disabled');
      return;
    }
    this.log.log(
      `traccar adapter starting against ${this.cfg.baseUrl} (tenant=${this.cfg.tenantId})`,
    );
    await this.start();
  }

  async onModuleDestroy(): Promise<void> {
    this.destroyed = true;
    this.socket?.close();
  }

  private async start(): Promise<void> {
    if (!this.cfg) return;
    this.client = new TraccarClient({
      baseUrl: this.cfg.baseUrl,
      email: this.cfg.email,
      password: this.cfg.password,
    });
    try {
      await this.client.login();
      const devices = await this.client.listDevices();
      for (const d of devices) await this.upsertDevice(d);
      this.openSocket();
    } catch (err) {
      this.log.error(`traccar start failed: ${asMsg(err)}`);
      this.scheduleReconnect();
    }
  }

  private openSocket(): void {
    if (!this.client || !this.cfg) return;
    this.socket = this.client.openSocket({
      onOpen: () => {
        this.retry = 0;
        this.log.log('traccar socket connected');
      },
      onFrame: (frame) => {
        this.handleFrame(frame).catch((e) =>
          this.log.error(`frame handle failed: ${asMsg(e)}`),
        );
      },
      onClose: (code, reason) => {
        this.log.warn(`traccar socket closed (${code} ${reason})`);
        this.scheduleReconnect();
      },
      onError: (err) => {
        this.log.warn(`traccar socket error: ${asMsg(err)}`);
      },
    });
  }

  private scheduleReconnect(): void {
    if (this.destroyed || !this.cfg) return;
    const delay = Math.min(30_000, this.cfg.reconnectBaseMs * 2 ** this.retry++);
    this.log.log(`reconnecting to traccar in ${delay}ms`);
    setTimeout(() => {
      void this.start();
    }, delay);
  }

  private async handleFrame(frame: TraccarSocketFrame): Promise<void> {
    if (frame.devices?.length) {
      for (const d of frame.devices) await this.upsertDevice(d);
    }
    if (frame.positions?.length) {
      for (const p of frame.positions) {
        let assetId = this.deviceIdToAsset.get(p.deviceId);
        if (!assetId) {
          // First-time sighting — try the attrs lookup, otherwise fall back
          // to the synthetic id and log a warning so the operator notices.
          const found = await this.ingestor.findAssetByAttr(
            this.cfg!.tenantId,
            'traccarDeviceId',
            p.deviceId,
          );
          if (found) {
            this.deviceIdToAsset.set(p.deviceId, found);
            assetId = found;
          } else {
            this.log.warn(
              `position for unknown traccar device ${p.deviceId} — synthesizing asset`,
            );
            assetId = `traccar:device-${p.deviceId}`;
            await this.ingestor.upsertAsset(this.cfg!.tenantId, {
              id: assetId,
              name: `Traccar device ${p.deviceId}`,
              category: 'vehicle',
              tags: ['traccar'],
              cameraBindings: [],
              attrs: { traccarDeviceId: String(p.deviceId) },
            });
            this.deviceIdToAsset.set(p.deviceId, assetId);
          }
        }
        const canonical = normalizeTraccarPosition(assetId, p);
        await this.ingestor.ingestPosition(this.cfg!.tenantId, canonical);
      }
    }
  }

  private async upsertDevice(d: TraccarDevice): Promise<void> {
    if (!this.cfg) return;
    const assetId = assetIdForTraccar(d.uniqueId);
    this.deviceIdToAsset.set(d.id, assetId);
    await this.ingestor.upsertAsset(this.cfg.tenantId, {
      id: assetId,
      name: d.name,
      category: 'vehicle',
      tags: ['traccar'],
      cameraBindings: [],
      attrs: {
        traccarDeviceId: String(d.id),
        traccarUniqueId: d.uniqueId,
        status: d.status ?? 'unknown',
        ...(d.attributes ?? {}),
      },
    });
  }
}

function asMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
