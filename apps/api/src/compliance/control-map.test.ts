import { describe, expect, it } from 'vitest';
import { CONTROL_MAP, frameworks } from './control-map.js';

describe('CONTROL_MAP', () => {
  it('covers every advertised framework', () => {
    expect(frameworks()).toEqual(
      expect.arrayContaining([
        'ISO/IEC 27001:2022',
        'SOC 2',
        'IEC 62443',
        'GDPR',
      ]),
    );
  });

  it('every control declares at least one evidence tag', () => {
    for (const c of CONTROL_MAP) {
      expect(c.evidence.length).toBeGreaterThan(0);
    }
  });

  it('every (framework, control) pair is unique', () => {
    const keys = new Set<string>();
    for (const c of CONTROL_MAP) {
      const k = `${c.framework}/${c.control}`;
      expect(keys.has(k)).toBe(false);
      keys.add(k);
    }
  });

  it('narratives are non-trivial', () => {
    for (const c of CONTROL_MAP) {
      expect(c.narrative.length).toBeGreaterThan(40);
    }
  });
});
