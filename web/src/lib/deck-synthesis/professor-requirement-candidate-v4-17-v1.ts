/**
 * Professor v4.17 — requirement eligibility and requirement-relative ranking.
 */
import type { DeckResolutionCatalog } from "../../../scripts/lib/load-deck-resolution-catalog";
import {
  cardLegalInCommanderColorIdentity,
  cardTruthAllowsIntelligenceParticipation,
  resolveCanonicalCardTruthV4164,
  type CanonicalCardTruthV4164,
} from "./professor-canonical-card-truth-v4-16-4-v1";
import type { BracketQualityContractV417, BrewRequirementV417, RequirementFunctionV417, RoleMatchPrecisionV417 } from "./professor-brew-blueprint-v4-17-v1";
import {
  evaluateFunctionalMatch,
  extractCardFunctionalCapabilities,
  matchTypeScore,
  type FunctionalMatchType,
} from "./functional-match-v1";
import type { CompiledRequirementSemanticQueryV417 } from "./professor-requirement-semantic-query-v4-17-v1";
import { familyBracketQualityScore, familyScoreWeights } from "./professor-requirement-bracket-v4-17-v1";
import { functionalTokenForFamily } from "./professor-requirement-materializer-v4-17-v1";
import { evaluateSemanticRolePrecision } from "./professor-semantic-role-v4-17-v1";

export const PROFESSOR_REQUIREMENT_CANDIDATE_V4_17_V1_VERSION = "professor-requirement-candidate-v4-17-v1";

export type RequirementCandidateEvaluationV417 = {
  version: typeof PROFESSOR_REQUIREMENT_CANDIDATE_V4_17_V1_VERSION;
  requirementId: string;
  oracleId: string;
  cardName: string;
  requirementEligible: boolean;
  satisfiedFunctions: RequirementFunctionV417[];
  unsatisfiedRequiredFunctions: RequirementFunctionV417[];
  hardConstraintPass: boolean;
  missionFit: number;
  manaEfficiency: number;
  reliability: number;
  bracketQuality: number;
  commanderSynergy: number;
  independentValue: number;
  roleCompression: number;
  finalRequirementScore: number;
  accepted: boolean;
  rejectionReason: string | null;
  functionalMatchType: FunctionalMatchType;
  semanticEvidence: string[];
  rolePrecision: RoleMatchPrecisionV417;
};

export type RequirementCandidateInputV417 = {
  oracleId: string;
  name: string;
  oracleText?: string;
  typeLine?: string;
  manaValue?: number | null;
  colors?: string[];
};

const ELIGIBLE_MATCH_TYPES = new Set<FunctionalMatchType>(["EXACT", "DIRECT_SUPPORT"]);

function interactionQualityBonus(args: {
  typeLine: string;
  oracleText: string;
  manaValue: number | null;
  requirement: BrewRequirementV417;
}): number {
  if (args.requirement.family !== "INTERACTION") return 0;
  let bonus = 0;
  const type = args.typeLine.toLowerCase();
  const text = args.oracleText.toLowerCase();
  const premium = args.requirement.bracketQualityContract.minimumManaEfficiency === "high";
  if (/instant/i.test(type)) bonus += premium ? 18 : 10;
  if (/sorcery/i.test(type)) bonus -= premium ? 14 : 6;
  if ((args.manaValue ?? 99) <= 2) bonus += premium ? 12 : 6;
  if (/additional cost| sacrifice a | sacrifice an | tap ,| as an additional cost/i.test(text)) bonus -= premium ? 16 : 8;
  if (/counter target spell|counter target activated|counter target triggered/i.test(text)) bonus += premium ? 10 : 4;
  if (/destroy target|exile target creature|exile target permanent/i.test(text) && /instant/i.test(type)) bonus += 6;
  return bonus;
}

function bracketEfficiencyScore(mv: number | null, contract: BracketQualityContractV417): number {
  if (mv == null) return 40;
  if (contract.minimumManaEfficiency === "high") {
    if (mv <= 1) return 98;
    if (mv <= 2) return 88;
    if (mv <= 3) return 75;
    if (mv <= 4) return 55;
    return 30;
  }
  if (contract.minimumManaEfficiency === "medium") {
    if (mv <= 3) return 85;
    if (mv <= 5) return 65;
    return 45;
  }
  return mv <= 5 ? 70 : 50;
}

function satisfiesRequiredFunction(
  fn: RequirementFunctionV417,
  matchType: FunctionalMatchType,
  mechanism: string,
): boolean {
  if (!ELIGIBLE_MATCH_TYPES.has(matchType)) return false;
  switch (fn) {
    case "RETURN_FROM_GRAVEYARD":
      return mechanism.includes("CREATURE_GY_TO_BATTLEFIELD") || mechanism.includes("CREATURE_GY_TO_HAND");
    case "INTERACTION":
      return mechanism === "COUNTER_SPELL" || mechanism === "INTERACTION_REMOVAL";
    case "ACCELERATION":
      return mechanism === "MANA_RAMP";
    case "CARD_VELOCITY":
      return mechanism === "CARD_DRAW";
    case "PROTECTION":
      return mechanism === "PROTECTION";
    case "ACCESS":
      return mechanism === "TUTOR_SEARCH";
    case "WIN_COMPONENT":
      return mechanism === "WIN_LINE" || mechanism === "COMBAT_THREAT";
    case "ENGINE_ENABLER":
    case "ENGINE":
      return ["ENGINE_ENABLER", "ENGINE_SUPPORT", "SACRIFICE_OUTLET", "TOKEN_GENERATION", "GRAVEYARD_SETUP"].includes(mechanism);
    case "ENGINE_PAYOFF":
      return ["ENGINE_PAYOFF", "TOKEN_GENERATION", "SACRIFICE_OUTLET"].includes(mechanism);
    case "GRAVEYARD_ENABLER":
      return mechanism === "GRAVEYARD_SETUP";
    case "RECOVERY":
      return mechanism.includes("RECOVERY") || mechanism.includes("GY_TO");
    case "RESOURCE_PRODUCTION":
      return mechanism === "TOKEN_GENERATION" || mechanism === "MANA_RAMP";
    case "RESOURCE_CONSUMER":
      return mechanism === "SACRIFICE_OUTLET";
    default:
      return matchType !== "NONE";
  }
}

export function detectVerifiedFunctionsForCard(args: {
  oracleText: string;
  typeLine: string;
  oracleId: string;
}): RequirementFunctionV417[] {
  const fns: RequirementFunctionV417[] = [];
  const families: RequirementFunctionV417[] = [
    "RETURN_FROM_GRAVEYARD",
    "GRAVEYARD_ENABLER",
    "INTERACTION",
    "ACCELERATION",
    "CARD_VELOCITY",
    "PROTECTION",
    "ACCESS",
    "WIN_COMPONENT",
    "ENGINE_ENABLER",
    "ENGINE_PAYOFF",
    "RECOVERY",
    "RESOURCE_PRODUCTION",
    "RESOURCE_CONSUMER",
  ];
  for (const fn of families) {
    const token = functionalTokenForFamily(fn as never);
    const match = evaluateFunctionalMatch({
      requirementId: "detect",
      requirementToken: token,
      candidateOracleId: args.oracleId,
      oracleText: args.oracleText,
      typeLine: args.typeLine,
    });
    if (satisfiesRequiredFunction(fn, match.matchType, match.mechanism)) {
      fns.push(fn);
    }
  }
  return fns;
}

function resolveTruth(
  candidate: RequirementCandidateInputV417,
  catalog: DeckResolutionCatalog | null,
): CanonicalCardTruthV4164 {
  if (candidate.oracleText && candidate.typeLine) {
    return {
      version: "professor-canonical-card-truth-v4-16-4-v1",
      status: "RESOLVED",
      oracleId: candidate.oracleId,
      name: candidate.name,
      manaValue: candidate.manaValue ?? null,
      colors: candidate.colors ?? [],
      colorIdentity: candidate.colors ?? [],
      typeLine: candidate.typeLine,
      supertypes: [],
      cardTypes: candidate.typeLine.split(/\s—/)[0]?.split(/\s+/).slice(1) ?? [],
      subtypes: [],
      oracleText: candidate.oracleText,
      keywords: [],
    };
  }
  return resolveCanonicalCardTruthV4164({ name: candidate.name, oracleId: candidate.oracleId, catalog });
}

export function evaluateCandidateAgainstRequirementV417(args: {
  requirement: BrewRequirementV417;
  compiledQuery: CompiledRequirementSemanticQueryV417;
  candidate: RequirementCandidateInputV417;
  commanderColorIdentity: string[];
  catalog?: DeckResolutionCatalog | null;
  genericEngineScore?: number;
  genericCharterScore?: number;
}): RequirementCandidateEvaluationV417 {
  const catalog = args.catalog ?? null;
  const truth = resolveTruth(args.candidate, catalog);
  const base = {
    version: PROFESSOR_REQUIREMENT_CANDIDATE_V4_17_V1_VERSION as const,
    requirementId: args.requirement.requirementId,
    oracleId: args.candidate.oracleId,
    cardName: args.candidate.name,
    requirementEligible: false,
    satisfiedFunctions: [] as RequirementFunctionV417[],
    unsatisfiedRequiredFunctions: [...args.requirement.requiredFunctions],
    hardConstraintPass: false,
    missionFit: 0,
    manaEfficiency: 0,
    reliability: 0,
    bracketQuality: 0,
    commanderSynergy: 0,
    independentValue: 0,
    roleCompression: 0,
    finalRequirementScore: 0,
    accepted: false,
    rejectionReason: "REQUIREMENT_INELIGIBLE" as string | null,
    functionalMatchType: "NONE" as FunctionalMatchType,
    semanticEvidence: [] as string[],
    rolePrecision: "FALSE_POSITIVE" as RoleMatchPrecisionV417,
  };

  if (!cardTruthAllowsIntelligenceParticipation(truth)) {
    return { ...base, rejectionReason: "UNRESOLVED_ORACLE" };
  }
  if (!cardLegalInCommanderColorIdentity({ card: truth, commanderColorIdentity: args.commanderColorIdentity })) {
    return { ...base, rejectionReason: "OFF_COLOR" };
  }

  const functionalMatch = evaluateFunctionalMatch({
    requirementId: args.requirement.requirementId,
    requirementToken: args.compiledQuery.functionalMatchToken,
    candidateOracleId: args.candidate.oracleId,
    oracleText: truth.oracleText,
    typeLine: truth.typeLine,
  });

  const satisfiedFunctions = args.requirement.requiredFunctions.filter((fn) =>
    satisfiesRequiredFunction(fn, functionalMatch.matchType, functionalMatch.mechanism),
  );
  const unsatisfiedRequiredFunctions = args.requirement.requiredFunctions.filter(
    (fn) => !satisfiedFunctions.includes(fn),
  );
  const requirementEligibleBase = unsatisfiedRequiredFunctions.length === 0 && ELIGIBLE_MATCH_TYPES.has(functionalMatch.matchType);
  const rolePrecision = evaluateSemanticRolePrecision({
    requirement: args.requirement,
    oracleText: truth.oracleText,
    typeLine: truth.typeLine,
    cardName: args.candidate.name,
  });
  const roleBlocksEligibility =
    (args.requirement.family === "PROTECTION" || args.requirement.requiredFunctions.includes("PROTECTION")) &&
    rolePrecision === "FALSE_POSITIVE";
  const requirementEligible = requirementEligibleBase && !roleBlocksEligibility;

  if (!requirementEligible) {
    return {
      ...base,
      functionalMatchType: functionalMatch.matchType,
      semanticEvidence: functionalMatch.evidenceRefs,
      unsatisfiedRequiredFunctions,
      rolePrecision,
      rejectionReason: roleBlocksEligibility
        ? "ROLE_FALSE_POSITIVE"
        : functionalMatch.matchType === "NONE"
          ? "REQUIREMENT_INELIGIBLE"
          : `WRONG_FUNCTION:${functionalMatch.mechanism}`,
    };
  }

  const missionFit = Math.round(matchTypeScore(functionalMatch.matchType) * 100);
  const manaEfficiency = bracketEfficiencyScore(truth.manaValue, args.requirement.bracketQualityContract);
  const caps = extractCardFunctionalCapabilities(truth.oracleText, truth.typeLine);
  const reliability =
    functionalMatch.repeatability === "single" ? 80 : functionalMatch.repeatability === "limited" ? 65 : 70;
  const bracketQuality = familyBracketQualityScore({
    contract: args.requirement.requirementBracketContract,
    manaEfficiency,
    reliability,
    missionFit,
  });
  const commanderSynergy = args.requirement.softPreferences.some((p) => /commander|synergy/i.test(p)) ? 70 : 55;
  const independentValue = /instant|sorcery/.test(truth.typeLine.toLowerCase()) ? 75 : 60;
  const verifiedRoles = detectVerifiedFunctionsForCard({
    oracleText: truth.oracleText,
    typeLine: truth.typeLine,
    oracleId: truth.oracleId,
  });
  const roleCompression = verifiedRoles.length >= 2 ? 85 : verifiedRoles.length === 1 ? 55 : 40;

  const weights = familyScoreWeights(args.requirement.family);
  const interactionBonus = interactionQualityBonus({
    typeLine: truth.typeLine,
    oracleText: truth.oracleText,
    manaValue: truth.manaValue,
    requirement: args.requirement,
  });
  const finalRequirementScore = Math.round(
    missionFit * weights.missionFit +
      manaEfficiency * weights.manaEfficiency +
      reliability * weights.reliability +
      bracketQuality * weights.bracketQuality +
      interactionBonus,
  );

  return {
    ...base,
    requirementEligible: true,
    satisfiedFunctions: satisfiedFunctions.length ? satisfiedFunctions : args.requirement.requiredFunctions,
    unsatisfiedRequiredFunctions: [],
    hardConstraintPass: true,
    missionFit,
    manaEfficiency,
    reliability,
    bracketQuality,
    commanderSynergy,
    independentValue,
    roleCompression,
    finalRequirementScore,
    accepted: false,
    rejectionReason: null,
    functionalMatchType: functionalMatch.matchType,
    semanticEvidence: [...functionalMatch.evidenceRefs, ...verifiedRoles.map((f) => `verified:${f}`), `role:${rolePrecision}`],
    rolePrecision,
  };
}

export function rankEligibleCandidatesForRequirementV417(
  evaluations: RequirementCandidateEvaluationV417[],
): RequirementCandidateEvaluationV417[] {
  return [...evaluations]
    .filter((e) => e.requirementEligible)
    .sort(
      (a, b) =>
        b.finalRequirementScore - a.finalRequirementScore ||
        b.manaEfficiency - a.manaEfficiency ||
        b.missionFit - a.missionFit ||
        a.cardName.localeCompare(b.cardName),
    )
    .map((e, idx) => ({
      ...e,
      accepted: idx === 0,
    }));
}

export function topEligibleCandidateV417(
  evaluations: RequirementCandidateEvaluationV417[],
): RequirementCandidateEvaluationV417 | null {
  const ranked = rankEligibleCandidatesForRequirementV417(evaluations);
  return ranked[0] ?? null;
}
