/**
 * Professor v4.16.3 — provenanceKnown ≠ strategicallySupported.
 */
import type { DeckCharterV45 } from "./professor-council-state-v4-5-v1";
import type { CharterConceptProvenanceV4162 } from "./professor-charter-provenance-v4-16-2-v1";

export const PROFESSOR_CHARTER_CONCEPT_SUPPORT_V4_16_3_V1_VERSION =
  "professor-charter-concept-support-v4-16-3-v1";

export type CharterConceptSupportV4163 = {
  concept: string;
  provenanceKnown: boolean;
  provenance: CharterConceptProvenanceV4162;
  strategicallySupported: boolean;
  supportEvidence: string[];
};

const STRATEGY_KEYWORDS: Record<string, RegExp> = {
  lifegain: /\blifegain\b|\blife gain\b|\bgain life\b/i,
  sacrifice: /\bsacrifice\b|\baristocrat/i,
  graveyard: /\bgraveyard\b|\breanimat/i,
  tokens: /\btoken\b|\bpopulate\b/i,
  counters: /\bcounter\b|\b\+1\/\+1\b|\bproliferat/i,
  legendary: /\blegendary\b/i,
  combat: /\bcombat\b|\battacker\b|\btrample\b|\boverwhelm\b/i,
  artifacts: /\bartifact\b|\bcolorless\b/i,
};

function strategyBlob(charter: DeckCharterV45): string {
  return `${charter.primaryStrategy} ${charter.secondaryStrategy} ${charter.deckIdentity}`.toLowerCase();
}

function conceptMatchesStrategy(blob: string, key: string): boolean {
  const re = STRATEGY_KEYWORDS[key];
  return re ? re.test(blob) : false;
}

export function assessCharterConceptSupportV4163(
  charter: DeckCharterV45,
  concept: string,
  provenance: CharterConceptProvenanceV4162 = "DERIVED_STRATEGY",
): CharterConceptSupportV4163 {
  const blob = strategyBlob(charter);
  const lower = concept.toLowerCase();
  const supportEvidence: string[] = [];
  let strategicallySupported = true;

  if (/\blifegain\b|\blife gain\b/i.test(lower)) {
    strategicallySupported = conceptMatchesStrategy(blob, "lifegain");
    if (strategicallySupported) supportEvidence.push("Commander/strategy references lifegain");
  }
  if (/\blegendary creature/i.test(lower)) {
    strategicallySupported = conceptMatchesStrategy(blob, "legendary");
    if (!strategicallySupported) {
      supportEvidence.push("Legendary priority not entailed by locked counter/combat strategy");
    } else {
      supportEvidence.push("Legendary theme present in charter strategy");
    }
  }
  if (/\btutor/i.test(lower)) {
    strategicallySupported = true;
    supportEvidence.push("Tutor policy / bracket contract permits access research");
  }
  if (/\bcompact finisher/i.test(lower) || /\bfinisher/i.test(lower)) {
    strategicallySupported = conceptMatchesStrategy(blob, "combat") || /\bwin|finisher|combo/i.test(blob);
    if (strategicallySupported) supportEvidence.push("Win path / finisher language in charter");
  }
  if (/\bpremium acceleration/i.test(lower)) {
    strategicallySupported = (charter.requestedBracket ?? 3) >= 3;
    supportEvidence.push("Bracket contract expects acceleration lever");
  }
  if (/\bhigh card quality/i.test(lower) || /\bredundancy/i.test(lower)) {
    strategicallySupported = true;
    supportEvidence.push("Generic deck-quality priority under bracket contract");
  }

  if (provenance === "MODEL_PRIOR" && !strategicallySupported) {
    supportEvidence.push("MODEL_PRIOR without commander/strategy entailment");
  }

  return {
    concept,
    provenanceKnown: true,
    provenance,
    strategicallySupported,
    supportEvidence,
  };
}

export function auditCharterConceptSupportV4163(charter: DeckCharterV45): {
  concepts: CharterConceptSupportV4163[];
  unsupported: CharterConceptSupportV4163[];
  pass: boolean;
} {
  const concepts: CharterConceptSupportV4163[] = [
    assessCharterConceptSupportV4163(charter, charter.primaryStrategy, "DERIVED_STRATEGY"),
    assessCharterConceptSupportV4163(charter, charter.secondaryStrategy, "DERIVED_STRATEGY"),
    ...(charter.researchPriorities ?? []).map((p) => assessCharterConceptSupportV4163(charter, p, "DERIVED_STRATEGY")),
  ];
  const unsupported = concepts.filter((c) => !c.strategicallySupported);
  return { concepts, unsupported, pass: unsupported.length === 0 };
}

export function sanitizeUnsupportedCharterConceptsV4163(charter: DeckCharterV45): {
  charter: DeckCharterV45;
  removedConcepts: string[];
} {
  const audit = auditCharterConceptSupportV4163(charter);
  if (audit.unsupported.length === 0) return { charter, removedConcepts: [] };
  const removed = new Set(audit.unsupported.map((u) => u.concept));
  const researchPriorities = (charter.researchPriorities ?? []).filter((p) => !removed.has(p));
  while (researchPriorities.length < 3) {
    researchPriorities.push(
      `Efficient ${charter.primaryStrategy.toLowerCase()} pieces`,
      "Role-compressed cards supporting win closure",
      "Protection and interaction at appropriate rate",
    );
  }
  return {
    charter: { ...charter, researchPriorities: [...new Set(researchPriorities)].slice(0, 6) },
    removedConcepts: [...removed],
  };
}
