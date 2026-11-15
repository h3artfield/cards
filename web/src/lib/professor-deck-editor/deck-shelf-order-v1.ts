const STORAGE_PREFIX = "my-decks-order-v1";

function storageKey(storeSlug: string): string {
  return `${STORAGE_PREFIX}:${storeSlug}`;
}

export function readDeckShelfOrderV1(storeSlug: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(storageKey(storeSlug));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((key): key is string => typeof key === "string") : [];
  } catch {
    return [];
  }
}

export function writeDeckShelfOrderV1(storeSlug: string, keys: readonly string[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey(storeSlug), JSON.stringify([...keys]));
  } catch {
    // Private browsing or quota — order just won't persist this session.
  }
}

export function applyDeckShelfOrderV1<T extends { key: string }>(
  decks: readonly T[],
  storeSlug: string,
): T[] {
  const stored = readDeckShelfOrderV1(storeSlug);
  if (!stored.length) return [...decks];

  const byKey = new Map(decks.map((deck) => [deck.key, deck]));
  const ordered: T[] = [];
  for (const key of stored) {
    const deck = byKey.get(key);
    if (deck) {
      ordered.push(deck);
      byKey.delete(key);
    }
  }
  for (const deck of decks) {
    if (byKey.has(deck.key)) ordered.push(deck);
  }
  return ordered;
}

export function reorderDeckShelfKeysV1(
  keys: readonly string[],
  fromIndex: number,
  toIndex: number,
): string[] {
  if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return [...keys];
  const next = [...keys];
  const [moved] = next.splice(fromIndex, 1);
  if (!moved) return next;
  next.splice(toIndex, 0, moved);
  return next;
}
