import type { Position } from './types.js';

export interface PositionsLatestResponse {
  items: Position[];
}

export async function fetchLatestPositions(
  token?: string,
): Promise<PositionsLatestResponse> {
  const res = await fetch('/api/v1/tracking/positions/latest', {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error(`positions request failed: ${res.status}`);
  return (await res.json()) as PositionsLatestResponse;
}
