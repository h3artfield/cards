import { hamming64, isMeaningfulCardHash } from "./dhash";
import { hamming384, type Binary384 } from "./dinov3-embed";
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

/**
 * Multi-candidate hash matching across a list of jittered camera hashes.
 * Picks the lowest Hamming distance per catalog card across all candidate hashes.
 */
export function matchScanIndexMulti(
  hashes: bigint[],
  cards: ScanIndexCard[],
  threshold = SCAN_INDEX_MATCH_THRESHOLD,
): ScanIndexMatch[] {
  const validHashes = hashes.filter(isMeaningfulCardHash);
  if (validHashes.length === 0 || cards.length === 0) return [];

  const hits: ScanIndexMatch[] = [];
  for (let i = 0; i < cards.length; i++) {
    const card = cards[i]!;
    let bestDist = 65;
    for (let j = 0; j < validHashes.length; j++) {
      const d = hamming64(validHashes[j]!, card.hash);
      if (d < bestDist) {
        bestDist = d;
        if (d === 0) break;
      }
    }
    if (bestDist <= threshold) {
      hits.push({ card, distance: bestDist });
    }
  }
  hits.sort((a, b) => a.distance - b.distance || a.card.name.localeCompare(b.card.name));
  return hits;
}

/**
 * Strict 128-bit 2D matching (64-bit horizontal dHash + 64-bit vertical vHash)
 * with runner-up separation margin so unindexed cards never produce random false positives.
 */
export function matchScanIndex2D(
  candidates: Array<{ hHash: bigint; vHash: bigint }>,
  cards: ScanIndexCard[],
): { hits: ScanIndexMatch[]; margin: number; confident: boolean } {
  const valid = candidates.filter(
    (c) => isMeaningfulCardHash(c.hHash) && isMeaningfulCardHash(c.vHash),
  );
  if (valid.length === 0 || cards.length === 0) {
    return { hits: [], margin: 0, confident: false };
  }

  const hits: ScanIndexMatch[] = [];
  for (let i = 0; i < cards.length; i++) {
    const card = cards[i]!;
    const hasV = card.vHash != null && card.vHash !== BigInt(0);
    let bestCombined = 129;

    for (let j = 0; j < valid.length; j++) {
      const c = valid[j]!;
      const dH = hamming64(c.hHash, card.hash);
      if (hasV) {
        if (dH > 10) continue;
        const dV = hamming64(c.vHash, card.vHash!);
        if (dV > 10) continue;
        const total = dH + dV;
        if (total < bestCombined) bestCombined = total;
      } else {
        // Legacy 64-bit fallback: require very tight <= 6 bit distance
        if (dH <= 6) {
          const scaled = dH * 2;
          if (scaled < bestCombined) bestCombined = scaled;
        }
      }
    }

    if (bestCombined <= 16) {
      hits.push({ card, distance: bestCombined });
    }
  }

  hits.sort(
    (a, b) => a.distance - b.distance || a.card.name.localeCompare(b.card.name),
  );

  if (hits.length === 0) {
    return { hits: [], margin: 0, confident: false };
  }

  const best = hits[0]!;
  // Find first hit with a different card name to measure runner-up separation margin
  const runnerUp = hits.find(
    (h) => h.card.name.toLowerCase() !== best.card.name.toLowerCase(),
  );
  const margin = runnerUp ? runnerUp.distance - best.distance : 16 - best.distance;
  const confident = best.distance <= 13 && margin >= 4;

  return { hits, margin, confident };
}

/** Same-art reprints sit within 2 bits of the best hit. */
export function matchCluster(hits: ScanIndexMatch[], window = 2): ScanIndexMatch[] {
  if (hits.length === 0) return [];
  const best = hits[0]!.distance;
  return hits.filter((hit) => hit.distance <= best + window);
}

/**
 * 384-bit DINOv3 neural feature matching with runner-up separation margin.
 * Out of 384 bits, random orthogonal vectors have distance ~192.
 * Identical card artworks under camera/lighting variation have distance <= 78 (~80%+ bit agreement).
 */
export function matchScanIndexDinoV3(
  dinoHash: Binary384,
  cards: ScanIndexCard[],
  maxDistance = 82,
): { hits: ScanIndexMatch[]; margin: number; confident: boolean } {
  const hits: ScanIndexMatch[] = [];
  for (let i = 0; i < cards.length; i++) {
    const card = cards[i]!;
    if (!card.dinoHash) continue;
    const dist = hamming384(dinoHash, card.dinoHash);
    if (dist <= maxDistance) {
      hits.push({ card, distance: dist });
    }
  }

  hits.sort(
    (a, b) => a.distance - b.distance || a.card.name.localeCompare(b.card.name),
  );

  if (hits.length === 0) {
    return { hits: [], margin: 0, confident: false };
  }

  const best = hits[0]!;
  const runnerUp = hits.find(
    (h) => h.card.name.toLowerCase() !== best.card.name.toLowerCase(),
  );
  const margin = runnerUp
    ? runnerUp.distance - best.distance
    : maxDistance - best.distance;

  const confident = best.distance <= 76 && margin >= 10;
  return { hits, margin, confident };
}



