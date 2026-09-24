/**
 * Infer SemanticOpportunities from frozen CommanderMechanismFacts.
 * Generic mechanism-family rules only — no card-name-specific exceptions.
 * v2: provenance classes (derivation, confidence, causal proof).
 */
import type { IndependentMechanismFact } from "../../src/lib/deck-synthesis/independent-truth-types-v1";
import type {
  OpportunityConfidenceClass,
  OpportunityDerivationClass,
  SemanticOpportunity,
  SemanticOpportunityType,
} from "../../src/lib/deck-synthesis/semantic-opportunity-types-v1";
import type { ImplementedMechanismCatalogEntry } from "./phase6a1-implemented-mechanism-catalog-v1";

export const SEMANTIC_OPPORTUNITY_INFERENCE_V1_VERSION = "phase6a1-semantic-opportunity-inference-v2";

function oracleEvidence(fact: IndependentMechanismFact): SemanticOpportunity["evidence"] {
  return {
    type: "COMMANDER_ORACLE",
    oracleSpan: fact.evidenceSpan,
  };
}

function actionTypes(fact: IndependentMechanismFact): string[] {
  const actions = fact.actions as Array<{ type?: string }> | undefined;
  return (actions ?? []).map((a) => String(a.type ?? "")).filter(Boolean);
}

function hasCost(fact: IndependentMechanismFact, pattern: RegExp): boolean {
  const costs = (fact.cost as string[] | undefined) ?? [];
  return costs.some((c) => pattern.test(c)) || pattern.test(JSON.stringify(fact));
}

type OppSpec = {
  suffix: string;
  type: SemanticOpportunityType;
  derivationClass: OpportunityDerivationClass;
  confidence: OpportunityConfidenceClass;
  causalStatement: string;
  requiredStateOrAction: string;
  expectedMechanicalEffect: string;
  causalProof: string[];
  prerequisites?: string[];
};

function confidenceForDerivation(d: OpportunityDerivationClass): OpportunityConfidenceClass {
  if (d === "DIRECT_MECHANICAL") return "HIGH";
  if (d === "NECESSARY_PREREQUISITE" || d === "DERIVED_AMPLIFICATION") return "MEDIUM";
  return "LOW";
}

function opp(fact: IndependentMechanismFact, spec: OppSpec): SemanticOpportunity {
  return {
    opportunityId: `${fact.mechanismId}--${spec.suffix}`,
    sourceMechanismFactIds: [fact.mechanismId],
    sourceFactIds: [fact.mechanismId],
    opportunityType: spec.type,
    derivationClass: spec.derivationClass,
    opportunityConfidence: spec.confidence ?? confidenceForDerivation(spec.derivationClass),
    causalStatement: spec.causalStatement,
    requiredStateOrAction: spec.requiredStateOrAction,
    expectedMechanicalEffect: spec.expectedMechanicalEffect,
    causalProof: spec.causalProof,
    prerequisites: spec.prerequisites ?? [],
    mutuallyRelevantWith: [],
    evidence: oracleEvidence(fact),
    commanderMember: typeof fact.commander === "string" ? fact.commander : undefined,
  };
}

function inferFromFact(fact: IndependentMechanismFact): SemanticOpportunity[] {
  const out: SemanticOpportunity[] = [];
  const types = actionTypes(fact);
  const blob = JSON.stringify(fact).toLowerCase();
  const mechType = String(fact.mechanismType ?? "");
  const span = fact.evidenceSpan;

  if (mechType === "ACTIVATED_ABILITY" || mechType.includes("ACTIVATED")) {
    if (hasCost(fact, /TAP_SELF|\{T\}/i)) {
      out.push(
        opp(fact, {
          suffix: "activation-repetition",
          type: "ACTIVATION_REPETITION",
          derivationClass: "DIRECT_MECHANICAL",
          confidence: "HIGH",
          causalStatement: "Repeat activated ability more often",
          requiredStateOrAction: "UNTAP_SELF or additional activations per turn",
          expectedMechanicalEffect: "Additional activations of commander ability",
          causalProof: [
            `Fact ${fact.mechanismId} requires tap cost (${span})`,
            "UNTAP_SELF or extra activations directly increase resolution count",
          ],
        }),
      );
    }
    if (hasCost(fact, /\{[0-9WUBRG]+\}/i)) {
      out.push(
        opp(fact, {
          suffix: "pay-activation-cost",
          type: "INPUT_AMPLIFICATION",
          derivationClass: "NECESSARY_PREREQUISITE",
          confidence: "MEDIUM",
          causalStatement: "Pay activation costs reliably",
          requiredStateOrAction: "Mana / resource to pay activation cost",
          expectedMechanicalEffect: "Commander ability resolves more frequently",
          causalProof: [
            `Fact ${fact.mechanismId} includes mana activation cost`,
            "Without mana, ability cannot be activated",
          ],
          prerequisites: ["Available mana each turn"],
        }),
      );
    }
  }

  if (types.includes("CREATE_TOKEN") || /create.*token/i.test(span)) {
    out.push(
      opp(fact, {
        suffix: "exploit-tokens",
        type: "OUTPUT_EXPLOITATION",
        derivationClass: "OPTIONAL_EXPLOIT",
        confidence: "LOW",
        causalStatement: "Exploit created tokens",
        requiredStateOrAction: "Tokens on battlefield from commander output",
        expectedMechanicalEffect: "Combat, sacrifice, or synergy payoffs from token board",
        causalProof: [
          `Fact ${fact.mechanismId} creates tokens (${span})`,
          "Token exploitation is a common downstream use, not mandated by Oracle",
        ],
      }),
    );
    if (/count\(|where x is|quantity.*controlled/i.test(blob)) {
      out.push(
        opp(fact, {
          suffix: "amplify-input-count",
          type: "INPUT_AMPLIFICATION",
          derivationClass: "DERIVED_AMPLIFICATION",
          confidence: "HIGH",
          causalStatement: "Increase quantity scaling commander output",
          requiredStateOrAction: "Increase count of relevant permanents/creatures controlled",
          expectedMechanicalEffect: "Larger token output or scaled effect per activation",
          causalProof: [
            `Fact ${fact.mechanismId} scales with controlled count (${span})`,
            "Increasing count directly increases output magnitude",
          ],
        }),
      );
    }
  }

  if (mechType === "TRIGGERED_MANA_ABILITY" || /tap.*for mana|add one mana/i.test(span)) {
    out.push(
      opp(fact, {
        suffix: "amplify-mana-triggers",
        type: "INPUT_AMPLIFICATION",
        derivationClass: "DERIVED_AMPLIFICATION",
        confidence: "MEDIUM",
        causalStatement: "Increase mana from tap triggers",
        requiredStateOrAction: "Nonland permanents tapping for mana",
        expectedMechanicalEffect: "Extra mana each tap event",
        causalProof: [`Fact ${fact.mechanismId} produces mana on tap (${span})`],
      }),
    );
  }

  if (/whenever|when .* dies|at the beginning/i.test(span) && /dies|death|sacrifice/i.test(blob)) {
    out.push(
      opp(fact, {
        suffix: "increase-trigger-frequency",
        type: "TRIGGER_FREQUENCY",
        derivationClass: "DIRECT_MECHANICAL",
        confidence: "HIGH",
        causalStatement: "Increase death/sacrifice trigger frequency",
        requiredStateOrAction: "Controlled creature/permanent deaths or sacrifices",
        expectedMechanicalEffect: "More commander or deck trigger resolutions",
        causalProof: [
          `Fact ${fact.mechanismId} triggers on death/sacrifice (${span})`,
          "More death events → more trigger resolutions",
        ],
      }),
    );
  }

  if (types.includes("MILL") || /mill/i.test(span)) {
    out.push(
      opp(fact, {
        suffix: "mill-state",
        type: "STATE_MANIPULATION",
        derivationClass: "DIRECT_MECHANICAL",
        confidence: "HIGH",
        causalStatement: "Manipulate library/graveyard via mill",
        requiredStateOrAction: "Mill events targeting players",
        expectedMechanicalEffect: "Graveyard/library state changes enabling payoffs",
        causalProof: [`Fact ${fact.mechanismId} mills (${span})`],
      }),
    );
    out.push(
      opp(fact, {
        suffix: "graveyard-zone",
        type: "ZONE_ENABLEMENT",
        derivationClass: "DERIVED_AMPLIFICATION",
        confidence: "MEDIUM",
        causalStatement: "Enable graveyard-based payoffs",
        requiredStateOrAction: "Cards in graveyard from mill",
        expectedMechanicalEffect: "Recursion, reanimation, or threshold effects",
        causalProof: [
          `Mill from ${fact.mechanismId} fills graveyard`,
          "Graveyard payoffs are downstream, not Oracle-mandatory",
        ],
      }),
    );
  }

  if (mechType === "REPLACEMENT_EFFECT" || /\bwould\b.*\binstead\b/i.test(span)) {
    out.push(
      opp(fact, {
        suffix: "amplify-replaced-event",
        type: "OUTPUT_EXPLOITATION",
        derivationClass: "DERIVED_AMPLIFICATION",
        confidence: "MEDIUM",
        causalStatement: "Amplify replaced event outcome",
        requiredStateOrAction: "Events subject to replacement (e.g. mill quantity)",
        expectedMechanicalEffect: "Stronger outcome from modified event",
        causalProof: [`Replacement on ${fact.mechanismId} modifies event magnitude (${span})`],
      }),
    );
  }

  if (types.includes("DRAW_CARD") || types.includes("DRAW_CARDS") || /draw .* card/i.test(span)) {
    out.push(
      opp(fact, {
        suffix: "convert-draw",
        type: "RESOURCE_CONVERSION",
        derivationClass: "DERIVED_AMPLIFICATION",
        confidence: "MEDIUM",
        causalStatement: "Convert draw into board advantage",
        requiredStateOrAction: "Cards drawn from commander trigger",
        expectedMechanicalEffect: "Hand size and spell availability increase",
        causalProof: [`Draw from ${fact.mechanismId} (${span})`],
      }),
    );
  }

  if (/return.*graveyard|from your graveyard|unearth|recur/i.test(span)) {
    out.push(
      opp(fact, {
        suffix: "zone-recursion",
        type: "ZONE_ENABLEMENT",
        derivationClass: "DIRECT_MECHANICAL",
        confidence: "HIGH",
        causalStatement: "Return cards from graveyard to battlefield/hand",
        requiredStateOrAction: "Valid targets in graveyard",
        expectedMechanicalEffect: "Reusable permanents or threats without commander",
        causalProof: [`Recursion stated in Oracle (${span})`],
      }),
    );
    out.push(
      opp(fact, {
        suffix: "recursion-redundancy",
        type: "REDUNDANCY",
        derivationClass: "OPTIONAL_EXPLOIT",
        confidence: "LOW",
        causalStatement: "Redundant recursion beyond commander",
        requiredStateOrAction: "Graveyard targets and recursion spells",
        expectedMechanicalEffect: "Engine continues if commander removed",
        causalProof: [
          `Commander provides recursion (${span})`,
          "Backup recursion is strategic redundancy, not Oracle-derived",
        ],
      }),
    );
  }

  if (mechType === "GRANTED_STATIC_ABILITY" || /have "/i.test(span)) {
    out.push(
      opp(fact, {
        suffix: "support-granted-ability",
        type: "STRUCTURAL_SUPPORT",
        derivationClass: "NECESSARY_PREREQUISITE",
        confidence: "MEDIUM",
        causalStatement: "Support permanents benefiting from granted ability",
        requiredStateOrAction: "Permanents matching granted ability constraints",
        expectedMechanicalEffect: "Command-zone-wide static benefit realized on board",
        causalProof: [
          `Granted ability on ${fact.mechanismId} (${span})`,
          "Matching permanents required to realize static benefit",
        ],
      }),
    );
  }

  if (/exile|play.*from exile|treasure/i.test(blob)) {
    out.push(
      opp(fact, {
        suffix: "exile-engine",
        type: "RESOURCE_CONVERSION",
        derivationClass: "DERIVED_AMPLIFICATION",
        confidence: "MEDIUM",
        causalStatement: "Convert exile zone into playable resources",
        requiredStateOrAction: "Cards exiled accessible for play",
        expectedMechanicalEffect: "Repeatable value from exile zone",
        causalProof: [`Exile interaction in ${fact.mechanismId}`],
      }),
    );
  }

  if (/copy|becomes a copy/i.test(blob)) {
    out.push(
      opp(fact, {
        suffix: "copy-synergy",
        type: "OUTPUT_EXPLOITATION",
        derivationClass: "OPTIONAL_EXPLOIT",
        confidence: "LOW",
        causalStatement: "Exploit copy or clone effects",
        requiredStateOrAction: "High-value copy targets on board or in zones",
        expectedMechanicalEffect: "Duplicated threat or engine output",
        causalProof: [`Copy effect in ${fact.mechanismId}`],
      }),
    );
  }

  if (/sacrifice/i.test(blob) && !out.some((o) => o.opportunityType === "TRIGGER_FREQUENCY")) {
    out.push(
      opp(fact, {
        suffix: "sacrifice-outlet",
        type: "TRIGGER_FREQUENCY",
        derivationClass: "OPTIONAL_EXPLOIT",
        confidence: "LOW",
        causalStatement: "Cause sacrifices for value",
        requiredStateOrAction: "Sacrifice outlets and fodder",
        expectedMechanicalEffect: "Sacrifice-triggered payoffs fire more often",
        causalProof: [`Sacrifice mentioned in ${fact.mechanismId} context`],
      }),
    );
  }

  if (/costs?\s*\{[^}]+\}\s*less|cost reduction/i.test(span)) {
    out.push(
      opp(fact, {
        suffix: "cost-reduction-support",
        type: "INPUT_AMPLIFICATION",
        derivationClass: "NECESSARY_PREREQUISITE",
        confidence: "MEDIUM",
        causalStatement: "Cast spells benefiting from cost reduction",
        requiredStateOrAction: "Spells matching cost-reduction constraint",
        expectedMechanicalEffect: "More spells cast under discount",
        causalProof: [`Cost reduction in ${fact.mechanismId} (${span})`],
      }),
    );
  }

  if (mechType === "KEYWORD" && /vigilance|hexproof|indestructible|ward/i.test(blob)) {
    out.push(
      opp(fact, {
        suffix: "protect-commander",
        type: "PROTECTION",
        derivationClass: "DIRECT_MECHANICAL",
        confidence: "HIGH",
        causalStatement: "Protect commander or key engine pieces",
        requiredStateOrAction: "Protection/hexproof/indestructible effects",
        expectedMechanicalEffect: "Commander survives removal longer",
        causalProof: [`Protection keyword granted in Oracle (${span})`],
      }),
    );
  }

  if (out.length === 0 && span.length > 15) {
    out.push(
      opp(fact, {
        suffix: "structural-support",
        type: "STRUCTURAL_SUPPORT",
        derivationClass: "OPTIONAL_EXPLOIT",
        confidence: "LOW",
        causalStatement: "Support commander mechanism with relevant deck resources",
        requiredStateOrAction: "Board/zone state aligned with commander ability",
        expectedMechanicalEffect: "Commander ability produces more net value",
        causalProof: [
          `Fallback support for ${fact.mechanismId}`,
          "Generic deck-quality support — not a direct Oracle consequence",
        ],
      }),
    );
  }

  return out;
}

function linkMutualRelevance(opportunities: SemanticOpportunity[]): void {
  const byFact = new Map<string, SemanticOpportunity[]>();
  for (const o of opportunities) {
    for (const fid of o.sourceFactIds) {
      const list = byFact.get(fid) ?? [];
      list.push(o);
      byFact.set(fid, list);
    }
  }

  for (const group of byFact.values()) {
    if (group.length < 2) continue;
    const ids = group.map((o) => o.opportunityId);
    for (const o of group) {
      o.mutuallyRelevantWith = ids.filter((id) => id !== o.opportunityId);
    }
  }
}

export function inferOpportunitiesForCase(entry: ImplementedMechanismCatalogEntry): SemanticOpportunity[] {
  const all: SemanticOpportunity[] = [];
  const seen = new Set<string>();

  for (const fact of entry.independentMechanismFacts) {
    for (const o of inferFromFact(fact)) {
      const key = `${o.opportunityType}:${o.causalStatement}`;
      if (seen.has(key)) continue;
      seen.add(key);
      all.push(o);
    }
  }

  linkMutualRelevance(all);
  return all;
}

export function countByType(opportunities: SemanticOpportunity[]): Record<SemanticOpportunityType, number> {
  const counts = {} as Record<SemanticOpportunityType, number>;
  for (const o of opportunities) {
    counts[o.opportunityType] = (counts[o.opportunityType] ?? 0) + 1;
  }
  return counts;
}

export function countByDerivation(
  opportunities: SemanticOpportunity[],
): Record<OpportunityDerivationClass, number> {
  const counts = {} as Record<OpportunityDerivationClass, number>;
  for (const o of opportunities) {
    counts[o.derivationClass] = (counts[o.derivationClass] ?? 0) + 1;
  }
  return counts;
}
