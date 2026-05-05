import { describe, expect, it } from 'vitest';
import { canonicalize } from './canonical.js';

describe('canonicalize', () => {
  it('sorts object keys deterministically', () => {
    expect(canonicalize({ b: 2, a: 1 })).toBe('{"a":1,"b":2}');
    expect(canonicalize({ a: 1, b: 2 })).toBe('{"a":1,"b":2}');
  });

  it('preserves array order', () => {
    expect(canonicalize([3, 1, 2])).toBe('[3,1,2]');
  });

  it('handles nested structures', () => {
    const a = canonicalize({ z: { b: 2, a: [3, { y: 1, x: 0 }] } });
    const b = canonicalize({ z: { a: [3, { x: 0, y: 1 }], b: 2 } });
    expect(a).toBe(b);
  });

  it('escapes strings via JSON.stringify', () => {
    expect(canonicalize({ s: 'a"b' })).toBe('{"s":"a\\"b"}');
  });

  it('serializes null and primitives', () => {
    expect(canonicalize(null)).toBe('null');
    expect(canonicalize(42)).toBe('42');
    expect(canonicalize('hi')).toBe('"hi"');
    expect(canonicalize(true)).toBe('true');
  });
});
