/**
 * Professor v4.17 — normalize Sol strategic language against Semantic Oracle.
 */
import type {
  NormalizedSemanticConceptV417,
  RequirementFunctionV417,
  SemanticConceptKindV417,
  SemanticConceptStatusV417,
} from "./professor-brew-blueprint-v4-17-v1";

export const PROFESSOR_SEMANTIC_CONCEPT_NORMALIZER_V4_17_V1_VERSION = "professor-semantic-concept-normalizer-v4-17-v1";

type ConceptMapping = {
  patterns: RegExp[];
  functions: RequirementFunctionV417[];
  status: SemanticConceptStatusV417;
  kind: SemanticConceptKindV417;
  evidence: string;
};

const MECHANICAL_MAPPINGS: ConceptMapping[] = [
  {
    patterns: [/graveyard recursion|reanimat|return.*graveyard|recur.*graveyard/i],
    functions: ["RETURN_FROM_GRAVEYARD"],
    status: "VERIFIED",
    kind: "MECHANICAL_SEMANTIC",
    evidence: "semantic:RETURNS_FROM",
  },
  {
    patterns: [/surveil|self[- ]mill|mill.*graveyard|graveyard setup|fill graveyard/i],
    functions: ["GRAVEYARD_ENABLER"],
    status: "VERIFIED",
    kind: "MECHANICAL_SEMANTIC",
    evidence: "semantic:MOVES_ZONE→graveyard",
  },
  {
    patterns: [/mana ramp|ramp|accelerat|add \{[wubrg]/i],
    functions: ["ACCELERATION"],
    status: "VERIFIED",
    kind: "MECHANICAL_SEMANTIC",
    evidence: "semantic:GENERATES_MANA",
  },
  {
    patterns: [/card draw|draw cards|cantrip|filter.*hand/i],
    functions: ["CARD_VELOCITY"],
    status: "VERIFIED",
    kind: "MECHANICAL_SEMANTIC",
    evidence: "semantic:DRAWS",
  },
  {
    patterns: [/counterspell|counter target|destroy target|exile target|removal|interaction/i],
    functions: ["INTERACTION"],
    status: "VERIFIED",
    kind: "MECHANICAL_SEMANTIC",
    evidence: "semantic:CONSUMES/interaction",
  },
  {
    patterns: [/hexproof|indestructible|protection from|shroud|ward|save.*commander/i],
    functions: ["PROTECTION"],
    status: "VERIFIED",
    kind: "MECHANICAL_SEMANTIC",
    evidence: "semantic:AMPLIFIES/protection",
  },
  {
    patterns: [/sacrifice outlet|sacrifice.*payoff|aristocrat|drain when.*dies/i],
    functions: ["ENGINE_ENABLER", "ENGINE_PAYOFF"],
    status: "SUPPORTED",
    kind: "MECHANICAL_SEMANTIC",
    evidence: "semantic:sacrifice_engine",
  },
  {
    patterns: [/token|create .* token|go-wide|wide board/i],
    functions: ["RESOURCE_PRODUCTION", "ENGINE_PAYOFF"],
    status: "SUPPORTED",
    kind: "MECHANICAL_SEMANTIC",
    evidence: "semantic:PRODUCES/tokens",
  },
  {
    patterns: [/tutor|search.*library|find.*card|access.*engine/i],
    functions: ["ACCESS"],
    status: "VERIFIED",
    kind: "MECHANICAL_SEMANTIC",
    evidence: "verified-access-route",
  },
  {
    patterns: [/copy spell|spell copy|instants? and sorceries|spellslinger/i],
    functions: ["ENGINE_ENABLER", "ENGINE_PAYOFF"],
    status: "SUPPORTED",
    kind: "MECHANICAL_SEMANTIC",
    evidence: "semantic:spell_engine",
  },
  {
    patterns: [/\+1\/\+1 counter|counter synergy|proliferate/i],
    functions: ["ENGINE_ENABLER", "RESOURCE_PRODUCTION"],
    status: "SUPPORTED",
    kind: "MECHANICAL_SEMANTIC",
    evidence: "semantic:counter_engine",
  },
  {
    patterns: [/exile.*cast|cast from exile/i],
    functions: ["ENGINE_ENABLER"],
    status: "SUPPORTED",
    kind: "MECHANICAL_SEMANTIC",
    evidence: "semantic:cast_from_exile",
  },
  {
    patterns: [/combat|voltron|equipment|aura.*commander|powerful attacker|double strike|trample|flying|menace/i],
    functions: ["WIN_COMPONENT"],
    status: "SUPPORTED",
    kind: "MECHANICAL_SEMANTIC",
    evidence: "semantic:combat_win",
  },
  {
    patterns: [/extra turn|time walk|take an extra turn/i],
    functions: ["WIN_COMPONENT"],
    status: "VERIFIED",
    kind: "MECHANICAL_SEMANTIC",
    evidence: "semantic:extra_turn",
  },
  {
    patterns: [/recover|reset|refuel|get back in/i],
    functions: ["RECOVERY"],
    status: "SUPPORTED",
    kind: "MECHANICAL_SEMANTIC",
    evidence: "semantic:recovery",
  },
];

type StrategicComposition = {
  patterns: RegExp[];
  composedFrom: RequirementFunctionV417[];
  evidence: string;
};

const STRATEGIC_COMPOSITIONS: StrategicComposition[] = [
  {
    patterns: [/graveyard as (a )?(second )?hand|graveyard as hand|gy as hand/i],
    composedFrom: ["GRAVEYARD_ENABLER", "RETURN_FROM_GRAVEYARD", "CARD_VELOCITY"],
    evidence: "strategic:graveyard_hand_composition",
  },
  {
    patterns: [/commander[- ]damage clock|commander damage|21 commander|voltron clock|combat clock/i],
    composedFrom: ["WIN_COMPONENT", "PROTECTION", "ACCELERATION"],
    evidence: "strategic:combat_clock_composition",
  },
  {
    patterns: [/threat diversification|redundancy|multiple lines|backup plan/i],
    composedFrom: ["RECOVERY", "ACCESS"],
    evidence: "strategic:redundancy_composition",
  },
  {
    patterns: [/stack[- ]window discipline|protected pivot|protected combo turn|interaction before development/i],
    composedFrom: ["INTERACTION", "PROTECTION"],
    evidence: "strategic:protection_interaction_composition",
  },
  {
    patterns: [/resource redundancy|resource asymmetry|mana-positive sequencing/i],
    composedFrom: ["ACCELERATION", "CARD_VELOCITY"],
    evidence: "strategic:resource_composition",
  },
  {
    patterns: [/selective overextension|exile-payment discipline|end-step conversion|extra-turn leverage|compact win package|commander-independent engine|protected pivot turn/i],
    composedFrom: ["PROTECTION", "WIN_COMPONENT", "ENGINE_ENABLER"],
    evidence: "strategic:engine_win_composition",
  },
];

const TRUE_GAP_PATTERNS: RegExp[] = [
  /^quantum storm synergy$/i,
  /^abstract value$/i,
];

export function normalizeSemanticConceptV417(concept: string): NormalizedSemanticConceptV417 {
  const trimmed = concept.trim();
  for (const mapping of MECHANICAL_MAPPINGS) {
    if (mapping.patterns.some((p) => p.test(trimmed))) {
      return {
        concept: trimmed,
        status: mapping.status,
        conceptKind: mapping.kind,
        mappedFunctions: mapping.functions,
        evidence: [mapping.evidence],
      };
    }
  }
  for (const strategic of STRATEGIC_COMPOSITIONS) {
    if (strategic.patterns.some((p) => p.test(trimmed))) {
      return {
        concept: trimmed,
        status: "STRATEGICALLY_SUPPORTED",
        conceptKind: "STRATEGIC_ABSTRACTION",
        mappedFunctions: strategic.composedFrom,
        composedFrom: strategic.composedFrom,
        evidence: [strategic.evidence],
      };
    }
  }
  if (TRUE_GAP_PATTERNS.some((p) => p.test(trimmed))) {
    return {
      concept: trimmed,
      status: "UNSUPPORTED",
      conceptKind: "TRUE_SEMANTIC_GAP",
      mappedFunctions: [],
      evidence: ["TRUE_SEMANTIC_GAP:no_reusable_mechanic"],
    };
  }
  return {
    concept: trimmed,
    status: "UNSUPPORTED",
    conceptKind: "STRATEGIC_ABSTRACTION",
    mappedFunctions: [],
    evidence: [],
  };
}

export function normalizeSolConceptsV417(concepts: string[]): NormalizedSemanticConceptV417[] {
  return concepts.map(normalizeSemanticConceptV417);
}

export function supportedFunctionsFromConcepts(concepts: NormalizedSemanticConceptV417[]): RequirementFunctionV417[] {
  const fns = new Set<RequirementFunctionV417>();
  for (const c of concepts) {
    if (c.status === "UNSUPPORTED" && c.conceptKind === "TRUE_SEMANTIC_GAP") continue;
    if (c.status === "UNSUPPORTED") continue;
    for (const fn of c.mappedFunctions) fns.add(fn);
    if (c.composedFrom) for (const fn of c.composedFrom) fns.add(fn);
  }
  return [...fns];
}

export function unsupportedConceptLabels(concepts: NormalizedSemanticConceptV417[]): string[] {
  return concepts
    .filter((c) => c.status === "UNSUPPORTED" && c.conceptKind !== "TRUE_SEMANTIC_GAP")
    .map((c) => c.concept);
}

export function trueSemanticGapLabels(concepts: NormalizedSemanticConceptV417[]): string[] {
  return concepts.filter((c) => c.conceptKind === "TRUE_SEMANTIC_GAP").map((c) => c.concept);
}

export function classifySemanticCoverage(concepts: NormalizedSemanticConceptV417[]): {
  mechanicalSemanticCoverage: "PASS" | "PARTIAL" | "FAIL";
  strategicConceptSupport: "PASS" | "PARTIAL" | "FAIL";
  trueSemanticGaps: string[];
} {
  const mechanical = concepts.filter((c) => c.conceptKind === "MECHANICAL_SEMANTIC");
  const strategic = concepts.filter((c) => c.conceptKind === "STRATEGIC_ABSTRACTION");
  const gaps = trueSemanticGapLabels(concepts);
  const mechPass = mechanical.filter((c) => c.status !== "UNSUPPORTED").length;
  const stratPass = strategic.filter((c) => c.status === "STRATEGICALLY_SUPPORTED" || c.status !== "UNSUPPORTED").length;
  return {
    mechanicalSemanticCoverage:
      mechanical.length === 0 ? "PASS" : mechPass === mechanical.length ? "PASS" : mechPass > 0 ? "PARTIAL" : "FAIL",
    strategicConceptSupport:
      strategic.length === 0 ? "PASS" : stratPass >= strategic.length * 0.6 ? "PASS" : stratPass > 0 ? "PARTIAL" : "FAIL",
    trueSemanticGaps: gaps,
  };
}
