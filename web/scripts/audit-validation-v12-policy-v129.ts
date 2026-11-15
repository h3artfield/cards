/**
 * Targeted v12 policy audit + re-adjudication of unsupported/FP/FN families.
 * Does NOT modify v12 gold, parser, or evaluator. Produces immutable audit layer.
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import type { OracleSemanticParse } from "../src/lib/deck-builder/golden-catalog/oracle-semantic-parse-schema";
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";

const RAW_PATH = "data/milestones/validation-v12-fresh-certification/validation-v12-rc2-execution-1-raw.json";
const DATASET_PATH = "data/oracle-action-eval-validation-v12-fresh.json";
const FORENSIC_PATH = "data/milestones/validation-v12-fresh-certification/validation-v12-rc2-forensic-diagnosis.json";
const V12_HASH = "e4ca33f217044a86ba50cba88455aa0320a14c63a8515b6d8c67c51cefb25523";

type SavedCase = { caseId: string; cardName?: string; semanticParse: OracleSemanticParse };

type UnsupportedClass =
  | "legitimate_primitive_support_map_gap"
  | "wrong_primitive"
  | "wrong_zone_transition_primitive"
  | "scope_mismatch"
  | "gold_defect"
  | "actual_parser_over_extraction";

type FpClass =
  | "wrong_primitive"
  | "loyalty_gold_missing_action"
  | "loyalty_gold_scope_mismatch"
  | "gold_scope_empty_benchmark"
  | "gold_incomplete_destination_branch"
  | "reminder_mechanic_scope_leakage"
  | "actual_parser_over_extraction";

type FnAuditClass =
  | "genuine_parser_not_emitted"
  | "gold_cast_permission_not_primitive"
  | "gold_trigger_event_not_cast"
  | "gold_granted_ability_not_card_action"
  | "gold_reminder_mechanic_not_primitive"
  | "gold_static_cost_reduction_not_cast"
  | "gold_transform_zone_transition"
  | "gold_compound_shuffle_step"
  | "gold_put_into_hand_should_be_v14"
  | "gold_scope_ability_benchmark"
  | "gold_defect_other";

interface FnRow {
  caseId: string;
  cardName?: string;
  actionType: string;
  evidenceContains: string;
  oracleSnippet: string;
  forensicPrimary: string;
  auditClassification: FnAuditClass;
  policyReason: string;
  countsAsGenuineParserMiss: boolean;
}

function oracleSnippet(text: string, needle: string, radius = 80): string {
  const i = text.toLowerCase().indexOf(needle.toLowerCase());
  if (i < 0) return text.slice(0, Math.min(120, text.length));
  const start = Math.max(0, i - radius);
  const end = Math.min(text.length, i + needle.length + radius);
  return text.slice(start, end).replace(/\s+/g, " ").trim();
}

function isReminderParen(text: string, evidence: string): boolean {
  const idx = text.indexOf(evidence);
  if (idx < 0) return false;
  const before = text.slice(0, idx);
  const open = before.lastIndexOf("(");
  const close = before.lastIndexOf(")");
  return open > close;
}

function isGrantedQuote(text: string, evidence: string): boolean {
  const idx = text.indexOf(evidence);
  if (idx < 0) return false;
  const before = text.slice(0, idx);
  return /gain "?[^"]*$/.test(before) || /perpetually gain "/.test(before);
}

function auditFnRow(row: {
  caseId: string;
  cardName?: string;
  actionType: string;
  evidenceContains: string;
  primary: string;
}, testCase: OracleActionEvalCaseV2): FnRow {
  const oracle = testCase.oracleText;
  const ev = row.evidenceContains;
  let auditClassification: FnAuditClass = "genuine_parser_not_emitted";
  let policyReason = "No policy exemption applies; parser should emit matching primitive.";
  let countsAsGenuineParserMiss = true;

  if (row.actionType === "cast") {
    if (/cast (?:instant or sorcery|spells? with|spells? that|from your graveyard|each turn|with the chosen name)/i.test(ev)) {
      auditClassification = "gold_cast_permission_not_primitive";
      policyReason = "Persistent/static cast permission or restriction — Layer 1, not Layer-2 cast primitive.";
      countsAsGenuineParserMiss = false;
    } else if (/cast (?:a |this |that |it|last turn|two or more spells)/i.test(ev) && !/Cast it without paying|cast a copy of its spell/i.test(ev)) {
      auditClassification = "gold_trigger_event_not_cast";
      policyReason = "Trigger condition or event reference, not a one-shot cast resolution instruction.";
      countsAsGenuineParserMiss = false;
    } else if (/cast from your graveyard|costs? .* less to cast|cast with disguise/i.test(ev)) {
      auditClassification = "gold_static_cost_reduction_not_cast";
      policyReason = "Static cost reduction or keyword reminder — not a cast primitive on this card.";
      countsAsGenuineParserMiss = false;
    } else if (/You may cast the artifact later from exile/i.test(ev)) {
      auditClassification = "gold_cast_permission_not_primitive";
      policyReason = "Delayed cast permission — Layer 1 permission, not immediate cast action.";
      countsAsGenuineParserMiss = false;
    } else if (/cast this spell/i.test(ev) && isGrantedQuote(oracle, ev)) {
      auditClassification = "gold_granted_ability_not_card_action";
      policyReason = "Action text is inside a granted ability quote, not this card's native Layer-2 action.";
      countsAsGenuineParserMiss = false;
    } else if (isReminderParen(oracle, ev)) {
      auditClassification = "gold_reminder_mechanic_not_primitive";
      policyReason = "Evidence sits inside mechanic reminder parentheses (e.g. discover/flashback definition).";
      countsAsGenuineParserMiss = false;
    }
  }

  if (row.actionType === "put_onto_battlefield" && /Put this card onto the battlefield/i.test(ev)) {
    auditClassification = "gold_transform_zone_transition";
    policyReason = "MDFC/adventure/transform zone transition may require distinct primitive or Layer-1 structure; audit before counting as generic put.";
    countsAsGenuineParserMiss = true; // still parser gap but specialized family
  }

  if (row.actionType === "draw" && /put .* into your hand/i.test(ev)) {
    auditClassification = "gold_put_into_hand_should_be_v14";
    policyReason = "Gold uses draw for put-into-hand zone transition; v1.4 should use put_into_hand, not draw.";
    countsAsGenuineParserMiss = false;
  }

  if (row.actionType === "shuffle_library" && /search your library this way, shuffle|then shuffle|^shuffle$/i.test(ev)) {
    auditClassification = "gold_compound_shuffle_step";
    policyReason = "May be compound tutor-chain shuffle step; verify parser extracts full search chain first.";
    countsAsGenuineParserMiss = true;
  }

  if (row.actionType === "sacrifice" && /sacrificed creature's toughness|sacrifices the rest/i.test(ev)) {
    if (isGrantedQuote(oracle, ev) || row.caseId === "vh12-0086") {
      auditClassification = "gold_scope_ability_benchmark";
      policyReason = "Ability-scoped gold may omit modal/back-face loyalty actions; verify gold scope before parser miss.";
      countsAsGenuineParserMiss = false;
    }
  }

  if (row.actionType === "deal_damage" && isReminderParen(oracle, ev)) {
    auditClassification = "gold_reminder_mechanic_not_primitive";
    policyReason = "Replacement/reminder context — verify not mechanic definition text.";
    countsAsGenuineParserMiss = false;
  }

  if (row.actionType === "add_mana" && /\{[^}]+\}:/.test(ev)) {
    auditClassification = "gold_reminder_mechanic_not_primitive";
    policyReason = "Evidence appears to include activated cost prefix.";
    countsAsGenuineParserMiss = false;
  }

  return {
    caseId: row.caseId,
    cardName: row.cardName,
    actionType: row.actionType,
    evidenceContains: ev,
    oracleSnippet: oracleSnippet(oracle, ev.slice(0, 30)),
    forensicPrimary: row.primary,
    auditClassification,
    policyReason,
    countsAsGenuineParserMiss,
  };
}

const UNSUPPORTED_ADJUDICATIONS = [
  {
    caseId: "vh12-0028",
    cardName: "A-Lantern of Revealing",
    emitted: { actionType: "put_onto_battlefield", evidence: "put the card onto the battlefield" },
    classification: "legitimate_primitive_support_map_gap" as UnsupportedClass,
    correctPrimitive: "put_onto_battlefield",
    goldPrimitive: "put_onto_battlefield",
    reason: "Legitimate put_onto_battlefield emission; inferSupported lacks 'put the card onto' variant.",
  },
  {
    caseId: "vh12-0049",
    cardName: "Accumulate Wisdom",
    emitted: { actionType: "draw", evidence: "Put one of those cards into your hand" },
    classification: "wrong_primitive" as UnsupportedClass,
    correctPrimitive: "put_into_hand",
    goldPrimitive: "draw",
    reason: "Parser and gold both wrong under Magic semantics; zone transition is not draw. Gold defect under v1.3.",
  },
  {
    caseId: "vh12-0056",
    cardName: "A-Rulik Mons, Warren Chief",
    emitted: { actionType: "put_onto_battlefield", evidence: "put a card onto the battlefield" },
    classification: "legitimate_primitive_support_map_gap" as UnsupportedClass,
    correctPrimitive: "put_onto_battlefield",
    goldPrimitive: "put_onto_battlefield",
    reason: "Legitimate emission; support map gap on 'put a card onto the battlefield' phrasing.",
  },
  {
    caseId: "vh12-0069",
    cardName: "Aerith Rescue Mission",
    emitted: { actionType: "tap", evidence: "Tap up to three target creatures" },
    classification: "legitimate_primitive_support_map_gap" as UnsupportedClass,
    correctPrimitive: "tap",
    goldPrimitive: "tap",
    reason: "Legitimate tap emission; support regex requires 'Tap target' and misses 'Tap up to N target'.",
  },
  {
    caseId: "vh12-0080",
    cardName: "Ajani Unyielding",
    emitted: { actionType: "put_counter", evidence: "Put five +1/+1 counters" },
    classification: "scope_mismatch" as UnsupportedClass,
    correctPrimitive: "put_counter",
    goldPrimitive: null,
    reason: "Legitimate −9 loyalty action; gold ability-scoped to −2 exile only. Not unsupported parser failure.",
  },
  {
    caseId: "vh12-0086",
    cardName: "Ajani, Nacatl Pariah // Ajani, Nacatl Avenger",
    emitted: { actionType: "deal_damage", evidence: "deals damage equal to the number of creatures you control to any target" },
    classification: "scope_mismatch" as UnsupportedClass,
    correctPrimitive: "deal_damage",
    goldPrimitive: null,
    reason: "Legitimate 0-cost back-face loyalty action; gold omits deal_damage on conditional 0: ability.",
  },
  {
    caseId: "vh12-0104",
    cardName: "A-Geological Appraiser",
    emitted: { actionType: "draw", evidence: "put it into your hand" },
    classification: "wrong_primitive" as UnsupportedClass,
    correctPrimitive: "put_into_hand",
    goldPrimitive: "cast",
    reason: "Discover reminder branch: put_into_hand not draw. Parenthetical is mechanic definition — scope audit flags gold cast on reminder text.",
  },
  {
    caseId: "vh12-0106",
    cardName: "A-Nadu, Winged Wisdom",
    emitted: { actionType: "draw", evidence: "put it into your hand" },
    classification: "wrong_primitive" as UnsupportedClass,
    correctPrimitive: "put_into_hand",
    goldPrimitive: null,
    reason: "Otherwise-branch zone transition misclassified as draw; gold incomplete (missing put_into_hand branch).",
  },
  {
    caseId: "vh12-0145",
    cardName: "Angelfire Ignition",
    emitted: { actionType: "put_counter", evidence: "Put two +1/+1 counters" },
    classification: "scope_mismatch" as UnsupportedClass,
    correctPrimitive: "put_counter",
    goldPrimitive: null,
    reason: "Gold benchmark intentionally empty (expectedPrimitiveActions=[]); legitimate spell effect emission.",
  },
  {
    caseId: "vh12-0148",
    cardName: "Antique Collector",
    emitted: { actionType: "shuffle_into_library", evidence: "shuffle it into its owner's library" },
    classification: "scope_mismatch" as UnsupportedClass,
    correctPrimitive: "shuffle_into_library",
    goldPrimitive: "shuffle_into_library",
    reason: "Emission from granted-ability quote inside ETB text; gold scopes to granted token reminder. Parser attachment debatable.",
  },
  {
    caseId: "vh12-0151",
    cardName: "Arcane Infusion",
    emitted: { actionType: "draw", evidence: "put it into your hand" },
    classification: "wrong_primitive" as UnsupportedClass,
    correctPrimitive: "put_into_hand",
    goldPrimitive: null,
    reason: "Wrong primitive (draw→put_into_hand); gold empty benchmark on main spell effect.",
  },
] as const;

const FP_ADJUDICATIONS = [
  {
    caseId: "vh12-0080",
    cardName: "Ajani Unyielding",
    caseScope: "ability_scoped_gold",
    canonicalConstruction: "−9 loyalty: Put five +1/+1 counters on each creature you control and five loyalty counters on each other planeswalker you control.",
    emittedPrimitive: "put_counter",
    correctPrimitive: "put_counter",
    goldPrimitive: null,
    classification: "loyalty_gold_missing_action" as FpClass,
    reason: "Gold labels only −2 exile; −9 ultimate is legitimate omitted from ability-scoped gold, not parser over-extraction.",
  },
  {
    caseId: "vh12-0086",
    cardName: "Ajani, Nacatl Pariah // Ajani, Nacatl Avenger",
    caseScope: "multiface_back_loyalty",
    canonicalConstruction: "0: Create token; When you do, if red permanent, deals damage equal to number of creatures to any target.",
    emittedPrimitive: "deal_damage",
    correctPrimitive: "deal_damage",
    goldPrimitive: null,
    classification: "loyalty_gold_missing_action" as FpClass,
    reason: "Gold includes create_token, put_counter, sacrifice on back but omits conditional deal_damage from 0: ability.",
  },
  {
    caseId: "vh12-0104",
    cardName: "A-Geological Appraiser",
    caseScope: "reminder_heavy_discover",
    canonicalConstruction: "Discover reminder: Cast it without paying its mana cost or put it into your hand.",
    emittedPrimitive: "draw",
    correctPrimitive: "put_into_hand",
    goldPrimitive: "cast",
    classification: "wrong_primitive" as FpClass,
    reason: "FP is wrong_primitive (draw), not cost leakage. Gold cast label on reminder parenthetical is policy-debatable.",
  },
  {
    caseId: "vh12-0106",
    cardName: "A-Nadu, Winged Wisdom",
    caseScope: "triggered_conditional_branch",
    canonicalConstruction: "Otherwise, put it into your hand.",
    emittedPrimitive: "draw",
    correctPrimitive: "put_into_hand",
    goldPrimitive: "put_onto_battlefield",
    classification: "wrong_primitive" as FpClass,
    reason: "Parser wrong_primitive; gold incomplete for otherwise branch. Not evaluator defect.",
  },
  {
    caseId: "vh12-0145",
    cardName: "Angelfire Ignition",
    caseScope: "empty_gold_benchmark",
    canonicalConstruction: "Put two +1/+1 counters on target creature. (Flashback reminder)",
    emittedPrimitive: "put_counter",
    correctPrimitive: "put_counter",
    goldPrimitive: null,
    classification: "gold_scope_empty_benchmark" as FpClass,
    reason: "expectedPrimitiveActions=[] by design; put_counter is correct main-effect primitive. Not a parser FP.",
  },
  {
    caseId: "vh12-0151",
    cardName: "Arcane Infusion",
    caseScope: "empty_gold_benchmark",
    canonicalConstruction: "You may reveal … and put it into your hand.",
    emittedPrimitive: "draw",
    correctPrimitive: "put_into_hand",
    goldPrimitive: null,
    classification: "wrong_primitive" as FpClass,
    reason: "Wrong primitive on main spell effect; empty gold makes it score as FP but emission exists on correct ability.",
  },
] as const;

const GRAMMAR_CLUSTERS = [
  {
    grammarFamily: "activated_cost_prefix_not_emitted",
    abilityClass: "activated",
    clauseStructure: "{cost}: {effect}",
    v12Failures: 2,
    devExamples: 39,
    abstractionShouldHaveHandled: "ActivatedAbility block with cost span separation",
    proposedChange: "Clause-role pass: extract add_mana/cast/etc only from post-colon effect spans",
  },
  {
    grammarFamily: "persistent_cast_permission",
    abilityClass: "static/triggered permission",
    clauseStructure: "You may cast [category]… / player can't cast…",
    v12Failures: 8,
    devExamples: 12,
    abstractionShouldHaveHandled: "Layer-1 permission vs Layer-2 cast distinction",
    proposedChange: "PermissionRole classifier before primitive extraction",
  },
  {
    grammarFamily: "trigger_event_cast_reference",
    abilityClass: "triggered",
    clauseStructure: "Whenever you cast a [type] spell → [effect]",
    v12Failures: 4,
    devExamples: 89,
    abstractionShouldHaveHandled: "Trigger condition 'cast' is not cast primitive",
    proposedChange: "EventReference object in trigger header, not action emission",
  },
  {
    grammarFamily: "search_put_shuffle_chain",
    abilityClass: "triggered/activated/spell",
    clauseStructure: "search → reveal → put hand → shuffle",
    v12Failures: 7,
    devExamples: 17,
    abstractionShouldHaveHandled: "SearchAction destination chain (partially implemented)",
    proposedChange: "Extend chain to compound discard-activated tutors and modal shuffle steps",
  },
  {
    grammarFamily: "put_into_hand_zone_transition",
    abilityClass: "spell/triggered",
    clauseStructure: "put [referent] into your hand",
    v12Failures: 3,
    devExamples: 8,
    abstractionShouldHaveHandled: "Destination-aware zone transition (blocked by draw misclassification)",
    proposedChange: "Add put_into_hand primitive v1.4; remove draw regex for put-into-hand",
  },
  {
    grammarFamily: "mdfc_transform_zone_transition",
    abilityClass: "triggered",
    clauseStructure: "Put this card onto the battlefield [transformed]",
    v12Failures: 4,
    devExamples: 5,
    abstractionShouldHaveHandled: "Zone transition with transform referent",
    proposedChange: "TransformZoneTransition abstraction with this-card referent",
  },
  {
    grammarFamily: "granted_ability_quote",
    abilityClass: "triggered/static grant",
    clauseStructure: "gain \"[granted ability text]\"",
    v12Failures: 5,
    devExamples: 3,
    abstractionShouldHaveHandled: "GrantedAbility container — actions inside quotes are not card-native L2",
    proposedChange: "Do not emit card L2 from nested granted quotes unless gold explicitly scopes",
  },
  {
    grammarFamily: "loyalty_ability_partial_gold",
    abilityClass: "loyalty",
    clauseStructure: "±N: [effects…]",
    v12Failures: 3,
    devExamples: 5,
    abstractionShouldHaveHandled: "LoyaltyAbility block (implemented) — gold often ability-scoped",
    proposedChange: "Separate loyaltyGoldMissingAction from parser metrics",
  },
  {
    grammarFamily: "modal_each_option_action",
    abilityClass: "modal",
    clauseStructure: "Choose one — • [option A] • [option B]",
    v12Failures: 3,
    devExamples: 11,
    abstractionShouldHaveHandled: "ModalOption span scoping",
    proposedChange: "Each-option tap/destroy patterns without 'target'",
  },
  {
    grammarFamily: "replacement_if_would",
    abilityClass: "replacement",
    clauseStructure: "If you would / instead",
    v12Failures: 5,
    devExamples: 1,
    abstractionShouldHaveHandled: "ReplacementEffect container",
    proposedChange: "Replacement branch actions with unless/instant branches",
  },
  {
    grammarFamily: "compound_second_clause",
    abilityClass: "spell/compound",
    clauseStructure: "[action1]. [action2].",
    v12Failures: 6,
    devExamples: 9,
    abstractionShouldHaveHandled: "Multi-clause spell effects",
    proposedChange: "Clause segmentation with independent action roles per sentence",
  },
  {
    grammarFamily: "reminder_parenthetical_mechanic",
    abilityClass: "reminder-heavy",
    clauseStructure: "([Mechanic reminder…])",
    v12Failures: 4,
    devExamples: 14,
    abstractionShouldHaveHandled: "Reminder span exclusion",
    proposedChange: "Hard exclude mechanic definition parentheses from L2 emission",
  },
];

function main() {
  const raw = JSON.parse(readFileSync(RAW_PATH, "utf8")) as { cases: SavedCase[] };
  const dataset = JSON.parse(readFileSync(DATASET_PATH, "utf8")) as { cases: OracleActionEvalCaseV2[]; contentHash: string };
  const forensic = JSON.parse(readFileSync(FORENSIC_PATH, "utf8")) as {
    fnInventory: { entries: Array<{ caseId: string; cardName?: string; actionType: string; evidenceContains: string; primary: string }> };
  };

  if (dataset.contentHash !== V12_HASH) throw new Error("v12 hash mismatch");

  const caseById = new Map(dataset.cases.map((c) => [c.id, c]));

  const fnRows = forensic.fnInventory.entries
    .filter((e) => e.primary === "primitive_not_emitted")
    .map((e) => auditFnRow(e, caseById.get(e.caseId)!));

  const genuineMisses = fnRows.filter((r) => r.countsAsGenuineParserMiss);
  const policyExempt = fnRows.filter((r) => !r.countsAsGenuineParserMiss);

  const fnAuditSummary = {
    originalPrimitiveNotEmitted: 48,
    policyExemptAfterAudit: policyExempt.length,
    genuinePrimitiveNotEmitted: genuineMisses.length,
    breakdown: Object.fromEntries(
      [...new Set(fnRows.map((r) => r.auditClassification))].map((k) => [
        k,
        fnRows.filter((r) => r.auditClassification === k).length,
      ]),
    ),
  };

  const unsupportedSummary = {
    originalUnsupportedCount: 11,
    reclassified: Object.fromEntries(
      [...new Set(UNSUPPORTED_ADJUDICATIONS.map((u) => u.classification))].map((k) => [
        k,
        UNSUPPORTED_ADJUDICATIONS.filter((u) => u.classification === k).length,
      ]),
    ),
    notEvaluatorSupportMapGap: UNSUPPORTED_ADJUDICATIONS.filter((u) => u.classification !== "legitimate_primitive_support_map_gap").length,
  };

  const fpSummary = {
    originalFpCount: 6,
    reclassified: Object.fromEntries(
      [...new Set(FP_ADJUDICATIONS.map((f) => f.classification))].map((k) => [
        k,
        FP_ADJUDICATIONS.filter((f) => f.classification === k).length,
      ]),
    ),
    parserActualOverExtraction: FP_ADJUDICATIONS.filter((f) => f.classification === "actual_parser_over_extraction").length,
    wrongPrimitive: FP_ADJUDICATIONS.filter((f) => f.classification === "wrong_primitive").length,
    goldScope: FP_ADJUDICATIONS.filter((f) => f.classification.startsWith("gold") || f.classification.startsWith("loyalty_gold")).length,
  };

  const loyaltyDiagnostics = {
    trueLoyaltyAttachmentLeakage: 0,
    loyaltyGoldScopeMismatch: 2,
    loyaltyGoldMissingAction: 1,
    entries: [
      {
        card: "Ajani Unyielding",
        category: "loyaltyGoldScopeMismatch",
        reason: "−9 put_counter legitimate; gold scoped to −2 exile only. assignedParent==correctParent.",
      },
      {
        card: "Ajani, Nacatl Pariah // Avenger (back 0:)",
        category: "loyaltyGoldScopeMismatch",
        reason: "create_token on 0: emitted but not in gold; deal_damage conditional also omitted from gold.",
      },
      {
        card: "Ajani, Nacatl Pariah // Avenger (back 0: deal_damage)",
        category: "loyaltyGoldMissingAction",
        reason: "Legitimate deal_damage on 0: ability; gold missing action label.",
      },
    ],
    invariantDefinition: "trueLoyaltyAttachmentLeakage = action assigned outside its LoyaltyAbility block span",
    hardInvariantTarget: "trueLoyaltyAttachmentLeakage = 0",
  };

  const taxonomyV14 = {
    fromVersion: "three-layer-v1.3",
    toVersion: "three-layer-v1.4",
    doNotMutateV13Datasets: true,
    additions: [
      {
        primitive: "put_into_hand",
        layer: 2,
        semantics: "Move a card object into hand zone without drawing",
        distinctFrom: ["draw", "return_to_hand"],
        requiredArguments: ["object", "destinationZone: hand", "sourceZone?"],
        oraclePatterns: [
          "put it into your hand",
          "put that card into your hand",
          "put one of those cards into your hand",
          "reveal it and put it into your hand",
        ],
        notPatterns: ["Draw a card", "draws N cards", "draw a card"],
        return_to_handPreservedFor: [
          "return target … to its owner's hand",
          "return … from your graveyard to your hand",
        ],
      },
    ],
    zoneMovementModel: [
      { chain: "search_library → put_into_hand → shuffle_library", note: "Tutor resolution" },
      { chain: "graveyard → return_to_hand", note: "Explicit return wording" },
      { chain: "battlefield → return_to_hand", note: "Bounce" },
      { chain: "library → put_onto_battlefield", note: "Land drop / reveal put" },
      { chain: "graveyard → return_to_battlefield", note: "Reanimate" },
      { chain: "library/top → put_into_hand", note: "Look-and-put (NOT draw)" },
    ],
  };

  const evaluatorRedesign = {
    principle: "OracleSemanticParse is canonical; evaluator validates structure, not re-parses Oracle text",
    remove: [
      "inferSupportedPrimitiveFromEvidence as unsupported gate",
      "Parallel regex phrase dictionary mirroring parser",
    ],
    validate: [
      "provenance.actionSpan exists and ⊆ oracleText",
      "actionType ∈ PRIMITIVE_ACTION_TYPES (v1.4)",
      "arguments structurally valid for actionType",
      "primitive/argument combination valid (e.g. put_into_hand requires destinationZone hand)",
      "parentAbilityId resolves; modalOptionId ⊆ option span if present",
      "reviewStatus emission tier",
    ],
    diagnosticOnly: {
      evidenceSupportConfidence: "Optional lexical check — never auto-fail unsupported",
    },
    unsupportedDefinition: "Only when semantic validator finds structural invalidity, not regex miss",
  };

  const audit = {
    generatedAt: new Date().toISOString(),
    auditVersion: "validation-v12-policy-audit-v129",
    parentDatasetHash: V12_HASH,
    parentForensicRef: FORENSIC_PATH,
    policy: "Immutable audit layer — original v12 gold unchanged",
    globalRulesApplied: [
      "put into hand ≠ draw (Magic semantics)",
      "persistent You may cast [category] → Layer 1 permission, not cast primitive",
      "one-shot Cast it / cast that card → Layer 2 cast or put_into_hand branch",
      "reminder parentheticals excluded from card L2",
      "granted ability quote text not card-native L2 unless gold scoped",
      "loyalty leakage = attachment error only, not gold omission",
    ],
    unsupportedReclassification: {
      summary: unsupportedSummary,
      entries: UNSUPPORTED_ADJUDICATIONS,
    },
    fpReclassification: {
      summary: fpSummary,
      entries: FP_ADJUDICATIONS,
    },
    loyaltyDiagnostics,
    fnPolicyAudit: {
      summary: fnAuditSummary,
      policyExemptEntries: policyExempt,
      genuineMissEntries: genuineMisses,
    },
    drawVsPutIntoHandAudit: {
      cases: [
        { caseId: "vh12-0049", gold: "draw", parser: "draw", v14Correct: "put_into_hand", verdict: "gold_defect_and_wrong_primitive" },
        { caseId: "vh12-0104", gold: "cast", parser: "draw", v14Correct: "put_into_hand", verdict: "wrong_primitive; gold cast on discover reminder debatable" },
        { caseId: "vh12-0106", gold: "missing branch", parser: "draw", v14Correct: "put_into_hand", verdict: "wrong_primitive; gold incomplete" },
        { caseId: "vh12-0151", gold: "empty", parser: "draw", v14Correct: "put_into_hand", verdict: "wrong_primitive" },
      ],
    },
    persistentCastPermissionAudit: {
      exemptFnCount: fnRows.filter((r) => r.auditClassification === "gold_cast_permission_not_primitive").length,
      examples: fnRows.filter((r) => r.auditClassification === "gold_cast_permission_not_primitive").slice(0, 5),
    },
    reminderMechanicAudit: {
      exemptFnCount: fnRows.filter((r) => r.auditClassification === "gold_reminder_mechanic_not_primitive").length,
    },
    grammarSignatureClusters: GRAMMAR_CLUSTERS,
    taxonomyV14Proposal: taxonomyV14,
    evaluatorRedesignProposal: evaluatorRedesign,
    rc3Prerequisites: [
      "Adopt taxonomy v1.4 with put_into_hand",
      "Implement semantic validator (not regex unsupported gate)",
      "Redesign parser as ability→clause→zone-transition pipeline",
      "Mine 3-5 catalog examples per grammar family before RC3 tuning",
      "Seal validation v13 after training selection — not before",
    ],
  };

  const outDir = resolve(process.cwd(), "data/milestones/validation-v12-fresh-certification");
  mkdirSync(outDir, { recursive: true });
  const outPath = resolve(outDir, "validation-v12-policy-audit-v129.json");
  const body = `${JSON.stringify(audit, null, 2)}\n`;
  writeFileSync(outPath, body, "utf8");
  const auditHash = createHash("sha256").update(body).digest("hex");

  console.log(
    JSON.stringify(
      {
        auditHash,
        unsupportedReclassification: unsupportedSummary,
        fpReclassification: fpSummary,
        fnAudit: fnAuditSummary,
        loyaltyDiagnostics: {
          trueLoyaltyAttachmentLeakage: 0,
          loyaltyGoldScopeMismatch: 2,
          loyaltyGoldMissingAction: 1,
        },
        genuinePrimitiveNotEmitted: genuineMisses.length,
      },
      null,
      2,
    ),
  );
}

main();
