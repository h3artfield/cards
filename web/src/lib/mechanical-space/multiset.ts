export type Multiset = Map<string, number>;

export function emptyMultiset(): Multiset {
  return new Map();
}

export function multisetFromPairs(pairs: Array<{ id: string; quantity: number }>): Multiset {
  const out = emptyMultiset();
  for (const pair of pairs) {
    if (pair.quantity <= 0) continue;
    out.set(pair.id, (out.get(pair.id) ?? 0) + pair.quantity);
  }
  return out;
}

export function cloneMultiset(ms: Multiset): Multiset {
  return new Map(ms);
}

export function addToMultiset(target: Multiset, key: string, quantity: number): void {
  if (quantity <= 0) return;
  target.set(key, (target.get(key) ?? 0) + quantity);
}

export function mergeMultisets(a: Multiset, b: Multiset): Multiset {
  const out = cloneMultiset(a);
  for (const [key, qty] of b) addToMultiset(out, key, qty);
  return out;
}

export function multisetQuantity(ms: Multiset): number {
  let n = 0;
  for (const qty of ms.values()) n += qty;
  return n;
}

export function canonicalMultisetKey(ms: Multiset): string {
  return [...ms.entries()]
    .filter(([, qty]) => qty > 0)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, qty]) => `${id}:${qty}`)
    .join("|");
}

export function parseCanonicalMultisetKey(key: string): Multiset {
  const out = emptyMultiset();
  if (!key) return out;
  for (const part of key.split("|")) {
    const idx = part.lastIndexOf(":");
    if (idx < 0) continue;
    const id = part.slice(0, idx);
    const qty = Number(part.slice(idx + 1));
    if (id && Number.isFinite(qty) && qty > 0) out.set(id, qty);
  }
  return out;
}

/** True iff every key in `a` appears in `b` with at least the same quantity. */
export function isSubmultiset(a: Multiset, b: Multiset): boolean {
  for (const [key, qty] of a) {
    if ((b.get(key) ?? 0) < qty) return false;
  }
  return true;
}

export function multisetsEqual(a: Multiset, b: Multiset): boolean {
  if (a.size !== b.size) return false;
  for (const [key, qty] of a) {
    if (b.get(key) !== qty) return false;
  }
  return true;
}

export function pairsFromMultiset(ms: Multiset): Array<{ id: string; quantity: number }> {
  return [...ms.entries()]
    .filter(([, qty]) => qty > 0)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, quantity]) => ({ id, quantity }));
}
