/** Inbound MQTT message handler. */
export type MqttMessageHandler = (
  topic: string,
  payloadRaw: Buffer,
  qos: 0 | 1 | 2,
  retained: boolean,
) => void;

/**
 * Shared broker abstraction. The api owns the single physical mqtt.js
 * connection; modules (telemetry-mqtt, video-securevu, aircraft-qgc, …)
 * consume this interface to subscribe / publish without each opening their
 * own connection. Implementations dedupe overlapping subscriptions and
 * fan messages out to all matching handlers.
 */
export interface IMqttClient {
  subscribe(topicFilter: string, handler: MqttMessageHandler): () => void;
  publish(topic: string, payload: Buffer | string, qos?: 0 | 1 | 2): void;
}

export const MQTT_CLIENT = Symbol.for('securetrax.mqtt-client');
