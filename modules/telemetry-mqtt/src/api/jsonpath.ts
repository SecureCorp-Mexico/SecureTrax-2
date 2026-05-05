/**
 * Minimal JSONPath subset: dot-paths with optional bracket indices.
 *
 *   "$"               → root
 *   "$.foo"           → root.foo
 *   "$.a.b.c"
 *   "$.a[0]"
 *   "$.list[2].name"
 *
 * Returns undefined when any segment is missing or non-traversable. We keep
 * this minimal on purpose — full JSONPath (filters, recursion) lands with
 * the QueryService that backs the AI assistant's `query_data` tool.
 */
export function evalJsonPath(root: unknown, path: string): unknown {
  if (path === '$' || path === '') return root;
  if (!path.startsWith('$')) return undefined;
  const tokens = tokenize(path.slice(1));
  let cur: unknown = root;
  for (const t of tokens) {
    if (cur === null || cur === undefined) return undefined;
    if (t.kind === 'prop') {
      if (typeof cur !== 'object') return undefined;
      cur = (cur as Record<string, unknown>)[t.key];
    } else {
      if (!Array.isArray(cur)) return undefined;
      cur = cur[t.index];
    }
  }
  return cur;
}

interface PropTok {
  kind: 'prop';
  key: string;
}
interface IdxTok {
  kind: 'index';
  index: number;
}
type Tok = PropTok | IdxTok;

function tokenize(rest: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < rest.length) {
    const c = rest[i];
    if (c === '.') {
      i++;
      let j = i;
      while (j < rest.length && rest[j] !== '.' && rest[j] !== '[') j++;
      const key = rest.slice(i, j);
      if (key.length > 0) out.push({ kind: 'prop', key });
      i = j;
    } else if (c === '[') {
      const close = rest.indexOf(']', i);
      if (close === -1) return out;
      const inside = rest.slice(i + 1, close);
      const n = Number(inside);
      if (Number.isInteger(n)) out.push({ kind: 'index', index: n });
      i = close + 1;
    } else {
      i++;
    }
  }
  return out;
}
