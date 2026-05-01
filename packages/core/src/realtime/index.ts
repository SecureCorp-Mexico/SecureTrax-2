/** Anything that can fan out an event to subscribers (WS clients, MQTT, etc). */
export interface IBroadcaster {
  broadcast(topic: string, data: unknown): void;
}

export const BROADCASTER = Symbol.for('securetrax.broadcaster');
