/**
 * Professor v4.17 — materialize open requirements from Sol blueprint + strategy.
 */
import type {
  BrewBlueprintV417,
  BrewRequirementV417,
  RequirementCoverageModeV417,
  RequirementFamilyV417,
  RequirementFunctionV417,
  RequirementHardConstraintV417,
  RequirementPreferredQualityV417,
  RequirementSharePolicyV417,
} from "./professor-brew-blueprint-v4-17-v1";
import { bracketQualityContractV417 } from "./professor-brew-blueprint-v4-17-v1";
import { requirementBracketContractV417 } from "./professor-requirement-bracket-v4-17-v1";
import type { SolBlueprintProposalV417 } from "./professor-sol-blueprint-proposal-v4-17-v1";
import {
  normalizeSolConceptsV417,
  supportedFunctionsFromConcepts,
} from "./professor-semantic-concept-normalizer-v4-17-v1";

export const PROFESSOR_REQUIREMENT_MATERIALIZER_V4_17_V1_VERSION = "professor-requirement-materializer-v4-17-v1";

const PRIORITY = {
  CORE_PACKAGE: 100,
  WIN_ARCHITECTURE: 95,
  PRIMARY_ENGINE: 90,
  BRACKET_INFRA: 85,
  PROTECTION_ACCESS: 80,
  REDUNDANCY: 70,
  FLEX: 50,
} as const;

function familyFromFunction(fn: RequirementFunctionV417): RequirementFamilyV417 {
  if (fn === "GRAVEYARD_ENABLER") return "GRAVEYARD_ENABLER";
  if (fn === "RETURN_FROM_GRAVEYARD") return "RETURN_FROM_GRAVEYARD";
  if (fn === "ENGINE") return "ENGINE_ENABLER";
  if (fn === "WIN_SUPPORT") return "WIN_COMPONENT";
  return fn as RequirementFamilyV417;
}

function defaultHardRequirements(family: RequirementFamilyV417): RequirementHardConstraintV417[] {
  return [
    { constraintId: "legal", description: "Legal in commander color identity" },
    { constraintId: "function", description: `Satisfies ${family} semantic function`, semanticToken: functionalTokenForFamily(family) },
  ];
}

function defaultPreferred(family: RequirementFamilyV417, bracket: number): RequirementPreferredQualityV417[] {
  const base: RequirementPreferredQualityV417[] = [
    { qualityId: "efficiency", description: "inexpensive", weight: bracket >= 4 ? 0.9 : 0.5 },
    { qualityId: "flexibility", description: "flexible / instant speed where relevant", weight: 0.7 },
    { qualityId: "compression", description: "role compression", weight: 0.6 },
    { qualityId: "independence", description: "independent usefulness", weight: 0.65 },
  ];
  if (family === "INTERACTION") {
    base.push({ qualityId: "timing", description: "instant-speed interaction", weight: bracket >= 4 ? 0.95 : 0.7 });
  }
  return base;
}

export function functionalTokenForFamily(family: RequirementFamilyV417): string {
  switch (family) {
    case "RETURN_FROM_GRAVEYARD":
      return "reanimation";
    case "GRAVEYARD_ENABLER":
      return "graveyard_setup";
    case "ACCELERATION":
      return "ramp";
    case "CARD_VELOCITY":
      return "card_draw";
    case "INTERACTION":
      return "interaction";
    case "PROTECTION":
      return "protection";
    case "ACCESS":
      return "access_tutor";
    case "WIN_COMPONENT":
      return "win_component";
    case "ENGINE_ENABLER":
      return "engine_enabler";
    case "ENGINE_PAYOFF":
      return "engine_payoff";
    case "RESOURCE_PRODUCTION":
      return "token";
    case "RESOURCE_CONSUMER":
      return "sacrifice";
    case "RECOVERY":
      return "recovery";
    default:
      return family.toLowerCase();
  }
}

function specializeInteractionRequirement(args: {
  colors: string[];
  weaknesses: string[];
  bracket: number;
}): { purpose: string; mechanics: string[]; prefs: string[] } {
  const prefs = ["instant speed", "role compression", "independent usefulness"];
  if (args.weaknesses.some((w) => /graveyard hate|exile/i.test(w))) {
    return {
      purpose: "graveyard interaction — exile hate / grave hate answers",
      mechanics: ["EXILE_GY", "DESTROY_ENCHANTMENT"],
      prefs: [...prefs, "graveyard hate"],
    };
  }
  if (args.colors.includes("U")) {
    return {
      purpose: "efficient stack interaction",
      mechanics: ["COUNTER_SPELL", "BOUNCE", "DRAW"],
      prefs: [...prefs, "countermagic"],
    };
  }
  return {
    purpose: "efficient creature removal",
    mechanics: ["DESTROY_CREATURE", "EXILE_CREATURE"],
    prefs,
  };
}

function buildRequirement(args: {
  requirementId: string;
  blueprintRevisionId?: number;
  family: RequirementFamilyV417;
  purpose: string;
  priority: number;
  packageIds: string[];
  packageGroupId?: string;
  requiredFunctions: RequirementFunctionV417[];
  requiredMechanics?: string[];
  bracket: number;
  slots?: { min: number; preferred: number; max: number };
  coverageMode?: RequirementCoverageModeV417;
  sharePolicy?: RequirementSharePolicyV417;
  accessTargetClass?: string;
  softPreferences?: string[];
}): BrewRequirementV417 {
  const coverageMode = args.coverageMode ?? "FUNCTIONAL_COVERAGE";
  const sharePolicy = args.sharePolicy ?? (args.packageIds.length ? "PACKAGE_SHAREABLE" : "GLOBAL_SHAREABLE");
  const defaultSlots =
    coverageMode === "FUNCTIONAL_COVERAGE"
      ? { min: 0, preferred: 1, max: 2 }
      : coverageMode === "DISTINCT_PHYSICAL_CARD"
        ? { min: 1, preferred: 1, max: 2 }
        : { min: 1, preferred: 1, max: 2 };
  const slots = args.slots ?? defaultSlots;
  const physicalSlots =
    coverageMode === "FUNCTIONAL_COVERAGE"
      ? { min: 0, preferred: slots.preferred, max: slots.max }
      : slots;
  const soft = args.softPreferences ?? defaultPreferred(args.family, args.bracket).map((p) => p.description);
  return {
    requirementId: args.requirementId,
    blueprintRevisionId: args.blueprintRevisionId ?? 0,
    family: args.family,
    purpose: args.purpose,
    priority: args.priority,
    coverageMode,
    sharePolicy,
    physicalSlotsNeeded: physicalSlots,
    requiredFunctions: args.requiredFunctions,
    requiredMechanics: args.requiredMechanics ?? [],
    hardRequirements: defaultHardRequirements(args.family),
    preferredRequirements: defaultPreferred(args.family, args.bracket),
    acceptableFunctionalAlternatives: [],
    hardConstraints: ["legal_in_color_identity"],
    softPreferences: soft,
    packageIds: args.packageIds,
    packageGroupId: args.packageGroupId,
    bracketQualityContract: bracketQualityContractV417(args.bracket),
    requirementBracketContract: requirementBracketContractV417(args.family, args.bracket),
    accessTargetClass: args.accessTargetClass,
    currentCoverage: 0,
    targetCoverage: slots.preferred,
    selectedCardIds: [],
    status: "OPEN",
  };
}

export function materializeRequirementsFromBlueprintV417(args: {
  proposal: SolBlueprintProposalV417;
  commanderColorIdentity: string[];
  requestedBracket: number;
  selectedCards?: BrewBlueprintV417["selectedCards"];
}): BrewRequirementV417[] {
  const bracket = args.requestedBracket;
  const normalized = normalizeSolConceptsV417(args.proposal.strategicConcepts);
  const conceptFunctions = supportedFunctionsFromConcepts(normalized);
  const requirements: BrewRequirementV417[] = [];
  const selectedCoverage = new Map<string, number>();
  for (const card of args.selectedCards ?? []) {
    for (const fn of card.satisfiedFunctions) {
      selectedCoverage.set(fn, (selectedCoverage.get(fn) ?? 0) + 1);
    }
  }

  for (const pkg of args.proposal.packages) {
    const pkgPriority = pkg.core ? PRIORITY.CORE_PACKAGE : PRIORITY.REDUNDANCY;
    for (const group of pkg.requirementGroups) {
      const groupPriority = group.mandatory ? pkgPriority : PRIORITY.REDUNDANCY;
      for (const reqId of group.relatedRequirementIds) {
        const fn = inferFunctionFromGroupName(group.name, pkg.requiredFunctions);
        const family = familyFromFunction(fn);
        const existing = selectedCoverage.get(fn) ?? 0;
        if (existing >= group.preferredPhysicalSlots) continue;
        requirements.push(
          buildRequirement({
            requirementId: reqId,
            family,
            purpose: `${group.name} for ${pkg.name}`,
            priority: groupPriority,
            packageIds: [pkg.packageId],
            packageGroupId: group.groupId,
            requiredFunctions: [fn],
            requiredMechanics: mechanicsForFamily(family, args.commanderColorIdentity, args.proposal.weaknesses),
            bracket,
            coverageMode: "FUNCTIONAL_COVERAGE",
            sharePolicy: "PACKAGE_SHAREABLE",
            softPreferences: args.proposal.bracketConstructionGuidance,
          }),
        );
      }
    }
    for (const fn of pkg.requiredFunctions) {
      if (requirements.some((r) => r.packageIds.includes(pkg.packageId) && r.requiredFunctions.includes(fn))) continue;
      const family = familyFromFunction(fn);
      const existing = selectedCoverage.get(fn) ?? 0;
      if (existing >= 1) continue;
      requirements.push(
        buildRequirement({
          requirementId: `${pkg.packageId}-${fn.toLowerCase()}`,
          family,
          purpose: `${fn} support for ${pkg.name}`,
          priority: pkgPriority,
          packageIds: [pkg.packageId],
          requiredFunctions: [fn],
          requiredMechanics: mechanicsForFamily(family, args.commanderColorIdentity, args.proposal.weaknesses),
          bracket,
          coverageMode: "FUNCTIONAL_COVERAGE",
          sharePolicy: "PACKAGE_SHAREABLE",
          softPreferences: args.proposal.bracketConstructionGuidance,
        }),
      );
    }
  }

  for (const win of args.proposal.winArchitecture) {
    for (const fn of win.requiredFunctions) {
      const family = fn === "WIN_SUPPORT" ? "WIN_COMPONENT" : familyFromFunction(fn as RequirementFunctionV417);
      if (requirements.some((r) => r.family === family && r.priority >= PRIORITY.WIN_ARCHITECTURE)) continue;
      requirements.push(
        buildRequirement({
          requirementId: `win-${win.planId}-${family.toLowerCase()}`,
          family,
          purpose: `Win component: ${win.plan}`,
          priority: PRIORITY.WIN_ARCHITECTURE,
          packageIds: [],
          requiredFunctions: [family === "WIN_COMPONENT" ? "WIN_COMPONENT" : (fn as RequirementFunctionV417)],
          bracket,
          coverageMode: "FUNCTIONAL_COVERAGE",
          sharePolicy: "GLOBAL_SHAREABLE",
        }),
      );
    }
  }

  if (args.proposal.accessNeeds.length) {
    requirements.push(
      buildRequirement({
        requirementId: "infra-access-primary",
        family: "ACCESS",
        purpose: `Access: ${args.proposal.accessNeeds[0]}`,
        priority: PRIORITY.PROTECTION_ACCESS,
        packageIds: [],
        requiredFunctions: ["ACCESS"],
        requiredMechanics: ["TUTOR", "SEARCH"],
        bracket,
        coverageMode: "FUNCTIONAL_COVERAGE",
        sharePolicy: "GLOBAL_SHAREABLE",
        accessTargetClass: args.proposal.accessNeeds[0],
      }),
    );
  }

  if (args.proposal.protectionNeeds.length) {
    requirements.push(
      buildRequirement({
        requirementId: "infra-protection-primary",
        family: "PROTECTION",
        purpose: `Protection: ${args.proposal.protectionNeeds[0]}`,
        priority: PRIORITY.PROTECTION_ACCESS,
        packageIds: [],
        requiredFunctions: ["PROTECTION"],
        bracket,
        coverageMode: "FUNCTIONAL_COVERAGE",
        sharePolicy: "GLOBAL_SHAREABLE",
      }),
    );
  }

  for (const fn of conceptFunctions) {
    const family = familyFromFunction(fn);
    if (requirements.some((r) => r.requiredFunctions.includes(fn))) continue;
    if (["ACCESS", "PROTECTION"].includes(family)) continue;
    requirements.push(
      buildRequirement({
        requirementId: `concept-${fn.toLowerCase()}`,
        family,
        purpose: `Strategy concept: ${fn}`,
        priority: PRIORITY.PRIMARY_ENGINE,
        packageIds: [],
        requiredFunctions: [fn],
        requiredMechanics: mechanicsForFamily(family, args.commanderColorIdentity, args.proposal.weaknesses),
        bracket,
        coverageMode: "FUNCTIONAL_COVERAGE",
        sharePolicy: "GLOBAL_SHAREABLE",
      }),
    );
  }

  const interactionSpec = specializeInteractionRequirement({
    colors: args.commanderColorIdentity,
    weaknesses: args.proposal.weaknesses,
    bracket,
  });
  if (!requirements.some((r) => r.family === "INTERACTION")) {
    requirements.push(
      buildRequirement({
        requirementId: "infra-interaction-primary",
        family: "INTERACTION",
        purpose: interactionSpec.purpose,
        priority: PRIORITY.BRACKET_INFRA,
        packageIds: [],
        requiredFunctions: ["INTERACTION"],
        requiredMechanics: interactionSpec.mechanics,
        bracket,
        coverageMode: "FUNCTIONAL_COVERAGE",
        sharePolicy: "GLOBAL_SHAREABLE",
        softPreferences: interactionSpec.prefs,
      }),
    );
  }

  if (!requirements.some((r) => r.family === "ACCELERATION")) {
    requirements.push(
      buildRequirement({
        requirementId: "infra-acceleration-primary",
        family: "ACCELERATION",
        purpose: "mana acceleration for deployment curve",
        priority: PRIORITY.BRACKET_INFRA,
        packageIds: [],
        requiredFunctions: ["ACCELERATION"],
        bracket,
        coverageMode: "FUNCTIONAL_COVERAGE",
        sharePolicy: "GLOBAL_SHAREABLE",
      }),
    );
  }

  return requirements
    .filter((r) => r.physicalSlotsNeeded.preferred > 0 || r.status === "OPEN")
    .sort((a, b) => b.priority - a.priority || a.requirementId.localeCompare(b.requirementId));
}

function inferFunctionFromGroupName(name: string, pkgFunctions: RequirementFunctionV417[]): RequirementFunctionV417 {
  const lower = name.toLowerCase();
  if (/recurs|reanim|return/.test(lower)) return "RETURN_FROM_GRAVEYARD";
  if (/setup|enabler|surveil|mill/.test(lower)) return "GRAVEYARD_ENABLER";
  if (/payoff|finisher|win/.test(lower)) return "ENGINE_PAYOFF";
  if (/draw|velocity|filter/.test(lower)) return "CARD_VELOCITY";
  if (/protect/.test(lower)) return "PROTECTION";
  if (/access|tutor/.test(lower)) return "ACCESS";
  return pkgFunctions[0] ?? "ENGINE_ENABLER";
}

function mechanicsForFamily(
  family: RequirementFamilyV417,
  colors: string[],
  weaknesses: string[],
): string[] {
  if (family === "INTERACTION") {
    return specializeInteractionRequirement({ colors, weaknesses, bracket: 4 }).mechanics;
  }
  if (family === "RETURN_FROM_GRAVEYARD") return ["GRAVEYARD → BATTLEFIELD"];
  if (family === "GRAVEYARD_ENABLER") return ["LIBRARY → GRAVEYARD"];
  if (family === "ACCELERATION") return ["MANA_RAMP"];
  if (family === "ACCESS") return ["TUTOR", "SEARCH"];
  if (family === "PROTECTION") return ["HEXPROOF", "INDESTRUCTIBLE"];
  if (family === "WIN_COMPONENT") return ["WIN_LINE"];
  return [];
}

export function shrinkRequirementsAfterRoleCompressionV417(
  requirements: BrewRequirementV417[],
  selectedCards: BrewBlueprintV417["selectedCards"],
): BrewRequirementV417[] {
  const globalFnCoverage = new Map<string, number>();
  for (const card of selectedCards) {
    for (const fn of [
      ...new Set([card.primaryFunction, ...card.secondaryFunctions, ...card.tertiaryFunctions, ...card.satisfiedFunctions]),
    ]) {
      globalFnCoverage.set(fn, (globalFnCoverage.get(fn) ?? 0) + 1);
    }
  }

  return requirements
    .map((req) => {
      if (req.status === "SATISFIED" || req.status === "REVISE") return req;
      if (req.family === "PACKAGE_DENSITY" || req.family === "FUNCTIONAL_DENSITY") return req;

      const fn = req.requiredFunctions[0];
      const assigned = req.selectedCardIds.length;
      let preferred = req.physicalSlotsNeeded.preferred;

      if (req.coverageMode === "FUNCTIONAL_COVERAGE" && fn) {
        const globalPool = globalFnCoverage.get(fn) ?? 0;
        if (globalPool > assigned) {
          preferred = Math.max(req.physicalSlotsNeeded.min, preferred - (globalPool - assigned));
        }
      }

      let status: BrewRequirementV417["status"] = req.status;
      if (assigned >= preferred && assigned > 0) status = "SATISFIED";
      else if (assigned >= req.physicalSlotsNeeded.min && assigned > 0) status = "PARTIAL";
      else if (assigned > 0) status = "PARTIAL";
      else status = "OPEN";

      return {
        ...req,
        physicalSlotsNeeded: {
          ...req.physicalSlotsNeeded,
          preferred,
          min: Math.min(req.physicalSlotsNeeded.min, preferred),
        },
        currentCoverage: assigned,
        status,
      };
    })
    .filter((r) => r.status !== "SATISFIED" || r.packageIds.length > 0 || r.family === "PACKAGE_DENSITY" || r.family === "FUNCTIONAL_DENSITY");
}
