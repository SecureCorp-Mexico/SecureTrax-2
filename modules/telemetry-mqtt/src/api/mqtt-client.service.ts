import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import mqtt, { type MqttClient, type IClientOptions } from 'mqtt';

export type MessageHandler = (
  topic: string,
  payloadRaw: Buffer,
  qos: 0 | 1 | 2,
  retained: boolean,
) => void;

export interface MqttClientConfig {
  url: string;
  username?: string;
  password?: string;
  clientId?: string;
  /** Initial subscription pattern. Default: every message in the namespace. */
  rootSubscription?: string;
}

/**
 * Singleton wrapper around the `mqtt` client. Connects on boot, auto-
 * reconnects (mqtt.js handles backoff internally), and fans out every
 * message to all registered handlers. Module services attach handlers
 * directly (no Nest dependency on the wire).
 */
@Injectable()
export class MqttClientService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(MqttClientService.name);
  private client?: MqttClient;
  private readonly handlers = new Set<MessageHandler>();

  async onModuleInit(): Promise<void> {
    const url = process.env.MQTT_URL ?? 'mqtt://mosquitto:1883';
    const root = process.env.MQTT_ROOT_SUBSCRIPTION ?? 'securetrax/#';
    const opts: IClientOptions = {
      clientId: process.env.MQTT_CLIENT_ID ?? `securetrax-api-${process.pid}`,
      username: process.env.MQTT_USERNAME,
      password: process.env.MQTT_PASSWORD,
      reconnectPeriod: 2000,
      keepalive: 30,
    };
    this.log.log(`mqtt connecting to ${url}, root=${root}`);
    const client = mqtt.connect(url, opts);
    this.client = client;

    client.on('connect', () => {
      this.log.log('mqtt connected — subscribing');
      client.subscribe(root, { qos: 0 }, (err) => {
        if (err) this.log.error(`mqtt subscribe failed: ${err.message}`);
      });
    });
    client.on('reconnect', () => this.log.log('mqtt reconnecting'));
    client.on('error', (err) => this.log.warn(`mqtt error: ${err.message}`));
    client.on('close', () => this.log.warn('mqtt connection closed'));
    client.on('message', (topic, payload, packet) => {
      const qos = (packet.qos ?? 0) as 0 | 1 | 2;
      const retained = !!packet.retain;
      for (const fn of this.handlers) {
        try {
          fn(topic, payload, qos, retained);
        } catch (e) {
          this.log.error(`handler threw: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
    });
  }

  async onModuleDestroy(): Promise<void> {
    if (!this.client) return;
    await new Promise<void>((resolve) => this.client!.end(false, undefined, () => resolve()));
  }

  on(handler: MessageHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  publish(topic: string, payload: Buffer | string, qos: 0 | 1 | 2 = 0): void {
    this.client?.publish(topic, payload, { qos });
  }
}
