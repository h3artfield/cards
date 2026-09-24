import { hamming64 } from "./dhash";
import { SCAN_INDEX_MATCH_THRESHOLD, type ScanIndexCard, type ScanIndexMatch } from "./types";

export function matchScanIndex(
  hash: bigint,
  cards: ScanIndexCard[],
  threshold = SCAN_INDEX_MATCH_THRESHOLD,
): ScanIndexMatch[] {
  const hits: ScanIndexMatch[] = [];
  for (const card of cards) {
    const distance = hamming64(hash, card.hash);
    if (distance <= threshold) hits.push({ card, distance });
  }
  hits.sort((a, b) => a.distance - b.distance || a.card.name.localeCompare(b.card.name));
  return hits;
}

/** Same-art reprints sit within 2 bits of the best hit. */
export function matchCluster(hits: ScanIndexMatch[], window = 2): ScanIndexMatch[] {
  if (hits.length === 0) return [];
  const best = hits[0]!.distance;
  return hits.filter((hit) => hit.distance <= best + window);
}
