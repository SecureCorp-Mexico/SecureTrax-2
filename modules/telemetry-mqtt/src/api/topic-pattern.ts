/**
 * MQTT-style topic matcher with optional `{name}` segment captures.
 *
 *   pattern: "securetrax/+/{assetId}/position"
 *   topic:   "securetrax/tenantA/TRUCK-1/position"
 *   match:   { ok: true, captures: { assetId: 'TRUCK-1' } }
 *
 * Wildcards:
 *   `+`   matches exactly one segment (anonymous)
 *   `#`   matches the rest of the topic (must be the last segment)
 *   `{x}` matches one segment AND captures it under name `x`
 */

export interface TopicMatch {
  ok: true;
  captures: Record<string, string>;
}

export type TopicMatchResult = TopicMatch | { ok: false };

export function matchTopicPattern(
  pattern: string,
  topic: string,
): TopicMatchResult {
  const pp = pattern.split('/');
  const tp = topic.split('/');
  const captures: Record<string, string> = {};
  for (let i = 0; i < pp.length; i++) {
    const p = pp[i] ?? '';
    if (p === '#') return { ok: true, captures };
    if (i >= tp.length) return { ok: false };
    if (p === '+') continue;
    if (p.startsWith('{') && p.endsWith('}')) {
      const name = p.slice(1, -1);
      if (!name) return { ok: false };
      captures[name] = tp[i] ?? '';
      continue;
    }
    if (p !== tp[i]) return { ok: false };
  }
  if (pp.length !== tp.length) return { ok: false };
  return { ok: true, captures };
}
