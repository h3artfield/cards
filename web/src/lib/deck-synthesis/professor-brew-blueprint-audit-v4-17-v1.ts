/**
 * Professor v4.17 Slice 5 — deterministic pre-critic audits.
 */
import type { BrewBlueprintV417 } from "./professor-brew-blueprint-v4-17-v1";
import { isLegal99V417, libraryCountV417 } from "./professor-brew-blueprint-mana-v4-17-v1";
import { winArchitectureVerifiedV417 } from "./professor-brew-blueprint-win-progress-v4-17-v1";
import type { PreCriticDeckV417 } from "./professor-blueprint-assembly-types-v4-17-v1";

export const PROFESSOR_BREW_BLUEPRINT_AUDIT_V4_17_V1_VERSION = "professor-brew-blueprint-audit-v4-17-v1";

export type BlueprintDeterministicAuditV417 = {
  version: typeof PROFESSOR_BREW_BLUEPRINT_AUDIT_V4_17_V1_VERSION;
  legality: { pass: boolean; orphanCards: string[]; duplicateSingletons: string[]; offColor: string[] };
  packageSatisfaction: { pass: boolean; coreUnsatisfied: string[] };
  physicalAccounting: { pass: boolean; selectedNonlands: number; expectedNonlands: number; selectedLands: number; expectedLands: number };
  functionalCoverage: { pass: boolean; deficits: string[] };
  accessArchitecture: { pass: boolean; notes: string[] };
  winArchitecture: { pass: boolean; status: string[] };
  bracketArchitecture: { pass: boolean; notes: string[] };
  mana: { pass: boolean; landCount: number; target: number };
  interactionQuality: { pass: boolean; count: number };
  accelerationQuality: { pass: boolean; count: number };
  protection: { pass: boolean; count: number };
  recovery: { pass: boolean; count: number };
  deadCardRate: { pass: boolean; orphanRate: number };
  overallPass: boolean;
  violations: string[];
};

export function freezePreCriticDeckV417(blueprint: BrewBlueprintV417): PreCriticDeckV417 {
  return {
    commanderOracleId: blueprint.commander.oracleId,
    nonlandOracleIds: blueprint.selectedCards.map((c) => c.oracleId),
    landOracleIds: blueprint.manaPlan.selectedLands.map((name) => `land:${name}`),
    libraryOracleIds: [
      ...blueprint.selectedCards.map((c) => c.oracleId),
      ...blueprint.manaPlan.selectedLands.map((name) => `land:${name}`),
    ],
  };
}

export function runDeterministicAuditsV417(blueprint: BrewBlueprintV417): BlueprintDeterministicAuditV417 {
  const orphanCards = blueprint.selectedCards.filter((c) => !c.primaryRequirementId).map((c) => c.name);
  const oracleIds = blueprint.selectedCards.map((c) => c.oracleId);
  const duplicateSingletons = oracleIds.filter((id, idx) => oracleIds.indexOf(id) !== idx);
  const coreUnsatisfied = blueprint.packages.filter((p) => p.core && p.status !== "SATISFIED").map((p) => p.packageId);

  const fnCount = (fn: string) =>
    blueprint.selectedCards.filter((c) => c.satisfiedFunctions.includes(fn as never)).length;

  const interactionCount = fnCount("INTERACTION");
  const accelerationCount = fnCount("ACCELERATION");
  const protectionCount = fnCount("PROTECTION");
  const recoveryCount = fnCount("RECOVERY");
  const accessCount = fnCount("ACCESS");

  const bracket = blueprint.userIntent.bracket;
  const functionalDeficits = blueprint.functionalBudgets
    .filter((b) => b.functionalCoverageSelected < b.minimum)
    .map((b) => `${b.category}:${b.functionalCoverageSelected}/${b.minimum}`);

  const orphanRate = blueprint.selectedCards.length
    ? orphanCards.length / blueprint.selectedCards.length
    : 0;

  const legalityPass = orphanCards.length === 0 && duplicateSingletons.length === 0;
  const packagePass = coreUnsatisfied.length === 0;
  const physicalPass =
    blueprint.physicalSlotBudget.selectedNonlands === blueprint.physicalSlotBudget.expectedNonlands &&
    blueprint.manaPlan.selectedLands.length >= blueprint.manaPlan.landTarget - 2;
  const winPass = winArchitectureVerifiedV417(blueprint) || blueprint.winArchitecture.some((w) => w.status === "PARTIAL");
  const manaPass = isLegal99V417(blueprint) || libraryCountV417(blueprint) >= 98;

  const violations: string[] = [];
  if (!legalityPass) violations.push("LEGALITY");
  if (!packagePass) violations.push("CORE_PACKAGES");
  if (!physicalPass) violations.push("PHYSICAL_ACCOUNTING");
  if (functionalDeficits.length) violations.push("FUNCTIONAL_COVERAGE");
  if (!winPass) violations.push("WIN_ARCHITECTURE");
  if (!manaPass) violations.push("MANA");

  return {
    version: PROFESSOR_BREW_BLUEPRINT_AUDIT_V4_17_V1_VERSION,
    legality: { pass: legalityPass, orphanCards, duplicateSingletons, offColor: [] },
    packageSatisfaction: { pass: packagePass, coreUnsatisfied },
    physicalAccounting: {
      pass: physicalPass,
      selectedNonlands: blueprint.physicalSlotBudget.selectedNonlands,
      expectedNonlands: blueprint.physicalSlotBudget.expectedNonlands,
      selectedLands: blueprint.manaPlan.selectedLands.length,
      expectedLands: blueprint.manaPlan.landTarget,
    },
    functionalCoverage: { pass: functionalDeficits.length === 0, deficits: functionalDeficits },
    accessArchitecture: {
      pass: accessCount >= (bracket >= 4 ? 3 : 1),
      notes: accessCount < (bracket >= 4 ? 3 : 1) ? ["ACCESS_BELOW_BRACKET_EXPECTATION"] : [],
    },
    winArchitecture: {
      pass: winPass,
      status: blueprint.winArchitecture.map((w) => `${w.planId}:${w.status}`),
    },
    bracketArchitecture: {
      pass: interactionCount >= (bracket >= 4 ? 6 : 3),
      notes: [],
    },
    mana: { pass: manaPass, landCount: blueprint.manaPlan.selectedLands.length, target: blueprint.manaPlan.landTarget },
    interactionQuality: { pass: interactionCount >= (bracket >= 4 ? 6 : 3), count: interactionCount },
    accelerationQuality: { pass: accelerationCount >= (bracket >= 4 ? 8 : 5), count: accelerationCount },
    protection: { pass: protectionCount >= 2, count: protectionCount },
    recovery: { pass: recoveryCount >= 1, count: recoveryCount },
    deadCardRate: { pass: orphanRate === 0, orphanRate },
    overallPass: violations.length === 0,
    violations,
  };
}

export type CriticFindingV417 = {
  severity: "LOW" | "MEDIUM" | "HIGH";
  category: string;
  message: string;
  requirementId?: string;
  cardName?: string;
};

export function runBlueprintCriticV417(blueprint: BrewBlueprintV417, audits: BlueprintDeterministicAuditV417): CriticFindingV417[] {
  const findings: CriticFindingV417[] = [];

  for (const req of blueprint.openRequirements) {
    if (req.status === "SATISFIED" && req.selectedCardIds.length > req.physicalSlotsNeeded.preferred + 1) {
      findings.push({
        severity: "MEDIUM",
        category: "OVERFILLED",
        message: `Requirement ${req.requirementId} exceeds preferred coverage`,
        requirementId: req.requirementId,
      });
    }
  }

  if (!audits.interactionQuality.pass) {
    findings.push({
      severity: "HIGH",
      category: "INTERACTION",
      message: `Interaction count ${audits.interactionQuality.count} below bracket expectation`,
    });
  }

  if (!audits.winArchitecture.pass) {
    findings.push({
      severity: "HIGH",
      category: "WIN",
      message: "Win architecture not verified or partially realized",
    });
  }

  const weakest = [...blueprint.selectedCards].slice(-3);
  for (const card of weakest) {
    findings.push({
      severity: "LOW",
      category: "WEAKEST_RELATIVE",
      message: `Late-pick ${card.name} may be weaker relative to assigned job ${card.primaryRequirementId}`,
      cardName: card.name,
      requirementId: card.primaryRequirementId,
    });
  }

  return findings;
}
