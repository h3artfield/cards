/**
 * Phase 6A calibration v2 — repaired gold registry + preflight.
 * v1 MUST_SURFACE_GOLD is deprecated — do not tune retriever against it.
 */
import { normalizeOracleName } from "../../src/lib/deck-builder/golden-catalog/normalize-name";
import { getBracketPolicy } from "../../src/lib/bracket-policy/bracket-policy-v1";
import {
  gameChangerOracleIdSet,
  type CommanderGameChangerSnapshot,
} from "../../src/lib/commander-strategy/model-c/game-changer-snapshot-v1";
import type { CommanderBracket } from "../../src/lib/bracket-policy/bracket-policy-v1";
import {
  isCompetitiveDeckOracle,
  paperMetaForOracle,
  type DeckResolutionCatalog,
} from "./load-deck-resolution-catalog";
import {
  assessCommanderLegality,
  BENCHMARK_COMMANDER_LEGALITY_VERSION,
  loadCommanderFormatLegalitySnapshot,
} from "../../src/lib/deck-synthesis/benchmark-commander-legality-v1.1";
import { colorIdentityLegal } from "./phase6a-calibration-v2-constraints";
import type {
  CaseCalibrationGold,
  GoldPreflightFailure,
  PreflightSentinelResult,
  SentinelQualityClass,
} from "./phase6a-calibration-v2-types";
import type { RetrievalSpecification } from "../../src/lib/deck-synthesis/archetype-discovery-types-v1";
import { PHASE6A_REVIEW_CASE_IDS } from "./phase6a-human-retrieval-adjudication-v1";

export { PHASE6A_REVIEW_CASE_IDS };

export const CALIBRATION_V2_GOLD: Record<string, CaseCalibrationGold> = {
  "single-graveyard-meren": {
    caseId: "single-graveyard-meren",
    functionalSemanticRequirements: [
      {
        requirementId: "repeatable_creature_recursion",
        description: "Legal ways to repeatedly return creatures from graveyard to battlefield.",
        linkedSpecFields: ["requiredFunctions:recursion", "requiredFunctions:reanimation"],
        minViableAlternatives: 3,
      },
      {
        requirementId: "death_payoff_density",
        description: "Cards that convert creature deaths into value.",
        linkedSpecFields: ["requiredFunctions:sacrifice_payoff", "outputsToExploit:death_triggers"],
        minViableAlternatives: 2,
      },
    ],
    sentinels: [
      { cardName: "Animate Dead", qualityClass: "STRONG_EXPECTED", mechanicalDefense: "Minimal-cost reanimation linked to graveyard engine.", linkedSpecFields: ["requiredFunctions:reanimation"] },
      { cardName: "Victimize", qualityClass: "STRONG_EXPECTED", mechanicalDefense: "Sacrifice-cost two-creature reanimation — not setup/enabler.", linkedSpecFields: ["requiredFunctions:recursion"] },
      { cardName: "Blood Artist", qualityClass: "VALID_EXAMPLE", mechanicalDefense: "Death payoff — one of many valid options.", linkedSpecFields: ["requiredFunctions:sacrifice_payoff"] },
      { cardName: "Gravecrawler", qualityClass: "CONDITIONAL_PACKAGE", mechanicalDefense: "Requires controlling a Zombie — not universal Meren gold.", linkedSpecFields: ["requiredFunctions:recursion"], requiredState: "controls_a_zombie" },
    ],
  },
  "single-mill-bruvac": {
    caseId: "single-mill-bruvac",
    functionalSemanticRequirements: [
      {
        requirementId: "mill_amplification",
        description: "Legal cards that mill opponents or multiply mill.",
        linkedSpecFields: ["requiredFunctions:mill"],
        minViableAlternatives: 3,
      },
    ],
    sentinels: [
      { cardName: "Traumatize", qualityClass: "STRONG_EXPECTED", mechanicalDefense: "Large single-target mill spell.", linkedSpecFields: ["requiredFunctions:mill"] },
      { cardName: "Fraying Sanity", qualityClass: "VALID_EXAMPLE", mechanicalDefense: "Mill multiplier example.", linkedSpecFields: ["requiredFunctions:mill"] },
      { cardName: "Mind Funeral", qualityClass: "INVALID_GOLD", mechanicalDefense: "Outside Bruvac WU color identity.", linkedSpecFields: ["requiredFunctions:mill"], notes: "v1 gold error" },
    ],
  },
  "multi-korvold": {
    caseId: "multi-korvold",
    functionalSemanticRequirements: [
      {
        requirementId: "sacrifice_outlets_and_fodder",
        description: "Ways to sacrifice permanents and generate sacrifice fodder Korvold can convert.",
        linkedSpecFields: ["requiredFunctions:sacrifice_outlet", "resourcesToConsume:sacrifice_fodder"],
        minViableAlternatives: 3,
      },
    ],
    sentinels: [
      { cardName: "Viscera Seer", qualityClass: "STRONG_EXPECTED", mechanicalDefense: "Free sacrifice outlet.", linkedSpecFields: ["requiredFunctions:sacrifice_outlet"] },
      { cardName: "Skullclamp", qualityClass: "VALID_EXAMPLE", mechanicalDefense: "Draw engine from small creatures — valid but not mandatory.", linkedSpecFields: ["requiredFunctions:card_draw"] },
      { cardName: "Food Chain", qualityClass: "INVALID_GOLD", mechanicalDefense: "Exiles creatures; Korvold rewards sacrificing permanents — not the same relationship.", linkedSpecFields: ["requiredFunctions:sacrifice_outlet"], notes: "v1 gold error" },
    ],
  },
  "partner-thrasios-tymna": {
    caseId: "partner-thrasios-tymna",
    functionalSemanticRequirements: [
      {
        requirementId: "card_advantage_engine",
        description: "Repeatable card advantage or mana development in four colors.",
        linkedSpecFields: ["requiredFunctions:card_draw", "requiredFunctions:ramp"],
        minViableAlternatives: 3,
      },
    ],
    sentinels: [
      { cardName: "Rhystic Study", qualityClass: "META_OR_STAPLE_BIASED", mechanicalDefense: "Generic staple — not commander-derived must-surface.", linkedSpecFields: ["requiredFunctions:card_draw"], notes: "v1 historical rationale rejected" },
      { cardName: "Swords to Plowshares", qualityClass: "VALID_EXAMPLE", mechanicalDefense: "Efficient removal in W — example only.", linkedSpecFields: ["requiredFunctions:removal"] },
    ],
  },
  "blindv5-22-broad-composite": {
    caseId: "blindv5-22-broad-composite",
    functionalSemanticRequirements: [
      {
        requirementId: "composite_value_functions",
        description: "Multiple defensible support functions for a broad composite engine.",
        linkedSpecFields: ["requiredFunctions:card_draw", "requiredFunctions:removal"],
        minViableAlternatives: 4,
      },
    ],
    sentinels: [
      { cardName: "Rhystic Study", qualityClass: "META_OR_STAPLE_BIASED", mechanicalDefense: "Generic staple, not commander-derived.", linkedSpecFields: ["requiredFunctions:card_draw"] },
      { cardName: "Cyclonic Rift", qualityClass: "META_OR_STAPLE_BIASED", mechanicalDefense: "Generic staple, not commander-derived.", linkedSpecFields: ["requiredFunctions:removal"] },
      { cardName: "Teferi's Protection", qualityClass: "META_OR_STAPLE_BIASED", mechanicalDefense: "Generic staple, not commander-derived.", linkedSpecFields: ["protectionNeeds:threat_protection"] },
    ],
  },
  "blindv5-29-static-restriction": {
    caseId: "blindv5-29-static-restriction",
    functionalSemanticRequirements: [
      {
        requirementId: "activated_graveyard_to_library_top",
        description: "Support for Hua Tuo's activated ability: put creature from graveyard on top of library.",
        linkedSpecFields: ["requiredFunctions:recursion", "statesToMaintain:graveyard_resources"],
        minViableAlternatives: 2,
      },
    ],
    sentinels: [
      { cardName: "Ghostly Prison", qualityClass: "INVALID_GOLD", mechanicalDefense: "Generic tax — not Hua Tuo activated graveyard→library-top mechanic.", linkedSpecFields: ["structuralNeeds:board_development"], notes: "v1 gold error" },
      { cardName: "Stitcher's Supplier", qualityClass: "STRONG_EXPECTED", mechanicalDefense: "Graveyard fuel for activated top-deck manipulation.", linkedSpecFields: ["requiredFunctions:graveyard_setup"] },
      { cardName: "Altar of Dementia", qualityClass: "VALID_EXAMPLE", mechanicalDefense: "Graveyard fuel example.", linkedSpecFields: ["requiredFunctions:graveyard_setup"] },
    ],
  },
  "blindv5-23-triggered-engine": {
    caseId: "blindv5-23-triggered-engine",
    functionalSemanticRequirements: [
      {
        requirementId: "top_of_library_manipulation",
        description: "Ways to manipulate top of library for Elsha's cast-from-top engine.",
        linkedSpecFields: ["requiredInputs:top_of_library", "requiredFunctions:card_draw"],
        minViableAlternatives: 3,
      },
    ],
    sentinels: [
      { cardName: "Sensei's Divining Top", qualityClass: "STRONG_EXPECTED", mechanicalDefense: "Top-of-library manipulation.", linkedSpecFields: ["requiredInputs:top_of_library"] },
      { cardName: "Scroll Rack", qualityClass: "VALID_EXAMPLE", mechanicalDefense: "Library manipulation example.", linkedSpecFields: ["requiredInputs:top_of_library"] },
    ],
  },
};

/** Default functional requirements derived from frozen spec when case has no explicit v2 gold block. */
export function defaultFunctionalRequirements(spec: RetrievalSpecification): CaseCalibrationGold["functionalSemanticRequirements"] {
  const reqs: CaseCalibrationGold["functionalSemanticRequirements"] = [];
  for (const fn of spec.requiredFunctions) {
    reqs.push({
      requirementId: `required_function:${fn}`,
      description: `Provide legal support for required function: ${fn}.`,
      linkedSpecFields: [`requiredFunctions:${fn}`],
      minViableAlternatives: 2,
    });
  }
  if (!reqs.length && spec.requiredInputs.length) {
    for (const input of spec.requiredInputs) {
      reqs.push({
        requirementId: `required_input:${input}`,
        description: `Provide legal support for required input: ${input}.`,
        linkedSpecFields: [`requiredInputs:${input}`],
        minViableAlternatives: 2,
      });
    }
  }
  return reqs;
}

function resolveCardName(catalog: DeckResolutionCatalog, name: string): { oracleId: string; canonicalName: string } | null {
  const norm = normalizeOracleName(name);
  const hits = catalog.byNormalizedName.get(norm);
  if (!hits?.length) return null;
  const card = hits[0]!;
  return { oracleId: card.oracleId, canonicalName: card.canonicalName };
}

function specLinksValid(linkedSpecFields: string[], spec: RetrievalSpecification): boolean {
  if (!linkedSpecFields.length) return false;
  const roleAliases: Record<string, string[]> = {
    reanimation: ["recursion", "reanimation", "graveyard"],
    recursion: ["recursion", "reanimation", "graveyard"],
    graveyard_setup: ["graveyard", "recursion", "mill"],
    mill: ["mill", "graveyard"],
    sacrifice_outlet: ["sacrifice", "sacrifice_outlet"],
  };

  return linkedSpecFields.some((field) => {
    const [key, value] = field.split(":");
    if (!key || !value) return false;
    const arr = spec[key as keyof RetrievalSpecification];
    if (!Array.isArray(arr)) return false;
    const values = arr as string[];
    if (values.some((v) => v === value || v.includes(value) || value.includes(v))) return true;
    const aliases = roleAliases[value] ?? [];
    return values.some((v) => aliases.some((a) => v.includes(a) || a.includes(v)));
  });
}

function assessGoldCardLegalityV11(input: {
  catalog: DeckResolutionCatalog;
  oracleId: string;
}): { legal: boolean; legalityModel: string; reason: string | null } {
  const card = input.catalog.byOracleId.get(input.oracleId);
  if (!card) return { legal: false, legalityModel: BENCHMARK_COMMANDER_LEGALITY_VERSION, reason: "UNRESOLVED_ORACLE" };
  const snapshot = loadCommanderFormatLegalitySnapshot();
  const assessment = assessCommanderLegality({ catalog: input.catalog, card, snapshot });
  const paper = paperMetaForOracle(input.catalog, input.oracleId);
  if (!paper.paperEligible) {
    return { legal: false, legalityModel: BENCHMARK_COMMANDER_LEGALITY_VERSION, reason: "NOT_PAPER_ELIGIBLE" };
  }
  if (!isCompetitiveDeckOracle(input.catalog, input.oracleId)) {
    return { legal: false, legalityModel: BENCHMARK_COMMANDER_LEGALITY_VERSION, reason: "NOT_COMPETITIVE_DECK_ELIGIBLE" };
  }
  const formatOk = assessment.currentCommanderFormatLegality === "LEGAL";
  return {
    legal: formatOk,
    legalityModel: BENCHMARK_COMMANDER_LEGALITY_VERSION,
    reason: formatOk ? null : assessment.legalityReason,
  };
}

export function preflightSentinel(input: {
  sentinel: CaseCalibrationGold["sentinels"][number];
  catalog: DeckResolutionCatalog;
  combinedColorIdentity: string[];
  bracket: CommanderBracket;
  spec: RetrievalSpecification;
  gameChangerSnapshot: CommanderGameChangerSnapshot;
  mustExcludeOracleIds?: string[];
}): PreflightSentinelResult {
  const failures: GoldPreflightFailure[] = [];
  let effectiveQualityClass: SentinelQualityClass = input.sentinel.qualityClass;

  if (input.sentinel.qualityClass === "INVALID_GOLD") {
    failures.push("INVALID_GOLD_CLASS");
    effectiveQualityClass = "INVALID_GOLD";
  }

  const resolved = resolveCardName(input.catalog, input.sentinel.cardName);
  if (!resolved) {
    failures.push("GOLD_RESOLUTION_FAILURE");
    return {
      cardName: input.sentinel.cardName,
      inputQualityClass: input.sentinel.qualityClass,
      effectiveQualityClass: "INVALID_GOLD",
      oracleId: null,
      canonicalName: null,
      preflightPass: false,
      preflightFailures: failures,
      mechanicalDefense: input.sentinel.mechanicalDefense,
      linkedSpecFields: input.sentinel.linkedSpecFields,
      requiredState: input.sentinel.requiredState,
    };
  }

  const card = input.catalog.byOracleId.get(resolved.oracleId)!;
  if (!colorIdentityLegal(input.catalog, resolved.oracleId, input.combinedColorIdentity)) {
    failures.push("COLOR_IDENTITY");
    effectiveQualityClass = "INVALID_GOLD";
  }
  const legality = assessGoldCardLegalityV11({ catalog: input.catalog, oracleId: resolved.oracleId });
  if (!legality.legal) failures.push("COMMANDER_FORMAT_ILLEGAL");

  const gcSet = gameChangerOracleIdSet(input.gameChangerSnapshot);
  const policy = getBracketPolicy(input.bracket);
  if (gcSet.has(resolved.oracleId) && policy.hardRules.gameChangerMax === 0) {
    failures.push("BRACKET_HARD_RULE");
  }

  if (input.mustExcludeOracleIds?.includes(resolved.oracleId)) failures.push("MUST_EXCLUDE");

  if (input.sentinel.requiredState && !input.sentinel.notes?.includes("package declared")) {
    failures.push("UNSTATED_PACKAGE_STATE");
    if (effectiveQualityClass === "MUST_SURFACE") effectiveQualityClass = "CONDITIONAL_PACKAGE";
  }

  if (!specLinksValid(input.sentinel.linkedSpecFields, input.spec)) {
    failures.push("RETRIEVAL_SPEC_UNLINKED");
  }

  if (failures.includes("GOLD_RESOLUTION_FAILURE") || failures.includes("INVALID_GOLD_CLASS")) {
    effectiveQualityClass = "INVALID_GOLD";
  } else if (failures.length > 0 && effectiveQualityClass === "MUST_SURFACE") {
    effectiveQualityClass = "INVALID_GOLD";
  }

  return {
    cardName: input.sentinel.cardName,
    inputQualityClass: input.sentinel.qualityClass,
    effectiveQualityClass,
    oracleId: resolved.oracleId,
    canonicalName: card.canonicalName,
    preflightPass: failures.length === 0 && effectiveQualityClass !== "INVALID_GOLD",
    preflightFailures: failures,
    mechanicalDefense: input.sentinel.mechanicalDefense,
    linkedSpecFields: input.sentinel.linkedSpecFields,
    requiredState: input.sentinel.requiredState,
  };
}

export function preflightCaseGold(input: {
  caseId: string;
  spec: RetrievalSpecification;
  catalog: DeckResolutionCatalog;
  combinedColorIdentity: string[];
  bracket: CommanderBracket;
  gameChangerSnapshot: CommanderGameChangerSnapshot;
}): {
  functionalSemanticRequirements: CaseCalibrationGold["functionalSemanticRequirements"];
  sentinelPreflight: PreflightSentinelResult[];
  mustSurfaceSentinels: PreflightSentinelResult[];
  goldSealingBlocked: boolean;
  goldSealingBlockReasons: string[];
} {
  const gold = CALIBRATION_V2_GOLD[input.caseId];
  const functionalSemanticRequirements = gold?.functionalSemanticRequirements ?? defaultFunctionalRequirements(input.spec);
  const sentinels = gold?.sentinels ?? [];

  const sentinelPreflight = sentinels.map((s) =>
    preflightSentinel({
      sentinel: s,
      catalog: input.catalog,
      combinedColorIdentity: input.combinedColorIdentity,
      bracket: input.bracket,
      spec: input.spec,
      gameChangerSnapshot: input.gameChangerSnapshot,
    }),
  );

  const mustSurfaceSentinels = sentinelPreflight.filter((s) => s.inputQualityClass === "MUST_SURFACE");
  const goldSealingBlockReasons: string[] = [];

  for (const s of sentinelPreflight) {
    if (s.preflightFailures.includes("GOLD_RESOLUTION_FAILURE")) {
      goldSealingBlockReasons.push(`${s.cardName}: GOLD_RESOLUTION_FAILURE`);
    }
    if (s.inputQualityClass === "MUST_SURFACE" && !s.preflightPass) {
      goldSealingBlockReasons.push(`${s.cardName}: MUST_SURFACE preflight failed (${s.preflightFailures.join(", ")})`);
    }
  }

  return {
    functionalSemanticRequirements,
    sentinelPreflight,
    mustSurfaceSentinels,
    goldSealingBlocked: goldSealingBlockReasons.length > 0,
    goldSealingBlockReasons,
    legalityPreflightModel: BENCHMARK_COMMANDER_LEGALITY_VERSION,
  };
}

export function getCalibrationCaseIds(): string[] {
  return PHASE6A_REVIEW_CASE_IDS.map((c) => c.caseId);
}
