/**
 * Phase 6A calibration v2 — functional semantic recall (oracle-grounded, score-independent).
 */
import { buildCardFeatureBundle } from "@/lib/semantic-visualization/feature-vector-v1";
import type { ShadowSemanticIndex } from "../../src/lib/commander-strategy/shadow-semantic-index";
import type { DeckResolutionCatalog } from "./load-deck-resolution-catalog";
import type { SemanticCandidate } from "../../src/lib/deck-synthesis/semantic-candidate-retrieval-v1";
import type { FunctionalSemanticRequirement } from "./phase6a-calibration-v2-types";

const FUNCTION_ORACLE_PATTERNS: Record<string, RegExp[]> = {
  recursion: [/return .* from .* graveyard/, /return target creature card from your graveyard/, /from your graveyard to the battlefield/, /unearth/i],
  reanimation: [/return target creature card from your graveyard/, /from your graveyard to the battlefield/],
  mill: [/mill \d+/, /target player mills/, /put the top .* cards .* into .* graveyard/],
  sacrifice_outlet: [/sacrifice a creature/, /sacrifice another creature/, /sacrifice a permanent/],
  sacrifice_payoff: [/whenever .* dies/, /whenever a creature you control dies/, /whenever .* sacrificed/],
  card_draw: [/draw a card/, /draw two cards/, /draw three cards/],
  ramp: [/add \{/, /search your library for .* land/, /put .* land .* onto the battlefield/],
  removal: [/destroy target/, /exile target/, /damage to target/],
  countermagic: [/counter target spell/],
  tutor: [/search your library for/, /search your library and reveal/],
  token_generation: [/create .* token/],
  graveyard_setup: [/mill \d+ cards/, /put .* into your graveyard/, /self-mill/],
  protection: [/hexproof/, /indestructible/, /protection from/],
};

function cardOracleText(catalog: DeckResolutionCatalog, oracleId: string): { text: string; typeLine: string; name: string; roles: string[] } {
  const card = catalog.byOracleId.get(oracleId);
  const text = (card?.oracleText ?? "").toLowerCase();
  const typeLine = card?.typeLine ?? "";
  const name = card?.canonicalName ?? oracleId;
  return { text, typeLine, name, roles: [] };
}

function derivedRoles(shadowIndex: ShadowSemanticIndex, catalog: DeckResolutionCatalog, oracleId: string): string[] {
  const shadow = shadowIndex.byOracleId.get(oracleId);
  const card = catalog.byOracleId.get(oracleId);
  if (!shadow?.semantic || !card) return [];
  return buildCardFeatureBundle({ shadow, card }).derivedRoles;
}

function matchesFunction(fn: string, text: string, roles: string[]): boolean {
  const key = fn.toLowerCase().replace(/-/g, "_");
  if (roles.some((r) => r === key || r.includes(key) || key.includes(r))) return true;
  for (const [roleKey, patterns] of Object.entries(FUNCTION_ORACLE_PATTERNS)) {
    if (!key.includes(roleKey) && roleKey !== key) continue;
    if (patterns.some((p) => p.test(text))) return true;
  }
  if (FUNCTION_ORACLE_PATTERNS[key]?.some((p) => p.test(text))) return true;
  return false;
}

export type FunctionalRecallResult = {
  requirementId: string;
  description: string;
  minViableAlternatives: number;
  viableAlternativeCount: number;
  strongExampleCount: number;
  satisfied: boolean;
  examples: Array<{ oracleId: string; canonicalName: string; strength: "STRONG" | "VALID" }>;
};

export function candidateMatchesRequirement(input: {
  requirement: FunctionalSemanticRequirement;
  oracleId: string;
  catalog: DeckResolutionCatalog;
  shadowIndex: ShadowSemanticIndex;
}): boolean {
  const fnTokens = input.requirement.linkedSpecFields.map((f) => f.split(":")[1]).filter(Boolean);
  const { text } = cardOracleText(input.catalog, input.oracleId);
  const roles = derivedRoles(input.shadowIndex, input.catalog, input.oracleId);
  return fnTokens.some((fn) => matchesFunction(fn!, text, roles));
}

export function candidatesMatchingRequirement(input: {
  requirement: FunctionalSemanticRequirement;
  candidates: SemanticCandidate[];
  catalog: DeckResolutionCatalog;
  shadowIndex: ShadowSemanticIndex;
}): SemanticCandidate[] {
  return input.candidates.filter((c) =>
    candidateMatchesRequirement({
      requirement: input.requirement,
      oracleId: c.oracleId,
      catalog: input.catalog,
      shadowIndex: input.shadowIndex,
    }),
  );
}

export function evaluateFunctionalSemanticRecall(input: {
  requirements: FunctionalSemanticRequirement[];
  candidates: SemanticCandidate[];
  catalog: DeckResolutionCatalog;
  shadowIndex: ShadowSemanticIndex;
}): FunctionalRecallResult[] {
  return input.requirements.map((req) => {
    const fnTokens = req.linkedSpecFields
      .map((f) => f.split(":")[1])
      .filter(Boolean);

    const matches: Array<{ oracleId: string; canonicalName: string; strength: "STRONG" | "VALID" }> = [];

    for (const c of input.candidates) {
      const { text, name } = cardOracleText(input.catalog, c.oracleId);
      const roles = derivedRoles(input.shadowIndex, input.catalog, c.oracleId);
      const hitCount = fnTokens.filter((fn) => matchesFunction(fn!, text, roles)).length;
      if (hitCount === 0) continue;
      matches.push({
        oracleId: c.oracleId,
        canonicalName: name,
        strength: hitCount >= 2 || roles.length >= 2 ? "STRONG" : "VALID",
      });
    }

    const strongExampleCount = matches.filter((m) => m.strength === "STRONG").length;
    const viableAlternativeCount = matches.length;

    return {
      requirementId: req.requirementId,
      description: req.description,
      minViableAlternatives: req.minViableAlternatives,
      viableAlternativeCount,
      strongExampleCount,
      satisfied: viableAlternativeCount >= req.minViableAlternatives,
      examples: matches.slice(0, 8),
    };
  });
}

export function aggregateFunctionalRecall(results: FunctionalRecallResult[]): {
  requirementCount: number;
  satisfiedCount: number;
  /** Oracle regex + ShadowSemanticIndex roles — deterministic proxy, not human review. */
  automatedFunctionalCoverageProxy: number;
} {
  const requirementCount = results.length;
  const satisfiedCount = results.filter((r) => r.satisfied).length;
  return {
    requirementCount,
    satisfiedCount,
    automatedFunctionalCoverageProxy: requirementCount ? satisfiedCount / requirementCount : 1,
  };
}

export function evaluateExactCardSentinelRecall(
  mustSurfacePreflight: Array<{ oracleId: string | null; preflightPass: boolean; effectiveQualityClass: string; cardName: string }>,
  candidates: SemanticCandidate[],
): {
  mustSurfaceCount: number;
  mustSurfaceSurfacedCount: number;
  exactCardSentinelRecall: number | null;
} {
  const validMust = mustSurfacePreflight.filter(
    (s) => s.effectiveQualityClass === "MUST_SURFACE" && s.preflightPass && s.oracleId,
  );
  if (!validMust.length) {
    return { mustSurfaceCount: 0, mustSurfaceSurfacedCount: 0, exactCardSentinelRecall: null };
  }
  const pool = new Set(candidates.map((c) => c.oracleId));
  const surfaced = validMust.filter((s) => pool.has(s.oracleId!)).length;
  return {
    mustSurfaceCount: validMust.length,
    mustSurfaceSurfacedCount: surfaced,
    exactCardSentinelRecall: surfaced / validMust.length,
  };
}
