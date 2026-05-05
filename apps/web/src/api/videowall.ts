export interface VideowallCell {
  streamId?: string;
  label?: string;
  audio?: boolean;
}

export interface VideowallLayout {
  id: string;
  name: string;
  preset: '1x1' | '2x2' | '3x3' | '4x4' | '1+5' | '1+7' | '1+12' | 'custom';
  customGrid?: string;
  cells: VideowallCell[];
}

export async function fetchLayout(
  id: string,
  token?: string,
): Promise<VideowallLayout> {
  const res = await fetch(`/api/v1/videowall/layouts/${id}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error(`videowall layout ${id} → ${res.status}`);
  return (await res.json()) as VideowallLayout;
}
