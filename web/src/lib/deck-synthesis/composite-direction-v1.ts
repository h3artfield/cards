/**
 * COMPOSITE_DIRECTION — Phase 5.4.1 compositional merge layer.
 * Requires >=2 independently defensible anchors with cross-support evidence.
 */
import type {
  CompositeCrossSupportEdge,
  CompositeDirectionComposition,
  DirectionAnchor,
  RetrievalSpecification,
} from "./archetype-discovery-types-v1";
import type { CommanderCausalRoleProfile } from "./commander-causal-roles-v1";
import { buildRetrievalSpecification, computeRetrievalSpecificationCompleteness } from "./direction-anchor-v1";
import type { CommanderMechanicalProfile } from "./archetype-discovery-types-v1";
import type { ExtractedMotif } from "./mechanical-motifs-v1";

function pushUnique(arr: string[], value: string): void {
  if (!arr.includes(value)) arr.push(value);
}

const CENTRAL_ANCHOR_KINDS = new Set([
  "ACTIVATED_ACTION",
  "EVENT_TRIGGER",
  "PERMISSION",
  "STATIC_INCENTIVE",
  "STATE_DEPENDENCY",
]);

function isIndependentlyCentral(anchor: DirectionAnchor): boolean {
  if (!CENTRAL_ANCHOR_KINDS.has(anchor.anchorKind)) return false;
  if (anchor.mechanism === "OUTPUT_MULTIPLIER") return true;
  if (anchor.evidenceRefs.length === 0) return false;
  return anchor.anchorKind !== "EVENT_TRIGGER" || anchor.mechanism !== "COMBAT_BUFF";
}

type CrossSupportRule = {
  from: string;
  to: string;
  relationship: CompositeCrossSupportEdge["relationship"];
  note: string;
};

const CROSS_SUPPORT_RULES: CrossSupportRule[] = [
  {
    from: "LAND_DEVELOPMENT",
    to: "CAST_FROM_EXILE",
    relationship: "enables",
    note: "Mana development feeds high-cost free casting",
  },
  {
    from: "LAND_DEVELOPMENT",
    to: "MANA_GENERATION",
    relationship: "feeds",
    note: "Land ramp supports repeatable mana engines",
  },
  {
    from: "TOKEN_GENERATION",
    to: "COPY",
    relationship: "feeds",
    note: "Token board enables copy multiplication",
  },
  {
    from: "TOKEN_GENERATION",
    to: "OUTPUT_MULTIPLIER",
    relationship: "reinforces",
    note: "Repeatable token production amplified by multiplier",
  },
  {
    from: "COUNTER_PLACEMENT",
    to: "MANA_GENERATION",
    relationship: "converts",
    note: "Counter stock converts to mana",
  },
  {
    from: "ETB_TRIGGER",
    to: "CAST_FROM_EXILE",
    relationship: "enables",
    note: "Development triggers support impulse casting",
  },
  {
    from: "DRAW_ENGINE",
    to: "CAST_FROM_EXILE",
    relationship: "feeds",
    note: "Card flow supports cheat-cast plans",
  },
  {
    from: "SACRIFICE_ENGINE",
    to: "TOKEN_GENERATION",
    relationship: "feeds",
    note: "Sacrifice outlets leverage token fodder",
  },
  {
    from: "STATE_ATTRITION",
    to: "MARKED_DEATH_PAYOFF",
    relationship: "feeds",
    note: "State markers enable death-payoff conversion",
  },
  {
    from: "MARKED_DEATH_PAYOFF",
    to: "DRAW_ENGINE",
    relationship: "converts",
    note: "Death-generated tokens feed sacrifice/card advantage",
  },
  {
    from: "SCRY_TRIGGER",
    to: "SCRY",
    relationship: "feeds",
    note: "Scry payoffs require repeatable scry sources",
  },
  {
    from: "COUNTER_STOCK",
    to: "CREATURE_REMOVAL",
    relationship: "converts",
    note: "Commander counter stock fuels modular activated outputs",
  },
  {
    from: "TUTOR_CHEAT",
    to: "CREATURE_CHEAT",
    relationship: "reinforces",
    note: "Toolbox tutor cheat defines creature access plan",
  },
];

function detectCrossSupport(a: DirectionAnchor, b: DirectionAnchor): CompositeCrossSupportEdge | null {
  for (const rule of CROSS_SUPPORT_RULES) {
    if (
      (a.mechanism === rule.from && b.mechanism === rule.to) ||
      (b.mechanism === rule.from && a.mechanism === rule.to)
    ) {
      return {
        fromAnchorId: a.mechanism === rule.from ? a.anchorId : b.anchorId,
        toAnchorId: a.mechanism === rule.to ? a.anchorId : b.anchorId,
        relationship: rule.relationship,
        note: rule.note,
      };
    }
  }
  if (a.anchorKind === "ACTIVATED_ACTION" && b.anchorKind === "ACTIVATED_ACTION" && a.mechanism !== b.mechanism) {
    return {
      fromAnchorId: a.anchorId,
      toAnchorId: b.anchorId,
      relationship: "reinforces",
      note: "Multiple central activated abilities define composite plan",
    };
  }
  return null;
}

function mergeStringArraysSemantic(buckets: string[][]): { shared: string[]; componentSpecific: string[] } {
  if (buckets.length === 0) return { shared: [], componentSpecific: [] };
  const counts = new Map<string, number>();
  for (const bucket of buckets) {
    for (const item of bucket) counts.set(item, (counts.get(item) ?? 0) + 1);
  }
  const shared: string[] = [];
  const componentSpecific: string[] = [];
  for (const [item, count] of counts) {
    if (count >= 2) shared.push(item);
    else componentSpecific.push(item);
  }
  return { shared, componentSpecific };
}

export function mergeRetrievalSpecificationsSemantic(input: {
  componentSpecs: RetrievalSpecification[];
  composition: Pick<
    CompositeDirectionComposition,
    "sharedRequirements" | "complementaryRequirements" | "sharedOutputs" | "crossSupportEdges"
  >;
}): RetrievalSpecification {
  const base = input.componentSpecs[0];
  if (!base) {
    return {
      requiredFunctions: [],
      desiredFunctions: [],
      requiredInputs: [],
      outputsToExploit: [],
      resourcesToProduce: [],
      resourcesToConsume: [],
      statesToMaintain: [],
      statesToIncrease: [],
      relevantCardTypes: [],
      relevantZones: [],
      protectionNeeds: [],
      redundancyNeeds: [],
      structuralNeeds: [],
      avoidFunctions: [],
      avoidCardClasses: [],
      selfPenaltyConditions: [],
      constructionConstraints: [],
    };
  }

  const merged: RetrievalSpecification = {
    requiredFunctions: [...base.requiredFunctions],
    desiredFunctions: [],
    requiredInputs: [...input.composition.sharedRequirements],
    outputsToExploit: [...input.composition.sharedOutputs],
    resourcesToProduce: [],
    resourcesToConsume: [],
    statesToMaintain: [],
    statesToIncrease: [],
    relevantCardTypes: [],
    relevantZones: [],
    protectionNeeds: [],
    redundancyNeeds: [],
    structuralNeeds: [],
    avoidFunctions: [],
    avoidCardClasses: [],
    selfPenaltyConditions: [...base.selfPenaltyConditions],
    constructionConstraints: [...base.constructionConstraints],
  };

  const reqInputs = mergeStringArraysSemantic(input.componentSpecs.map((s) => s.requiredInputs));
  for (const r of reqInputs.shared) pushUnique(merged.requiredInputs, r);
  for (const r of input.composition.complementaryRequirements) pushUnique(merged.requiredInputs, r);

  const outputs = mergeStringArraysSemantic(input.componentSpecs.map((s) => s.outputsToExploit));
  for (const o of outputs.shared) pushUnique(merged.outputsToExploit, o);
  for (const o of outputs.componentSpecific) pushUnique(merged.outputsToExploit, o);

  for (const spec of input.componentSpecs) {
    for (const fn of spec.desiredFunctions) pushUnique(merged.desiredFunctions, fn);
    for (const fn of spec.requiredFunctions) pushUnique(merged.requiredFunctions, fn);
    for (const r of spec.resourcesToProduce) pushUnique(merged.resourcesToProduce, r);
    for (const r of spec.resourcesToConsume) pushUnique(merged.resourcesToConsume, r);
    for (const z of spec.relevantZones) pushUnique(merged.relevantZones, z);
    for (const s of spec.structuralNeeds) pushUnique(merged.structuralNeeds, s);
  }

  if (input.composition.crossSupportEdges.some((e) => e.relationship === "enables" || e.relationship === "feeds")) {
    pushUnique(merged.structuralNeeds, "cross_supported_plan");
  }

  return merged;
}

export function tryComposeCompositeDirection(input: {
  anchors: DirectionAnchor[];
  profile: CommanderMechanicalProfile;
  motifs: ExtractedMotif[];
  causal: CommanderCausalRoleProfile;
}): CompositeDirectionComposition | null {
  const central = input.anchors.filter(isIndependentlyCentral);
  if (central.length < 2) return null;

  const componentAnchors: DirectionAnchor[] = [];
  const crossSupportEdges: CompositeCrossSupportEdge[] = [];

  for (let i = 0; i < central.length; i++) {
    for (let j = i + 1; j < central.length; j++) {
      const edge = detectCrossSupport(central[i]!, central[j]!);
      if (edge) {
        crossSupportEdges.push(edge);
        if (!componentAnchors.some((a) => a.anchorId === central[i]!.anchorId)) componentAnchors.push(central[i]!);
        if (!componentAnchors.some((a) => a.anchorId === central[j]!.anchorId)) componentAnchors.push(central[j]!);
      }
    }
  }

  const bothActivatedCentral =
    central.filter((a) => a.anchorKind === "ACTIVATED_ACTION").length >= 2 &&
    new Set(central.filter((a) => a.anchorKind === "ACTIVATED_ACTION").map((a) => a.mechanism)).size >= 2;

  if (componentAnchors.length < 2 && !bothActivatedCentral && crossSupportEdges.length === 0) {
    const landDev = central.find((a) => a.mechanism === "LAND_DEVELOPMENT");
    const castExile = central.find((a) => a.mechanism === "CAST_FROM_EXILE");
    if (landDev && castExile) {
      componentAnchors.push(landDev, castExile);
      crossSupportEdges.push({
        fromAnchorId: landDev.anchorId,
        toAnchorId: castExile.anchorId,
        relationship: "enables",
        note: "Land development enables free-cast impulse plan",
      });
    }
  }

  if (componentAnchors.length < 2) return null;

  const componentSpecs = componentAnchors.map((anchor) =>
    buildRetrievalSpecification({
      profile: input.profile,
      anchors: [anchor],
      motifs: input.motifs,
      requiredSupportFunctions: [],
      optionalSupportFunctions: [],
    }),
  );

  const sharedReqMerge = mergeStringArraysSemantic(componentSpecs.map((s) => s.requiredInputs));
  const sharedOutMerge = mergeStringArraysSemantic(componentSpecs.map((s) => s.outputsToExploit));

  const composition: CompositeDirectionComposition = {
    componentAnchors,
    sharedRequirements: sharedReqMerge.shared,
    complementaryRequirements: sharedReqMerge.componentSpecific,
    sharedOutputs: sharedOutMerge.shared.length > 0 ? sharedOutMerge.shared : sharedOutMerge.componentSpecific.slice(0, 2),
    crossSupportEdges,
    combinedRetrievalSpecification: mergeRetrievalSpecificationsSemantic({
      componentSpecs,
      composition: {
        sharedRequirements: sharedReqMerge.shared,
        complementaryRequirements: sharedReqMerge.componentSpecific,
        sharedOutputs: sharedOutMerge.shared,
        crossSupportEdges,
      },
    }),
  };

  return composition;
}

export function compositeSupportStrength(composition: CompositeDirectionComposition): number {
  const anchorCount = composition.componentAnchors.length;
  const edgeBoost = composition.crossSupportEdges.length * 0.08;
  const completeness = computeRetrievalSpecificationCompleteness(composition.combinedRetrievalSpecification);
  return Math.min(1, 0.42 + anchorCount * 0.12 + edgeBoost + completeness * 0.2);
}
