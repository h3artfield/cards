import { deckBuilderStore } from "../../deck-builder/deck-builder-store";
import type { CatalogOracleCard } from "../../deck-builder/types";
import { mergeCatalogHitWithOracle } from "./card-catalog";
import { normalizeCardNameForMatch } from "./magic-commander-inventory";
import { lookupCardByName } from "./scryfall-lookup-service";

/** Known customer typos — exact local alias before fuzzy search. */
const CARD_NAME_ALIASES: Record<string, string> = {
  solrng: "Sol Ring",
  solring: "Sol Ring",
  lightngbolt: "Lightning Bolt",
  lighteningbolt: "Lightning Bolt",
  comandtower: "Command Tower",
  commandtower: "Command Tower",
  ataxapraetorsvoice: "Atraxa, Praetors' Voice",
  rhysticstdy: "Rhystic Study",
  lorienrevealed: "Lórien Revealed",
};

export interface ControlledResolutionCandidate {
  oracleId: string;
  canonicalName: string;
  score: number;
  source: "alias" | "normalized" | "local_fuzzy" | "live_fuzzy";
}

export interface ControlledResolutionResult {
  status: "resolved" | "ambiguous" | "unresolved";
  canonicalName?: string;
  oracleId?: string;
  candidates?: ControlledResolutionCandidate[];
  confidence?: number;
  margin?: number;
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i]![0] = i;
  for (let j = 0; j <= n; j++) dp[0]![j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i]![j] = Math.min(
        dp[i - 1]![j]! + 1,
        dp[i]![j - 1]! + 1,
        dp[i - 1]![j - 1]! + cost,
      );
    }
  }
  return dp[m]![n]!;
}

function fuzzyScore(queryNorm: string, candidateNorm: string): number {
  if (queryNorm === candidateNorm) return 100;
  if (candidateNorm.includes(queryNorm) || queryNorm.includes(candidateNorm)) {
    return 85 - Math.abs(candidateNorm.length - queryNorm.length);
  }
  const dist = levenshtein(queryNorm, candidateNorm);
  const maxLen = Math.max(queryNorm.length, candidateNorm.length);
  if (dist > Math.max(2, Math.floor(maxLen / 3))) return 0;
  return Math.max(0, 100 - dist * 18);
}

async function listLocalOracleCandidates(limit = 200): Promise<CatalogOracleCard[]> {
  const oracles: CatalogOracleCard[] = [];
  const seen = new Set<string>();

  async function addOracle(o: CatalogOracleCard | null | undefined) {
    if (!o || seen.has(o.id)) return;
    seen.add(o.id);
    oracles.push(o);
  }

  const seedNames = [
    "Sol Ring",
    "Lightning Bolt",
    "Command Tower",
    "Atraxa, Praetors' Voice",
    "Rhystic Study",
    "Lórien Revealed",
    "Counterspell",
    "Arcane Signet",
    "Prosper, Tome-Bound",
    "Animar, Soul of Elements",
  ];
  for (const name of seedNames) {
    await addOracle(await deckBuilderStore.findCatalogOracleByCanonicalName(name));
  }

  const searchTerms = ["sol", "light", "command", "atraxa", "rhystic", "lorien", "bolt", "ring", "tower", "prosper"];
  for (const term of searchTerms) {
    const cards = await deckBuilderStore.searchCatalogCards(term, 30);
    for (const card of cards) {
      if (card.oracleId) {
        await addOracle(await deckBuilderStore.getCatalogOracleCard(card.oracleId));
      }
    }
    if (oracles.length >= limit) break;
  }

  return oracles.slice(0, limit);
}

const MIN_CONFIDENCE = 72;
const MIN_MARGIN = 14;

/** Controlled card-name resolution with confidence thresholds. */
export async function resolveCardNameControlled(
  rawName: string,
): Promise<ControlledResolutionResult> {
  const trimmed = rawName.trim();
  if (!trimmed || trimmed.length < 3) return { status: "unresolved" };

  const norm = normalizeCardNameForMatch(trimmed);

  const aliasTarget = CARD_NAME_ALIASES[norm];
  if (aliasTarget) {
    const hit = await lookupCardByName(aliasTarget);
    if (hit?.oracleId) {
      const merged = await mergeCatalogHitWithOracle(hit);
      return {
        status: "resolved",
        canonicalName: merged.name,
        oracleId: merged.oracleId,
        confidence: 100,
        margin: 100,
      };
    }
  }

  const exactHit = await lookupCardByName(trimmed);
  if (exactHit?.oracleId) {
    const merged = await mergeCatalogHitWithOracle(exactHit);
    return {
      status: "resolved",
      canonicalName: merged.name,
      oracleId: merged.oracleId,
      confidence: 98,
      margin: 98,
    };
  }

  const normalizedOracle = await deckBuilderStore.findCatalogOracleByNormalizedName(trimmed);
  if (normalizedOracle) {
    return {
      status: "resolved",
      canonicalName: normalizedOracle.canonicalName,
      oracleId: normalizedOracle.id,
      confidence: 95,
      margin: 95,
    };
  }

  const localOracles = await listLocalOracleCandidates();
  const ranked: ControlledResolutionCandidate[] = [];
  for (const oracle of localOracles) {
    const candidateNorm = normalizeCardNameForMatch(oracle.canonicalName);
    const score = fuzzyScore(norm, candidateNorm);
    if (score <= 0) continue;
    ranked.push({
      oracleId: oracle.id,
      canonicalName: oracle.canonicalName,
      score,
      source: "local_fuzzy",
    });
  }
  ranked.sort((a, b) => b.score - a.score);

  if (ranked.length >= 1) {
    const top = ranked[0]!;
    const second = ranked[1];
    const margin = second ? top.score - second.score : top.score;
    if (top.score >= MIN_CONFIDENCE && margin >= MIN_MARGIN) {
      return {
        status: "resolved",
        canonicalName: top.canonicalName,
        oracleId: top.oracleId,
        confidence: top.score,
        margin,
      };
    }
    if (ranked.length > 1 && top.score >= 60) {
      return { status: "ambiguous", candidates: ranked.slice(0, 5) };
    }
  }

  const liveHit = await lookupCardByName(trimmed);
  if (liveHit?.oracleId) {
    const merged = await mergeCatalogHitWithOracle(liveHit);
    const liveNorm = normalizeCardNameForMatch(merged.name);
    const score = fuzzyScore(norm, liveNorm);
    if (score >= MIN_CONFIDENCE) {
      return {
        status: "resolved",
        canonicalName: merged.name,
        oracleId: merged.oracleId,
        confidence: score,
        margin: score,
      };
    }
  }

  return { status: "unresolved" };
}
