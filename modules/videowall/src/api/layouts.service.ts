import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Inject, Optional } from '@nestjs/common';
import { BROADCASTER, type IBroadcaster } from '@securetrax/core';
import type { LayoutCell, LayoutPreset, VideowallLayout } from './types.js';

const PRESET_CELLS: Record<LayoutPreset, number | 'custom'> = {
  '1x1': 1,
  '2x2': 4,
  '3x3': 9,
  '4x4': 16,
  '1+5': 6,
  '1+7': 8,
  '1+12': 13,
  custom: 'custom',
};

interface UpsertInput {
  id?: string;
  tenantId: string;
  ownerId: string;
  name: string;
  preset: LayoutPreset;
  customGrid?: string;
  cells: LayoutCell[];
  tour?: { layoutIds: string[]; periodMs: number };
}

/**
 * In-memory layout store. The Drizzle schema lands with the next migration —
 * the interface here is what the controller depends on so swap is local.
 *
 * Saving a layout broadcasts `videowall/<id>/sync` so multi-monitor walls
 * can stay in lockstep — operator drives one window, every kiosk reflects.
 */
@Injectable()
export class LayoutsService {
  private readonly layouts = new Map<string, VideowallLayout>();

  constructor(
    @Optional() @Inject(BROADCASTER) private readonly broadcaster?: IBroadcaster,
  ) {}

  list(tenantId: string): VideowallLayout[] {
    return [...this.layouts.values()].filter((l) => l.tenantId === tenantId);
  }

  get(tenantId: string, id: string): VideowallLayout | undefined {
    const l = this.layouts.get(id);
    return l && l.tenantId === tenantId ? l : undefined;
  }

  upsert(input: UpsertInput): VideowallLayout {
    this.validateCells(input.preset, input.cells, input.customGrid);
    const id = input.id ?? `vw-${randomUUID()}`;
    const now = Date.now();
    const existing = this.layouts.get(id);
    const layout: VideowallLayout = {
      id,
      tenantId: input.tenantId,
      ownerId: existing?.ownerId ?? input.ownerId,
      name: input.name,
      preset: input.preset,
      customGrid: input.customGrid,
      cells: input.cells,
      tour: input.tour,
      createdAtMs: existing?.createdAtMs ?? now,
      updatedAtMs: now,
    };
    this.layouts.set(id, layout);
    this.broadcaster?.broadcast(`videowall/${id}/sync`, layout);
    return layout;
  }

  delete(tenantId: string, id: string): boolean {
    const l = this.get(tenantId, id);
    if (!l) return false;
    this.layouts.delete(id);
    return true;
  }

  validateCells(
    preset: LayoutPreset,
    cells: LayoutCell[],
    customGrid?: string,
  ): void {
    const expected = PRESET_CELLS[preset];
    if (expected === 'custom') {
      if (!customGrid) throw new Error('custom preset requires customGrid');
      return;
    }
    if (cells.length !== expected) {
      throw new Error(
        `preset ${preset} expects ${expected} cells, got ${cells.length}`,
      );
    }
  }
}
