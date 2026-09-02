/**
 * Professor v4.16.2 — Charter concept provenance and contamination gate.
 */
import type { DeckCharterV45 } from "./professor-council-state-v4-5-v1";

export const PROFESSOR_CHARTER_PROVENANCE_V4_16_2_V1_VERSION = "professor-charter-provenance-v4-16-2-v1";

export type CharterConceptProvenanceV4162 =
  | "USER"
  | "COMMANDER_ORACLE"
  | "COMMANDER_PROFILE"
  | "RAG"
  | "MODEL_PRIOR"
  | "DERIVED_STRATEGY";

export type CharterConceptV4162 = {
  concept: string;
  provenance: CharterConceptProvenanceV4162;
  supported: boolean;
  field: "harmonyPlan" | "researchPriorities" | "designRules" | "avoidPatterns";
};

const STRATEGY_KEYWORDS: Record<string, RegExp> = {
  lifegain: /\blifegain\b|\blife gain\b|\bgain life\b|\blife total\b/i,
  sacrifice: /\bsacrifice\b|\baristocrat/i,
  graveyard: /\bgraveyard\b|\breanimat/i,
  tokens: /\btoken\b|\bpopulate\b/i,
  counters: /\bcounter\b|\bproliferat/i,
  legendary: /\blegendary\b/i,
  combat: /\bcombat\b|\battacker\b|\btrample\b/i,
};

function strategySupportsConcept(primary: string, secondary: string, conceptKey: string): boolean {
  const re = STRATEGY_KEYWORDS[conceptKey];
  if (!re) return true;
  return re.test(primary) || re.test(secondary);
}

function detectUnsupportedConcepts(charter: DeckCharterV45): CharterConceptV4162[] {
  const primary = charter.primaryStrategy ?? "";
  const secondary = charter.secondaryStrategy ?? "";
  const flagged: CharterConceptV4162[] = [];

  if (/\blifegain\b|\blife gain\b/i.test(charter.harmonyPlan ?? "")) {
    if (!strategySupportsConcept(primary, secondary, "lifegain")) {
      flagged.push({
        concept: "lifegain in harmonyPlan",
        provenance: "MODEL_PRIOR",
        supported: false,
        field: "harmonyPlan",
      });
    }
  }

  for (const priority of charter.researchPriorities ?? []) {
    if (/\blifegain\b|\blife gain\b/i.test(priority)) {
      if (!strategySupportsConcept(primary, secondary, "lifegain")) {
        flagged.push({
          concept: priority,
          provenance: "MODEL_PRIOR",
          supported: false,
          field: "researchPriorities",
        });
      }
    }
  }

  return flagged;
}

export function auditCharterProvenanceV4162(charter: DeckCharterV45): {
  concepts: Array<{ concept: string; provenance: CharterConceptProvenanceV4162; supported: boolean; evidence: string }>;
  contamination: CharterConceptV4162[];
  pass: boolean;
} {
  const primary = charter.primaryStrategy ?? "";
  const secondary = charter.secondaryStrategy ?? "";
  const concepts: Array<{ concept: string; provenance: CharterConceptProvenanceV4162; supported: boolean; evidence: string }> = [
    {
      concept: primary,
      provenance: "DERIVED_STRATEGY",
      supported: true,
      evidence: `Creative pass1 primary package for ${charter.commander}`,
    },
    {
      concept: secondary,
      provenance: "DERIVED_STRATEGY",
      supported: true,
      evidence: `Secondary strategy from creative pass1 / win paths`,
    },
    {
      concept: charter.harmonyPlan,
      provenance: /lifegain|life gain/i.test(charter.harmonyPlan) ? "MODEL_PRIOR" : "DERIVED_STRATEGY",
      supported: !/\blifegain\b|\blife gain\b/i.test(charter.harmonyPlan) || strategySupportsConcept(primary, secondary, "lifegain"),
      evidence: `Relationship=${charter.commanderRelationship}, primary=${primary}`,
    },
    ...(charter.researchPriorities ?? []).map((p) => ({
      concept: p,
      provenance: (/\blifegain\b|\blife gain\b/i.test(p) ? "MODEL_PRIOR" : "DERIVED_STRATEGY") as CharterConceptProvenanceV4162,
      supported: assertCharterConceptSupportedV4162(charter, p),
      evidence: `Research priority under ${primary} / ${secondary}`,
    })),
  ];
  const contamination = detectUnsupportedConcepts(charter);
  return { concepts, contamination, pass: contamination.length === 0 };
}

export function sanitizeCharterProvenanceV4162(charter: DeckCharterV45): {
  charter: DeckCharterV45;
  removedConcepts: string[];
  flaggedForVerify: string[];
} {
  const unsupported = detectUnsupportedConcepts(charter);
  if (unsupported.length === 0) {
    return { charter, removedConcepts: [], flaggedForVerify: [] };
  }

  const removedConcepts: string[] = [];
  let harmonyPlan = charter.harmonyPlan;
  let researchPriorities = [...(charter.researchPriorities ?? [])];

  if (unsupported.some((u) => u.field === "harmonyPlan")) {
    removedConcepts.push(charter.harmonyPlan);
    harmonyPlan = `${charter.commanderRelationship} — align ${charter.primaryStrategy.toLowerCase()} with ${charter.secondaryStrategy.toLowerCase()} without unrelated subthemes.`;
  }

  const removedPriorities = new Set(
    unsupported.filter((u) => u.field === "researchPriorities").map((u) => u.concept),
  );
  if (removedPriorities.size > 0) {
    for (const p of removedPriorities) removedConcepts.push(p);
    researchPriorities = researchPriorities.filter((p) => !removedPriorities.has(p));
  }

  if (researchPriorities.length < 3) {
    researchPriorities.push(
      `Efficient ${charter.primaryStrategy.toLowerCase()} pieces`,
      `Role-compressed cards supporting ${charter.secondaryStrategy.toLowerCase()}`,
      "Protection and interaction at appropriate rate",
    );
  }

  return {
    charter: {
      ...charter,
      harmonyPlan,
      researchPriorities: [...new Set(researchPriorities)].slice(0, 6),
    },
    removedConcepts,
    flaggedForVerify: unsupported.map((u) => u.concept),
  };
}

export function assertCharterConceptSupportedV4162(charter: DeckCharterV45, concept: string): boolean {
  const primary = charter.primaryStrategy ?? "";
  const secondary = charter.secondaryStrategy ?? "";
  if (/\blifegain\b|\blife gain\b/i.test(concept)) {
    return strategySupportsConcept(primary, secondary, "lifegain");
  }
  return true;
}
