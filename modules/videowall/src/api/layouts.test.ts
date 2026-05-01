import { describe, expect, it } from 'vitest';
import { LayoutsService } from './layouts.service.js';

const tenantId = 'default';
const ownerId = 'alice';

describe('LayoutsService', () => {
  it('creates a 2x2 layout', () => {
    const svc = new LayoutsService();
    const l = svc.upsert({
      tenantId,
      ownerId,
      name: 'Lobby wall',
      preset: '2x2',
      cells: [
        { streamId: 'lobby' },
        { streamId: 'parking' },
        { streamId: 'gate' },
        { streamId: 'reception' },
      ],
    });
    expect(l.cells.length).toBe(4);
    expect(svc.list(tenantId)).toContain(l);
  });

  it('rejects mismatched cell count for a preset', () => {
    const svc = new LayoutsService();
    expect(() =>
      svc.upsert({
        tenantId,
        ownerId,
        name: 'Bad',
        preset: '3x3',
        cells: [{ streamId: 'one' }],
      }),
    ).toThrow(/expects 9 cells/);
  });

  it('requires customGrid when preset is custom', () => {
    const svc = new LayoutsService();
    expect(() =>
      svc.upsert({
        tenantId,
        ownerId,
        name: 'Mixed',
        preset: 'custom',
        cells: [],
      }),
    ).toThrow(/customGrid/);
  });

  it('preserves createdAt across updates', () => {
    const svc = new LayoutsService();
    const a = svc.upsert({
      tenantId,
      ownerId,
      name: 'L',
      preset: '1x1',
      cells: [{ streamId: 'lobby' }],
    });
    const b = svc.upsert({
      tenantId,
      ownerId,
      id: a.id,
      name: 'L renamed',
      preset: '1x1',
      cells: [{ streamId: 'lobby' }],
    });
    expect(b.id).toBe(a.id);
    expect(b.createdAtMs).toBe(a.createdAtMs);
    expect(b.updatedAtMs).toBeGreaterThanOrEqual(a.updatedAtMs);
    expect(b.name).toBe('L renamed');
  });

  it('cross-tenant lookups return undefined', () => {
    const svc = new LayoutsService();
    const l = svc.upsert({
      tenantId,
      ownerId,
      name: 'L',
      preset: '1x1',
      cells: [{}],
    });
    expect(svc.get('other', l.id)).toBeUndefined();
  });
});
