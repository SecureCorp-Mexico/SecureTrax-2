import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import mqtt, { type MqttClient, type IClientOptions } from 'mqtt';
import type { IMqttClient, MqttMessageHandler } from '@securetrax/core';

interface Subscription {
  filter: string;
  handler: MqttMessageHandler;
}

/**
 * Singleton shared broker client. One physical mqtt.js connection across the
 * whole api; modules call subscribe() with their own topic filters and the
 * service issues SUBSCRIBEs to the broker only the first time a given filter
 * is requested (deduped). Auto-reconnect is mqtt.js's built-in behaviour.
 */
@Injectable()
export class MqttClientService implements OnModuleInit, OnModuleDestroy, IMqttClient {
  private readonly log = new Logger(MqttClientService.name);
  private client?: MqttClient;
  private readonly subs: Subscription[] = [];
  private readonly filterRefcount = new Map<string, number>();

  async onModuleInit(): Promise<void> {
    const url = process.env.MQTT_URL ?? 'mqtt://mosquitto:1883';
    const opts: IClientOptions = {
      clientId: process.env.MQTT_CLIENT_ID ?? `securetrax-api-${process.pid}`,
      username: process.env.MQTT_USERNAME,
      password: process.env.MQTT_PASSWORD,
      reconnectPeriod: 2000,
      keepalive: 30,
    };
    this.log.log(`mqtt connecting to ${url}`);
    const client = mqtt.connect(url, opts);
    this.client = client;

    client.on('connect', () => {
      this.log.log('mqtt connected — re-issuing subscriptions');
      // Re-issue every active filter on (re)connect.
      for (const filter of this.filterRefcount.keys()) {
        client.subscribe(filter, { qos: 0 }, (err) => {
          if (err) this.log.error(`mqtt subscribe ${filter} failed: ${err.message}`);
        });
      }
    });
    client.on('reconnect', () => this.log.log('mqtt reconnecting'));
    client.on('error', (err) => this.log.warn(`mqtt error: ${err.message}`));
    client.on('close', () => this.log.warn('mqtt connection closed'));
    client.on('message', (topic, payload, packet) => {
      const qos = (packet.qos ?? 0) as 0 | 1 | 2;
      const retained = !!packet.retain;
      for (const s of this.subs) {
        if (matchesTopic(s.filter, topic)) {
          try {
            s.handler(topic, payload, qos, retained);
          } catch (e) {
            this.log.error(
              `handler threw: ${e instanceof Error ? e.message : String(e)}`,
            );
          }
        }
      }
    });
  }

  async onModuleDestroy(): Promise<void> {
    if (!this.client) return;
    await new Promise<void>((resolve) =>
      this.client!.end(false, undefined, () => resolve()),
    );
  }

  subscribe(filter: string, handler: MqttMessageHandler): () => void {
    this.subs.push({ filter, handler });
    const refs = (this.filterRefcount.get(filter) ?? 0) + 1;
    this.filterRefcount.set(filter, refs);
    if (refs === 1 && this.client?.connected) {
      this.client.subscribe(filter, { qos: 0 }, (err) => {
        if (err) this.log.error(`mqtt subscribe ${filter} failed: ${err.message}`);
      });
    }
    return () => {
      const idx = this.subs.findIndex(
        (s) => s.filter === filter && s.handler === handler,
      );
      if (idx >= 0) this.subs.splice(idx, 1);
      const remaining = (this.filterRefcount.get(filter) ?? 1) - 1;
      if (remaining <= 0) {
        this.filterRefcount.delete(filter);
        this.client?.unsubscribe(filter);
      } else {
        this.filterRefcount.set(filter, remaining);
      }
    };
  }

  publish(topic: string, payload: Buffer | string, qos: 0 | 1 | 2 = 0): void {
    this.client?.publish(topic, payload, { qos });
  }
}

/** MQTT-style topic match: + matches a segment, # matches the rest. */
export function matchesTopic(filter: string, topic: string): boolean {
  const ff = filter.split('/');
  const tt = topic.split('/');
  for (let i = 0; i < ff.length; i++) {
    const f = ff[i];
    if (f === '#') return true;
    if (i >= tt.length) return false;
    if (f === '+') continue;
    if (f !== tt[i]) return false;
  }
  return ff.length === tt.length;
}
