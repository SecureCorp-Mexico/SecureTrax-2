/** Pre-defined CSS-grid templates the client knows how to render. */
export type LayoutPreset =
  | '1x1'
  | '2x2'
  | '3x3'
  | '4x4'
  | '1+5'
  | '1+7'
  | '1+12'
  | 'custom';

export interface LayoutCell {
  /** Stream id from any video provider; the client resolves it via the
   * VideoStreamProvider catalog (`/v1/video/cameras` for SecureVu, etc.). */
  streamId?: string;
  /** Optional visual label override; defaults to the stream's name. */
  label?: string;
  /** Whether audio is unmuted for this tile. */
  audio?: boolean;
}

export interface VideowallLayout {
  id: string;
  tenantId: string;
  name: string;
  preset: LayoutPreset;
  /** When `preset === 'custom'`, a CSS grid template (e.g. "repeat(3, 1fr) / repeat(2, 1fr)"). */
  customGrid?: string;
  /** Tile array, length must match the preset's cell count (custom is variable). */
  cells: LayoutCell[];
  /** When set, the wall auto-tours these layout ids on the configured period. */
  tour?: { layoutIds: string[]; periodMs: number };
  ownerId: string;
  createdAtMs: number;
  updatedAtMs: number;
}
