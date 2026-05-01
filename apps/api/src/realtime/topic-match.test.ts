import { describe, expect, it } from 'vitest';
import { matchesTopic } from './realtime.gateway.js';

describe('matchesTopic (MQTT-style)', () => {
  it('matches exact topics', () => {
    expect(matchesTopic('a/b/c', 'a/b/c')).toBe(true);
    expect(matchesTopic('a/b/c', 'a/b/d')).toBe(false);
  });

  it('+ matches a single segment', () => {
    expect(matchesTopic('assets/+/position', 'assets/123/position')).toBe(true);
    expect(matchesTopic('assets/+/position', 'assets/123/position/extra')).toBe(false);
  });

  it('# matches everything from there on', () => {
    expect(matchesTopic('aircraft/#', 'aircraft/DRONE-3/mavlink/HEARTBEAT')).toBe(true);
    expect(matchesTopic('aircraft/#', 'tracking/X')).toBe(false);
  });

  it('respects segment length on plain patterns', () => {
    expect(matchesTopic('a/b', 'a/b/c')).toBe(false);
    expect(matchesTopic('a/b/c', 'a/b')).toBe(false);
  });
});
