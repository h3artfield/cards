import { buildCardFeatureBundle } from "@/lib/semantic-visualization/feature-vector-v1";
import { PRIMITIVE_ACTION_FEATURES } from "@/lib/semantic-visualization/feature-spec-v1";
import { DERIVED_ROLE_NAMES } from "@/lib/semantic-visualization/derived-features-v1";
import {
  buildCardInteractionProfile,
  scoredDimensionsToVector,
} from "../card-interaction-profile-v1";
import type { ShadowSemanticIndex } from "../shadow-semantic-index";
import type { DeckSemanticCensus, EligibleMainboardCard } from "./types";
import type { DeckResolutionCatalog } from "../../../../scripts/lib/load-deck-resolution-catalog";

const DENSITY_ROLE_MAP: Record<string, string> = {
  card_draw: "drawDensity",
  removal: "removalDensity",
  board_wipe: "destroyDensity",
  countermagic: "counterDensity",
  tutor: "tutorDensity",
  recursion: "recursionDensity",
  reanimation: "reanimationDensity",
  sacrifice_outlet: "sacrificeDensity",
  sacrifice_payoff: "sacrificeDensity",
  token_generation: "tokenCreationDensity",
  mana_generation: "manaGenerationDensity",
  ramp: "manaGenerationDensity",
  mill: "millDensity",
  graveyard_setup: "graveyardInteractionDensity",
  cast_from_exile: "castFromExileDensity",
  blink_flicker: "blinkFlickerDensity",
  copy_effects: "copyEffectDensity",
  spell_copying: "copyEffectDensity",
  protection: "protectionDensity",
};

export const RC8_MISSINGNESS_FEATURE_NAMES = [
  "rc8_missing_unresolvedFraction",
  "rc8_missing_absentFraction",
  "rc8_missing_structurallyInvalidFraction",
  "rc8_missing_needsReviewFraction",
  "rc8_missing_usableFraction",
  "rc8_missing_notAggregatableFraction",
  "rc8_missing_semanticCoverageFraction",
  "rc8_missing_aggregatableCoverageFraction",
] as const;

function prefixKeys(prefix: string, vec: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(vec)) out[`${prefix}${k}`] = v;
  return out;
}

function weightedMeanKeyed(
  vectors: Array<{ weight: number; vec: Record<string, number> }>,
): Record<string, number> {
  const totals = new Map<string, number>();
  let weightSum = 0;
  for (const row of vectors) {
    weightSum += row.weight;
    for (const [k, v] of Object.entries(row.vec)) {
      totals.set(k, (totals.get(k) ?? 0) + v * row.weight);
    }
  }
  const out: Record<string, number> = {};
  const denom = weightSum > 0 ? weightSum : 1;
  for (const [k, v] of totals) out[k] = v / denom;
  return out;
}

export function buildRc8SemanticDeckFeatures(input: {
  cards: EligibleMainboardCard[];
  catalog: DeckResolutionCatalog;
  shadowIndex: ShadowSemanticIndex;
  census: DeckSemanticCensus;
}): Record<string, number> {
  const actionTotals = new Map<string, number>();
  const abilityProfiles: Array<{ weight: number; vec: Record<string, number> }> = [];
  const zoneProfiles: Array<{ weight: number; vec: Record<string, number> }> = [];
  const ownerProfiles: Array<{ weight: number; vec: Record<string, number> }> = [];
  const attackProfiles: Array<{ weight: number; vec: Record<string, number> }> = [];
  const vulnProfiles: Array<{ weight: number; vec: Record<string, number> }> = [];
  const depProfiles: Array<{ weight: number; vec: Record<string, number> }> = [];
  const derivedRoleTotals = new Map<string, number>();
  let totalWeight = 0;
  let cardsAggregated = 0;

  for (const row of input.cards) {
    const shadow = input.shadowIndex.byOracleId.get(row.oracleId);
    const card = input.catalog.byOracleId.get(row.oracleId);
    if (!shadow || !card) continue;

    totalWeight += row.quantity;
    cardsAggregated += 1;

    const bundle = buildCardFeatureBundle({ shadow, card });
    const profile = buildCardInteractionProfile({
      oracleId: row.oracleId,
      card,
      actions: shadow.semantic.actions,
      abilities: shadow.semantic.abilities,
      semanticVersion: input.shadowIndex.semanticVersion,
      parserVersion: input.shadowIndex.parserVersion,
      parserBlobClosure: input.shadowIndex.parserBlobClosure,
    });

    for (const actionType of PRIMITIVE_ACTION_FEATURES) {
      const count = shadow.semantic.actions.filter((a) => a.actionType === actionType).length;
      if (count > 0) {
        actionTotals.set(actionType, (actionTotals.get(actionType) ?? 0) + count * row.quantity);
      }
    }

    abilityProfiles.push({ weight: row.quantity, vec: profile.timingProfile });
    zoneProfiles.push({ weight: row.quantity, vec: profile.zonesUsed });
    ownerProfiles.push({
      weight: row.quantity,
      vec: Object.fromEntries(
        [...new Set(shadow.semantic.actions.map((a) => a.semanticOwner ?? "source_card"))].map(
          (o) => [o, 1],
        ),
      ),
    });
    attackProfiles.push({
      weight: row.quantity,
      vec: scoredDimensionsToVector(profile.answerCapabilities),
    });
    vulnProfiles.push({
      weight: row.quantity,
      vec: {
        ...scoredDimensionsToVector(profile.dependencies),
        ...scoredDimensionsToVector(profile.vulnerabilities),
      },
    });
    depProfiles.push({
      weight: row.quantity,
      vec: scoredDimensionsToVector(profile.dependencies),
    });

    for (const role of bundle.derivedRoles) {
      derivedRoleTotals.set(role, (derivedRoleTotals.get(role) ?? 0) + row.quantity);
    }
  }

  const out: Record<string, number> = {};
  const actionDenom = totalWeight > 0 ? totalWeight : 1;
  for (const actionType of PRIMITIVE_ACTION_FEATURES) {
    out[`rc8_action_${actionType}`] = (actionTotals.get(actionType) ?? 0) / actionDenom;
  }

  Object.assign(out, prefixKeys("rc8_ability_", weightedMeanKeyed(abilityProfiles)));
  Object.assign(out, prefixKeys("rc8_zone_", weightedMeanKeyed(zoneProfiles)));
  Object.assign(out, prefixKeys("rc8_owner_", weightedMeanKeyed(ownerProfiles)));
  Object.assign(out, prefixKeys("rc8_attack_", weightedMeanKeyed(attackProfiles)));
  Object.assign(out, prefixKeys("rc8_vuln_", weightedMeanKeyed(vulnProfiles)));
  Object.assign(out, prefixKeys("rc8_dep_", weightedMeanKeyed(depProfiles)));

  for (const role of DERIVED_ROLE_NAMES) {
    out[`rc8_role_${role}`] = (derivedRoleTotals.get(role) ?? 0) / actionDenom;
    const densityName = DENSITY_ROLE_MAP[role];
    if (densityName) {
      out[`rc8_density_${densityName}`] = (derivedRoleTotals.get(role) ?? 0) / actionDenom;
    }
  }

  const eligibleQty = input.census.eligibleMainboardCardQuantity;
  const c = input.census.bucketsByQuantity;
  out.rc8_missing_unresolvedFraction = eligibleQty > 0 ? c.unresolved / eligibleQty : 0;
  out.rc8_missing_absentFraction = eligibleQty > 0 ? c.absent / eligibleQty : 0;
  out.rc8_missing_structurallyInvalidFraction =
    eligibleQty > 0 ? c.structurally_invalid / eligibleQty : 0;
  out.rc8_missing_needsReviewFraction = eligibleQty > 0 ? c.needs_review / eligibleQty : 0;
  out.rc8_missing_usableFraction = eligibleQty > 0 ? c.usable / eligibleQty : 0;
  out.rc8_missing_notAggregatableFraction =
    eligibleQty > 0 ? input.census.cardsMissingSemantics / eligibleQty : 0;
  out.rc8_missing_semanticCoverageFraction = input.census.semanticCoverageByQuantity;
  out.rc8_missing_aggregatableCoverageFraction = input.census.aggregatableCoverageByQuantity;
  out.rc8_meta_cardsAggregated = cardsAggregated;
  out.rc8_meta_eligibleUniqueOracleIds = input.census.eligibleMainboardUniqueOracleIds;

  return out;
}
