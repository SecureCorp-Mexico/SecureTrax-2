import { describe, expect, it } from 'vitest';
import { matchTopicPattern } from './topic-pattern.js';

describe('matchTopicPattern', () => {
  it('matches exact topics', () => {
    expect(matchTopicPattern('a/b/c', 'a/b/c')).toEqual({ ok: true, captures: {} });
    expect(matchTopicPattern('a/b/c', 'a/b/d').ok).toBe(false);
  });

  it('+ matches a single segment', () => {
    expect(matchTopicPattern('a/+/c', 'a/X/c').ok).toBe(true);
    expect(matchTopicPattern('a/+/c', 'a/X/Y/c').ok).toBe(false);
  });

  it('# matches the rest', () => {
    expect(matchTopicPattern('a/#', 'a/b/c/d').ok).toBe(true);
    expect(matchTopicPattern('a/#', 'b/c').ok).toBe(false);
  });

  it('{name} captures one segment', () => {
    const r = matchTopicPattern('securetrax/+/{assetId}/position', 'securetrax/t1/TRUCK-1/position');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.captures).toEqual({ assetId: 'TRUCK-1' });
  });

  it('multiple captures combine', () => {
    const r = matchTopicPattern('{tenant}/{site}/{asset}/x', 'A/B/C/x');
    if (!r.ok) throw new Error('expected match');
    expect(r.captures).toEqual({ tenant: 'A', site: 'B', asset: 'C' });
  });

  it('rejects empty capture name', () => {
    expect(matchTopicPattern('a/{}/b', 'a/X/b').ok).toBe(false);
  });

  it('respects segment count when no #', () => {
    expect(matchTopicPattern('a/b', 'a/b/c').ok).toBe(false);
    expect(matchTopicPattern('a/b/c', 'a/b').ok).toBe(false);
  });
});
