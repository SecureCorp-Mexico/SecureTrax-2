import { describe, expect, it } from 'vitest';
import { evalJsonPath } from './jsonpath.js';

describe('evalJsonPath (subset)', () => {
  const sample = {
    coords: { lat: 19.43, lon: -99.13 },
    list: [
      { name: 'a', v: 1 },
      { name: 'b', v: 2 },
    ],
    raw: 'literal',
  };

  it('returns root for "$"', () => {
    expect(evalJsonPath(sample, '$')).toBe(sample);
  });

  it('walks dot paths', () => {
    expect(evalJsonPath(sample, '$.coords.lat')).toBe(19.43);
    expect(evalJsonPath(sample, '$.raw')).toBe('literal');
  });

  it('handles bracket indices', () => {
    expect(evalJsonPath(sample, '$.list[0].name')).toBe('a');
    expect(evalJsonPath(sample, '$.list[1].v')).toBe(2);
  });

  it('returns undefined on missing keys', () => {
    expect(evalJsonPath(sample, '$.nope')).toBeUndefined();
    expect(evalJsonPath(sample, '$.coords.alt')).toBeUndefined();
  });

  it('returns undefined on out-of-bounds index', () => {
    expect(evalJsonPath(sample, '$.list[5].name')).toBeUndefined();
  });

  it('returns undefined for malformed paths', () => {
    expect(evalJsonPath(sample, 'no-dollar')).toBeUndefined();
  });

  it('handles null/undefined intermediate gracefully', () => {
    expect(evalJsonPath({ a: null }, '$.a.b')).toBeUndefined();
    expect(evalJsonPath(undefined, '$.a')).toBeUndefined();
  });
});
