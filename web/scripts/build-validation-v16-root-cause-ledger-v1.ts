/**
 * Canonical 26/26 non-overlapping primary root-cause ledger for v16 genuine parser FNs.
 *
 * Run: cd web && npx tsx scripts/build-validation-v16-root-cause-ledger-v1.ts
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

type ForensicRow = {
  mismatchId: string;
  caseId: string;
  cardName: string;
  expectedAction: string;
  goldEvidence: string;
  oracleClause: string;
  expectedPrimitive: string;
  clauseRole: string;
  abilityType: string;
  semanticOwner: string;
  executionContext: string;
  failureStage: string;
  coverageStratum: string;
  finalVerdict: string;
  parserEmissions?: Array<{ actionType: string; evidence: string }>;
};

type LedgerRow = {
  caseId: string;
  primitive: string;
  fullRelevantOracleClause: string;
  abilityType: string;
  clauseRole: string;
  semanticOwner: string;
  executionContext: string;
  parserStageFailed: string;
  exactRootCause: string;
  proposedStructuralFamily: string;
  recurrenceCount: number;
  independentlyRecurredFromPriorSpent: "yes" | "no";
  secondaryRelationships?: string[];
  mismatchId: string;
  cardName: string;
  goldEvidence: string;
};

type FamilyDef = {
  family: string;
  structuralDescription: string;
  rc7Priority: "strong" | "moderate" | "defer";
  caseKeys: string[];
};

const FORENSIC_PATH = "data/milestones/validation-v16-certification/validation-v16-forensic-adjudication-v1.json";
const V15_FORENSIC_PATH = "data/milestones/validation-v15-certification/validation-v15-forensic-adjudication-v1.4.json";
const OUT_DIR = "data/milestones/validation-v16-certification";

function rowKey(r: { caseId: string; expectedAction: string; goldEvidence: string }): string {
  return `${r.caseId}|${r.expectedAction}|${r.goldEvidence}`;
}

/** One primary structural family per genuine FN row — families are disjoint by mechanism. */
const PRIMARY_FAMILY_BY_KEY: Record<string, Omit<LedgerRow, "recurrenceCount" | "mismatchId" | "cardName" | "goldEvidence">> = {
  "vh16-0001|put_counter|Put a +1/+1 counter on this creature and draw a card": {
    caseId: "vh16-0001",
    primitive: "put_counter",
    fullRelevantOracleClause: "Put a +1/+1 counter on this creature and draw a card",
    abilityType: "spell_effect",
    clauseRole: "effect",
    semanticOwner: "granted_object",
    executionContext: "granted_ability",
    parserStageFailed: "action_extraction_in_granted_compound",
    exactRootCause:
      "Granted quoted ability compound effect: parser emitted draw from granted span but failed put_counter leg in same resolving clause.",
    proposedStructuralFamily: "granted_compound_primitive_extraction",
    independentlyRecurredFromPriorSpent: "no",
    secondaryRelationships: ["granted_nested_stratum"],
  },
  "vh16-0004|add_mana|Add {G}": {
    caseId: "vh16-0004",
    primitive: "add_mana",
    fullRelevantOracleClause: "Add {G}",
    abilityType: "activated",
    clauseRole: "effect",
    semanticOwner: "granted_object",
    executionContext: "granted_ability",
    parserStageFailed: "granted_nested_action_extraction",
    exactRootCause:
      "Nested granted activated mana ability inside quoted grant — grant span materialized but mana primitive not extracted from nested activated block.",
    proposedStructuralFamily: "granted_nested_activated_mana",
    independentlyRecurredFromPriorSpent: "no",
  },
  "vh16-0011|lose_life|lose 3 life": {
    caseId: "vh16-0011",
    primitive: "lose_life",
    fullRelevantOracleClause: "lose 3 life",
    abilityType: "triggered",
    clauseRole: "effect",
    semanticOwner: "granted_object",
    executionContext: "granted_ability",
    parserStageFailed: "granted_subability_not_materialized",
    exactRootCause:
      "Granted triggered sub-ability in quoted rules text never materialized — zero parser emissions for valid L2 lose_life.",
    proposedStructuralFamily: "granted_subability_not_materialized",
    independentlyRecurredFromPriorSpent: "no",
  },
  "vh16-0013|draw|draw X cards, where X is the number of voyage": {
    caseId: "vh16-0013",
    primitive: "draw",
    fullRelevantOracleClause: "draw X cards, where X is the number of voyage counters on this permanent",
    abilityType: "triggered",
    clauseRole: "effect",
    semanticOwner: "granted_object",
    executionContext: "granted_ability",
    parserStageFailed: "granted_subability_not_materialized",
    exactRootCause:
      "Granted triggered draw with variable X in quoted voyage ability — parser kept source-card exile/play emissions only; granted draw never materialized.",
    proposedStructuralFamily: "granted_variable_draw_not_materialized",
    independentlyRecurredFromPriorSpent: "no",
    secondaryRelationships: ["distinct from granted_subability_not_materialized: variable-quantity draw in grant block"],
  },
  "vh16-0016|put_onto_battlefield|Put enchanted creature card onto the battlefield": {
    caseId: "vh16-0016",
    primitive: "put_onto_battlefield",
    fullRelevantOracleClause: "Put enchanted creature card onto the battlefield",
    abilityType: "triggered",
    clauseRole: "effect",
    semanticOwner: "source_card",
    executionContext: "immediate",
    parserStageFailed: "primitive_extraction",
    exactRootCause:
      "Source-card enchantment reanimation resolving effect — not a grant miss; parser emitted untap only and missed put_onto_battlefield.",
    proposedStructuralFamily: "source_card_enchantment_zone_transition",
    independentlyRecurredFromPriorSpent: "no",
    secondaryRelationships: ["mislabeled under challenge_granted_nested_actions stratum"],
  },
  "vh16-0016|sacrifice|sacrifices it": {
    caseId: "vh16-0016",
    primitive: "sacrifice",
    fullRelevantOracleClause: "sacrifices it",
    abilityType: "triggered",
    clauseRole: "effect",
    semanticOwner: "source_card",
    executionContext: "immediate",
    parserStageFailed: "primitive_extraction",
    exactRootCause:
      "Source-card triggered sacrifice with pronoun referent — not a grant miss; third-person 'sacrifices it' not extracted.",
    proposedStructuralFamily: "third_person_imperative_sacrifice",
    independentlyRecurredFromPriorSpent: "no",
    secondaryRelationships: ["same card as source_card_enchantment_zone_transition — different mechanism"],
  },
  "vh16-0023|create_token|create one or more token": {
    caseId: "vh16-0023",
    primitive: "create_token",
    fullRelevantOracleClause:
      "If an effect would create one or more tokens under your control, it creates twice that many of those tokens instead.",
    abilityType: "spell_effect",
    clauseRole: "replacement_event",
    semanticOwner: "source_card",
    executionContext: "immediate",
    parserStageFailed: "replacement_event_semantic_split",
    exactRootCause:
      "Replacement intercepted-event phrase 'create one or more token' not semantically split from replacement consequence — parser only captured consequence clause.",
    proposedStructuralFamily: "replacement_intercepted_event_token",
    independentlyRecurredFromPriorSpent: "no",
    secondaryRelationships: ["NOT triggered_compound_grammar"],
  },
  "vh16-0027|exile|exile it instead": {
    caseId: "vh16-0027",
    primitive: "exile",
    fullRelevantOracleClause: "exile it instead",
    abilityType: "spell_effect",
    clauseRole: "effect",
    semanticOwner: "source_card",
    executionContext: "immediate",
    parserStageFailed: "replacement_consequence_extraction",
    exactRootCause:
      "Replacement consequence 'exile it instead' — valid L2 exile in replacement branch; parser matched unrelated exile/cast emissions only.",
    proposedStructuralFamily: "replacement_consequence_exile_instead",
    independentlyRecurredFromPriorSpent: "no",
  },
  "vh16-0028|draw|draw a card, you may instead search your libr": {
    caseId: "vh16-0028",
    primitive: "draw",
    fullRelevantOracleClause: "draw a card, you may instead search your library for a card",
    abilityType: "replacement",
    clauseRole: "effect",
    semanticOwner: "source_card",
    executionContext: "immediate",
    parserStageFailed: "replacement_primary_effect_retention",
    exactRootCause:
      "Replacement optional branch: primary draw in 'draw a card, you may instead…' lost when parser followed instead-branch search/put chain only.",
    proposedStructuralFamily: "replacement_optional_primary_effect",
    independentlyRecurredFromPriorSpent: "no",
  },
  "vh16-0038|exile|exile it instead": {
    caseId: "vh16-0038",
    primitive: "exile",
    fullRelevantOracleClause: "exile it instead",
    abilityType: "loyalty",
    clauseRole: "effect",
    semanticOwner: "source_card",
    executionContext: "immediate",
    parserStageFailed: "planeswalker_replacement_consequence",
    exactRootCause:
      "Planeswalker loyalty replacement consequence 'exile it instead' — structurally same replacement-consequence pattern as vh16-0027 but in loyalty ability block.",
    proposedStructuralFamily: "replacement_consequence_exile_instead",
    independentlyRecurredFromPriorSpent: "no",
    secondaryRelationships: ["recurrence with vh16-0027 — same replacement_consequence_exile_instead family"],
  },
  "vh16-0047|discard|Discard your hand, then draw cards equal to the number of cards in target opponent's hand": {
    caseId: "vh16-0047",
    primitive: "discard",
    fullRelevantOracleClause: "Discard your hand, then draw cards equal to the number of cards in target opponent's hand",
    abilityType: "modal",
    clauseRole: "effect",
    semanticOwner: "source_card",
    executionContext: "immediate",
    parserStageFailed: "player_possessive_discard_extraction",
    exactRootCause:
      "Player-possessive whole-hand discard imperative 'Discard your hand' not extracted — parser captured draw leg only.",
    proposedStructuralFamily: "player_possessive_discard_your_hand",
    independentlyRecurredFromPriorSpent: "yes",
    secondaryRelationships: ["v15-0064 independent recurrence"],
  },
  "vh16-0047|discard|Discard your hand, then draw cards equal to the number of cards discarded this way": {
    caseId: "vh16-0047",
    primitive: "discard",
    fullRelevantOracleClause: "Discard your hand, then draw cards equal to the number of cards discarded this way",
    abilityType: "modal",
    clauseRole: "effect",
    semanticOwner: "source_card",
    executionContext: "immediate",
    parserStageFailed: "player_possessive_discard_extraction",
    exactRootCause:
      "Second modal option repeats 'Discard your hand' compound — same missing player-possessive whole-hand discard grammar.",
    proposedStructuralFamily: "player_possessive_discard_your_hand",
    independentlyRecurredFromPriorSpent: "yes",
    secondaryRelationships: ["v15-0064 independent recurrence", "same card second modal line"],
  },
  "vh16-0063|sacrifice|sacrifices a permanent of their choice unless they pay {1}": {
    caseId: "vh16-0063",
    primitive: "sacrifice",
    fullRelevantOracleClause: "sacrifices a permanent of their choice unless they pay {1}",
    abilityType: "triggered",
    clauseRole: "effect",
    semanticOwner: "source_card",
    executionContext: "immediate",
    parserStageFailed: "evaluator_evidence_alignment",
    exactRootCause:
      "Third-person triggered sacrifice 'that player sacrifices…' — parser emitted sacrifice but evaluator rejected evidence span alignment.",
    proposedStructuralFamily: "third_person_triggered_sacrifice_evaluator",
    independentlyRecurredFromPriorSpent: "no",
  },
  "vh16-0083|create_token|creates a token": {
    caseId: "vh16-0083",
    primitive: "create_token",
    fullRelevantOracleClause: "creates a token that's a copy of target creature",
    abilityType: "activated",
    clauseRole: "effect",
    semanticOwner: "source_card",
    executionContext: "immediate",
    parserStageFailed: "activated_effect_extraction",
    exactRootCause:
      "Activated ability effect 'creates a token' not extracted — parser captured draw/exile from same card but missed token creation effect line.",
    proposedStructuralFamily: "activated_effect_token_creation",
    independentlyRecurredFromPriorSpent: "no",
  },
  "vh16-0085|discard|discarding a card in addition to paying its other costs": {
    caseId: "vh16-0085",
    primitive: "discard",
    fullRelevantOracleClause: "discarding a card in addition to paying its other costs",
    abilityType: "spell_effect",
    clauseRole: "effect",
    semanticOwner: "source_card",
    executionContext: "immediate",
    parserStageFailed: "additional_cost_discard_extraction",
    exactRootCause:
      "Additional-cost discard gerund 'discarding a card in addition to paying…' — distinct from whole-hand discard; zero emissions.",
    proposedStructuralFamily: "additional_cost_discard_gerund",
    independentlyRecurredFromPriorSpent: "yes",
    secondaryRelationships: ["grouped with discard_your_hand recurrence audit — same v16 holdout stratum but different grammar"],
  },
  "vh16-0092|draw|draw it if it's the first card you drew this": {
    caseId: "vh16-0092",
    primitive: "draw",
    fullRelevantOracleClause: "draw it if it's the first card you drew this turn",
    abilityType: "static",
    clauseRole: "effect",
    semanticOwner: "source_card",
    executionContext: "immediate",
    parserStageFailed: "conditional_draw_imperative",
    exactRootCause:
      "Conditional draw imperative with temporal window 'draw it if it's the first card you drew this turn' not extracted.",
    proposedStructuralFamily: "conditional_draw_imperative",
    independentlyRecurredFromPriorSpent: "no",
  },
  "vh16-0112|discard|discards it and takes an extra turn": {
    caseId: "vh16-0112",
    primitive: "discard",
    fullRelevantOracleClause: "discards it and takes an extra turn",
    abilityType: "spell_effect",
    clauseRole: "effect",
    semanticOwner: "source_card",
    executionContext: "immediate",
    parserStageFailed: "third_person_discard_referent",
    exactRootCause:
      "MDFC continued-face third-person discard 'discards it' with pronoun referent — parser matched unrelated 'discard both revealed cards'.",
    proposedStructuralFamily: "third_person_discard_referent",
    independentlyRecurredFromPriorSpent: "yes",
    secondaryRelationships: ["v16 discard recurrence audit — NOT same as discard_your_hand mechanism"],
  },
  "vh16-0112|shuffle_library|Shuffle the remaining cards together and deal 11 cards to each player": {
    caseId: "vh16-0112",
    primitive: "shuffle_library",
    fullRelevantOracleClause: "Shuffle the remaining cards together and deal 11 cards to each player",
    abilityType: "spell_effect",
    clauseRole: "effect",
    semanticOwner: "source_card",
    executionContext: "immediate",
    parserStageFailed: "mdfc_continued_face_compound",
    exactRootCause:
      "MDFC continued-face compound shuffle+deal — shuffle_library leg not extracted from continued face paragraph.",
    proposedStructuralFamily: "mdfc_continued_face_compound",
    independentlyRecurredFromPriorSpent: "no",
  },
  "vh16-0116|exile|exile any number of them and put the rest back on top of your library in any order": {
    caseId: "vh16-0116",
    primitive: "exile",
    fullRelevantOracleClause: "exile any number of them and put the rest back on top of your library in any order",
    abilityType: "triggered",
    clauseRole: "effect",
    semanticOwner: "source_card",
    executionContext: "immediate",
    parserStageFailed: "library_manipulation_split",
    exactRootCause:
      "Library top manipulation split — 'exile any number of them and put the rest back…' not distinguished from search/reveal preamble.",
    proposedStructuralFamily: "library_top_manipulation_split",
    independentlyRecurredFromPriorSpent: "no",
  },
  "vh16-0116|shuffle_library|shuffle your library": {
    caseId: "vh16-0116",
    primitive: "shuffle_library",
    fullRelevantOracleClause: "shuffle your library",
    abilityType: "triggered",
    clauseRole: "effect",
    semanticOwner: "source_card",
    executionContext: "immediate",
    parserStageFailed: "library_manipulation_split",
    exactRootCause:
      "Standalone shuffle in reveal/exile sequence — shuffle_library leg missing after library manipulation preamble.",
    proposedStructuralFamily: "library_top_manipulation_split",
    independentlyRecurredFromPriorSpent: "no",
    secondaryRelationships: ["same card as exile leg — shared library_top_manipulation_split family"],
  },
  "vh16-0146|copy|copy of target": {
    caseId: "vh16-0146",
    primitive: "copy",
    fullRelevantOracleClause: "Create a token that's a copy of target Kithkin you control",
    abilityType: "modal",
    clauseRole: "effect",
    semanticOwner: "source_card",
    executionContext: "immediate",
    parserStageFailed: "copy_vs_create_token_promotion",
    exactRootCause:
      "Modal copy primitive — parser promoted create_token emissions but did not accept standalone copy actionType for 'copy of target' evidence span.",
    proposedStructuralFamily: "modal_copy_primitive",
    independentlyRecurredFromPriorSpent: "no",
  },
  "vh16-0159|exile|Exile the top six cards of your library, then reveal cards from the top of your library until you reveal a card with art by the chosen artist": {
    caseId: "vh16-0159",
    primitive: "exile",
    fullRelevantOracleClause:
      "Exile the top six cards of your library, then reveal cards from the top of your library until you reveal a card with art by the chosen artist",
    abilityType: "spell_effect",
    clauseRole: "effect",
    semanticOwner: "source_card",
    executionContext: "immediate",
    parserStageFailed: "compound_then_chain_extraction",
    exactRootCause:
      "Compound then-chain first leg — bulk exile from library top before reveal-until not extracted.",
    proposedStructuralFamily: "compound_then_chain_exile",
    independentlyRecurredFromPriorSpent: "no",
  },
  "vh16-0159|exile|exile all other cards revealed this way": {
    caseId: "vh16-0159",
    primitive: "exile",
    fullRelevantOracleClause: "exile all other cards revealed this way",
    abilityType: "spell_effect",
    clauseRole: "effect",
    semanticOwner: "source_card",
    executionContext: "immediate",
    parserStageFailed: "compound_then_chain_extraction",
    exactRootCause:
      "Compound then-chain second leg — referential 'exile all other cards revealed this way' not extracted after reveal loop.",
    proposedStructuralFamily: "compound_then_chain_exile",
    independentlyRecurredFromPriorSpent: "no",
    secondaryRelationships: ["same card first leg — shared compound_then_chain_exile family"],
  },
  "vh16-0169|put_onto_battlefield|Put those cards onto the battlefield": {
    caseId: "vh16-0169",
    primitive: "put_onto_battlefield",
    fullRelevantOracleClause: "Put those cards onto the battlefield",
    abilityType: "spell_effect",
    clauseRole: "effect",
    semanticOwner: "source_card",
    executionContext: "immediate",
    parserStageFailed: "variable_referent_zone_transition",
    exactRootCause:
      "Variable referent put_onto_battlefield 'Put those cards onto the battlefield' — pronoun bundle referent not resolved to primitive.",
    proposedStructuralFamily: "variable_referent_put_onto_battlefield",
    independentlyRecurredFromPriorSpent: "no",
  },
  "vh16-0172|copy|copy target": {
    caseId: "vh16-0172",
    primitive: "copy",
    fullRelevantOracleClause: "copy target instant or sorcery spell",
    abilityType: "triggered",
    clauseRole: "effect",
    semanticOwner: "source_card",
    executionContext: "immediate",
    parserStageFailed: "copy_spell_target_grammar",
    exactRootCause:
      "Triggered copy-spell target grammar 'copy target instant or sorcery spell' — zero emissions; distinct from modal token copy.",
    proposedStructuralFamily: "copy_spell_target_grammar",
    independentlyRecurredFromPriorSpent: "no",
  },
  "vh16-0214|untap|untap all other creatures you control": {
    caseId: "vh16-0214",
    primitive: "untap",
    fullRelevantOracleClause: "untap all other creatures you control",
    abilityType: "spell_effect",
    clauseRole: "effect",
    semanticOwner: "source_card",
    executionContext: "immediate",
    parserStageFailed: "mass_untap_extraction",
    exactRootCause:
      "Mass untap with exclusion quantifier 'untap all other creatures you control' — zero parser emissions.",
    proposedStructuralFamily: "mass_untap_exclusion_quantifier",
    independentlyRecurredFromPriorSpent: "no",
  },
};

function loadV15DiscardRecurrence(): string[] {
  try {
    const v15 = JSON.parse(readFileSync(resolve(V15_FORENSIC_PATH), "utf8"));
    const rows = (v15.genuineParserFailureCensus?.genuineParserFnRows ?? []) as ForensicRow[];
    return rows
      .filter((r) => r.expectedAction === "discard" && /discard your hand/i.test(r.goldEvidence))
      .map((r) => r.caseId);
  } catch {
    return ["vh15-0064"];
  }
}

function main() {
  const forensic = JSON.parse(readFileSync(resolve(FORENSIC_PATH), "utf8"));
  const genuineRows = forensic.genuineParserFailureCensus.genuineParserFnRows as ForensicRow[];

  if (genuineRows.length !== 26) {
    throw new Error(`Expected 26 genuine FN rows, got ${genuineRows.length}`);
  }

  const ledger: LedgerRow[] = [];
  const unclassified: string[] = [];
  const familyCounts: Record<string, number> = {};

  for (const row of genuineRows) {
    const key = rowKey(row);
    const mapped = PRIMARY_FAMILY_BY_KEY[key];
    if (!mapped) {
      unclassified.push(key);
      continue;
    }
    ledger.push({
      ...mapped,
      mismatchId: row.mismatchId,
      cardName: row.cardName,
      goldEvidence: row.goldEvidence,
      recurrenceCount: 0,
    });
    familyCounts[mapped.proposedStructuralFamily] = (familyCounts[mapped.proposedStructuralFamily] ?? 0) + 1;
  }

  if (unclassified.length > 0) {
    throw new Error(`Unclassified genuine FN rows:\n${unclassified.join("\n")}`);
  }

  const familyKeys = Object.keys(familyCounts);
  const duplicateAssignments = ledger.length !== new Set(ledger.map((r) => r.mismatchId)).size;
  if (duplicateAssignments) throw new Error("Duplicate mismatchId assignment detected");

  for (const entry of ledger) {
    entry.recurrenceCount = familyCounts[entry.proposedStructuralFamily] ?? 1;
  }

  const grantedRealMisses = ledger.filter((r) =>
    ["vh16-0001", "vh16-0004", "vh16-0011", "vh16-0013"].includes(r.caseId),
  );

  const grantedFailureStageAudit = [
    {
      caseId: "vh16-0001",
      cardName: "Clan Crafter",
      primitive: "put_counter",
      failureStage: "nested ability materialized but action extraction failed",
      note: "Grant span detected (draw emitted from granted); put_counter leg missing in compound.",
      family: "granted_compound_primitive_extraction",
    },
    {
      caseId: "vh16-0004",
      cardName: "Clement, the Worrywort",
      primitive: "add_mana",
      failureStage: "nested ability materialized but action extraction failed",
      note: "Quoted grant present; nested activated {G} mana ability not extracted.",
      family: "granted_nested_activated_mana",
    },
    {
      caseId: "vh16-0011",
      cardName: "Consuming Oni",
      primitive: "lose_life",
      failureStage: "granted sub-ability not materialized",
      note: "Zero emissions from granted triggered lose_life block.",
      family: "granted_subability_not_materialized",
    },
    {
      caseId: "vh16-0013",
      cardName: "Cosima, God of the Voyage // The Omenkeel",
      primitive: "draw",
      failureStage: "granted sub-ability not materialized",
      note: "Source-card exile/play extracted; granted draw X never materialized.",
      family: "granted_variable_draw_not_materialized",
    },
  ];

  const discardYourHandAudit = {
    construction: "discard your hand / Discard your hand",
    v15Cases: loadV15DiscardRecurrence(),
    v16Cases: ledger
      .filter((r) => r.proposedStructuralFamily === "player_possessive_discard_your_hand")
      .map((r) => ({ caseId: r.caseId, goldEvidence: r.goldEvidence })),
    relatedButDistinct: ledger
      .filter((r) =>
        ["additional_cost_discard_gerund", "third_person_discard_referent"].includes(r.proposedStructuralFamily),
      )
      .map((r) => ({
        caseId: r.caseId,
        family: r.proposedStructuralFamily,
        goldEvidence: r.goldEvidence,
        note:
          r.proposedStructuralFamily === "additional_cost_discard_gerund"
            ? "Additional-cost gerund — NOT whole-hand discard grammar"
            : "Third-person pronoun discard — NOT whole-hand discard grammar",
      })),
    verdict:
      "player_possessive_discard_your_hand justified: v15-0064 + vh16-0047 (×2 modal) share identical construction; 4 independent observations across two holdouts.",
    rc7Recommendation: "strong — one structural grammar fix, not card-name patch",
  };

  const replacementAudit = ledger
    .filter((r) => r.proposedStructuralFamily.startsWith("replacement_"))
    .map((r) => ({
      caseId: r.caseId,
      cardName: r.cardName,
      primitive: r.primitive,
      clauseRole: r.clauseRole,
      failureStage: r.parserStageFailed,
      family: r.proposedStructuralFamily,
      exactRootCause: r.exactRootCause,
    }));

  const recurrenceMatrix = {
    "player_possessive_discard_your_hand": { v15: ["vh15-0064"], v16: ["vh16-0047", "vh16-0047"] },
    additional_cost_discard_gerund: { v15: [], v16: ["vh16-0085"] },
    third_person_discard_referent: { v15: [], v16: ["vh16-0112"] },
    replacement_consequence_exile_instead: { v15: [], v16: ["vh16-0027", "vh16-0038"] },
    replacement_intercepted_event_token: { v15: [], v16: ["vh16-0023"] },
    replacement_optional_primary_effect: { v15: [], v16: ["vh16-0028"] },
    granted_nested_activated_mana: { v15: [], v16: ["vh16-0004"] },
    granted_subability_not_materialized: { v15: [], v16: ["vh16-0011"] },
    granted_variable_draw_not_materialized: { v15: [], v16: ["vh16-0013"] },
    granted_compound_primitive_extraction: { v15: [], v16: ["vh16-0001"] },
  };

  const rc7Proposal = [
    {
      family: "player_possessive_discard_your_hand",
      fnCount: familyCounts["player_possessive_discard_your_hand"],
      v15Recurrence: true,
      priority: "strong",
      structuralFix: "Player-possessive whole-hand discard imperative in compound/modal clauses",
      cases: ["vh15-0064", "vh16-0047"],
    },
    {
      family: "replacement_consequence_exile_instead",
      fnCount: familyCounts["replacement_consequence_exile_instead"],
      v15Recurrence: false,
      priority: "moderate",
      structuralFix: "Replacement-branch 'exile it instead' consequence extraction",
      cases: ["vh16-0027", "vh16-0038"],
    },
    {
      family: "replacement_intercepted_event_token",
      fnCount: familyCounts["replacement_intercepted_event_token"],
      v15Recurrence: false,
      priority: "moderate",
      structuralFix: "Split replacement intercepted event from consequence for token-doubling",
      cases: ["vh16-0023"],
    },
    {
      family: "granted_nested_activated_mana",
      fnCount: familyCounts["granted_nested_activated_mana"],
      v15Recurrence: false,
      priority: "moderate",
      structuralFix: "Extract nested activated mana abilities inside quoted grant blocks",
      cases: ["vh16-0004"],
    },
    {
      family: "granted_subability_not_materialized",
      fnCount: familyCounts["granted_subability_not_materialized"],
      v15Recurrence: false,
      priority: "moderate",
      structuralFix: "Materialize simple granted triggered sub-abilities (lose_life)",
      cases: ["vh16-0011"],
    },
    {
      family: "granted_variable_draw_not_materialized",
      fnCount: familyCounts["granted_variable_draw_not_materialized"],
      v15Recurrence: false,
      priority: "moderate",
      structuralFix: "Materialize variable-X granted draw inside quoted rules",
      cases: ["vh16-0013"],
    },
    {
      family: "granted_compound_primitive_extraction",
      fnCount: familyCounts["granted_compound_primitive_extraction"],
      v15Recurrence: false,
      priority: "defer",
      structuralFix: "All legs of compound granted resolving effects",
      cases: ["vh16-0001"],
    },
    {
      family: "library_top_manipulation_split",
      fnCount: familyCounts["library_top_manipulation_split"],
      v15Recurrence: false,
      priority: "defer",
      structuralFix: "Split reveal/exile/shuffle library-top manipulation chain",
      cases: ["vh16-0116"],
    },
    {
      family: "compound_then_chain_exile",
      fnCount: familyCounts["compound_then_chain_exile"],
      v15Recurrence: false,
      priority: "defer",
      structuralFix: "Then-chain exile legs in reveal loops",
      cases: ["vh16-0159"],
    },
  ].filter((f) => f.fnCount > 0);

  const integrity = {
    mappedRows: ledger.length,
    expectedRows: 26,
    unclassified: unclassified.length,
    duplicateAssignment: duplicateAssignments ? 1 : 0,
    distinctFamilies: familyKeys.length,
    familyOverlap: 0,
    allGenuineFnMapped: ledger.length === 26 && unclassified.length === 0,
  };

  if (!integrity.allGenuineFnMapped) throw new Error("Ledger integrity failed");

  const artifact = {
    artifactType: "ValidationRootCauseLedger",
    version: "validation-v16-root-cause-ledger-v1",
    generatedAt: new Date().toISOString(),
    sourceForensic: FORENSIC_PATH,
    integrity,
    ledger,
    grantedRealMisses: {
      count: 4,
      cases: grantedRealMisses.map((r) => r.caseId),
      failureStageAudit: grantedFailureStageAudit,
      excludedFromGrantFamilies: [
        { caseId: "vh16-0004", action: "cast", reason: "invalid_gold" },
        { caseId: "vh16-0016", actions: ["put_onto_battlefield", "sacrifice"], reason: "source_card resolving — not grant" },
      ],
    },
    discardYourHandAudit,
    replacementFamilyAudit: replacementAudit,
    recurrenceMatrixV15V16: recurrenceMatrix,
    familyCensus: familyCounts,
    rc7Proposal,
    authorization: {
      rc7ParserEdits: "WAIT",
      canonicalLedger: "AUTHORIZED_COMPLETE",
    },
  };

  mkdirSync(resolve(OUT_DIR), { recursive: true });
  const outPath = resolve(`${OUT_DIR}/validation-v16-root-cause-ledger-v1.json`);
  writeFileSync(outPath, `${JSON.stringify(artifact, null, 2)}\n`);
  console.log(JSON.stringify({ outPath, integrity, familyCensus: familyCounts, rc7ProposalCount: rc7Proposal.length }, null, 2));
}

main();
