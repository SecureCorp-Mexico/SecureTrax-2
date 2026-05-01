export interface Position {
  assetId: string;
  ts: number;
  lat: number;
  lon: number;
  alt?: number;
  speed?: number;
  heading?: number;
  attrs?: Record<string, unknown>;
}
