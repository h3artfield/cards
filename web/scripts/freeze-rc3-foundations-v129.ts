/**
 * Freeze RC3 foundation artifacts before parser tuning or v13 creation.
 * Does NOT modify v12 gold, RC2 parser, blind set, or run parser on v13.
 *
 * Run: cd web && npx tsx scripts/freeze-rc3-foundations-v129.ts
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { OracleSemanticParse } from "../src/lib/deck-builder/golden-catalog/oracle-semantic-parse-schema";
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";
import type { ExpectedPrimitiveAction } from "./audit-oracle-action-eval-cases";
import {
  semanticActionsForMatch,
  type SemanticActionForMatch,
} from "./oracle-action-semantic-matcher";
import { faceIdsEquivalent } from "./oracle-action-unified-matcher";

function levelAMatch(
  exp: ExpectedPrimitiveAction,
  actions: SemanticActionForMatch[],
): SemanticActionForMatch | null {
  for (const a of actions) {
    if (a.actionType !== exp.actionType) continue;
    if (exp.cardFace && !faceIdsEquivalent(a.faceId, exp.cardFace)) continue;
    return a;
  }
  return null;
}

const OUT_DIR = "data/milestones/rc3-foundations";
const V12_PATH = "data/oracle-action-eval-validation-v12-fresh.json";
const V12_HASH = "e4ca33f217044a86ba50cba88455aa0320a14c63a8515b6d8c67c51cefb25523";
const RAW_PATH = "data/milestones/validation-v12-fresh-certification/validation-v12-rc2-execution-1-raw.json";
const POLICY_AUDIT_PATH =
  "data/milestones/validation-v12-fresh-certification/validation-v12-policy-audit-v129.json";
const FORENSIC_PATH =
  "data/milestones/validation-v12-fresh-certification/validation-v12-rc2-forensic-diagnosis.json";
const AGGREGATE_PATH =
  "data/milestones/validation-v12-fresh-certification/validation-v12-rc2-execution-1-aggregate.json";

type CaseScopeType =
  | "full_card"
  | "face"
  | "ability"
  | "modal_option"
  | "clause"
  | "structure_only";

interface CaseScopeEntry {
  caseId: string;
  caseScope: CaseScopeType;
  targetFaceId?: string;
  targetAbilityId?: string;
  targetOptionId?: string;
  targetClauseId?: string;
  certifiedEmptyLayer2?: boolean;
  scopeReason: string;
  goldWithinScope: boolean;
}

interface PolicyAudit {
  parentDatasetHash: string;
  fnPolicyAudit: {
    policyExemptEntries: Array<{
      caseId: string;
      actionType: string;
      evidenceContains: string;
    }>;
    genuineMissEntries: Array<{
      caseId: string;
      cardName?: string;
      actionType: string;
      evidenceContains: string;
      auditClassification: string;
    }>;
  };
  fpReclassification: {
    summary: {
      parserActualOverExtraction: number;
      wrongPrimitive: number;
      goldScope: number;
    };
    entries: Array<{
      caseId: string;
      emittedPrimitive: string;
      correctPrimitive: string;
      classification: string;
    }>;
  };
  unsupportedReclassification: { entries: Array<{ caseId: string; classification: string }> };
  drawVsPutIntoHandAudit: {
    cases: Array<{ caseId: string; gold: string; v14Correct: string; verdict: string }>;
  };
}

interface SavedCase {
  caseId: string;
  semanticParse: OracleSemanticParse;
}


function writeArtifact(name: string, body: unknown): string {
  const json = JSON.stringify(body, null, 2);
  const hash = createHash("sha256").update(json).digest("hex");
  const withHash = { ...(body as object), contentHash: hash };
  const final = JSON.stringify(withHash, null, 2);
  writeFileSync(resolve(OUT_DIR, name), final);
  return hash;
}

function goldEntryKey(caseId: string, actionType: string, evidenceContains: string): string {
  return `${caseId}|${actionType}|${evidenceContains}`;
}

/** Mutually exclusive primary grammar family per genuine miss row. */
const PRIMARY_FAMILY: Record<string, string> = {
  [goldEntryKey("vh12-0008", "discard", "discard your hand")]: "compound_second_clause",
  [goldEntryKey("vh12-0015", "put_onto_battlefield", "Put this card onto the battlefield")]:
    "mdfc_transform_zone_transition",
  [goldEntryKey("vh12-0018", "shuffle_library", "shuffles")]: "search_put_shuffle_chain",
  [goldEntryKey("vh12-0033", "add_mana", "Add {C}")]: "granted_ability_quote",
  [goldEntryKey("vh12-0051", "sacrifice", "sacrificed creature's toughness")]: "replacement_if_would",
  [goldEntryKey("vh12-0071", "tap", "Tap all Spirits")]: "modal_each_option_action",
  [goldEntryKey("vh12-0071", "tap", "Tap all non-Spirit creatures")]: "modal_each_option_action",
  [goldEntryKey("vh12-0077", "put_counter", "put a +1/+1 counter on this token")]: "granted_ability_quote",
  [goldEntryKey("vh12-0093", "return_to_hand", "Return this card from your graveyard to your hand")]:
    "activated_post_colon_effect",
  [goldEntryKey(
    "vh12-0098",
    "put_onto_battlefield",
    "put a creature card from among them onto the battlefield",
  )]: "optional_put_onto_battlefield",
  [goldEntryKey("vh12-0107", "put_onto_battlefield", "Put this card onto the battlefield")]:
    "mdfc_transform_zone_transition",
  [goldEntryKey("vh12-0108", "put_onto_battlefield", "Put this card onto the battlefield")]:
    "mdfc_transform_zone_transition",
  [goldEntryKey("vh12-0110", "put_onto_battlefield", "Put this card onto the battlefield")]:
    "mdfc_transform_zone_transition",
  [goldEntryKey("vh12-0116", "deal_damage", "deals that much damage to any target")]: "replacement_if_would",
  [goldEntryKey("vh12-0123", "search_library", "search your library this way, shuffle")]:
    "search_put_shuffle_chain",
  [goldEntryKey("vh12-0123", "shuffle_library", "shuffle")]: "search_put_shuffle_chain",
  [goldEntryKey("vh12-0125", "search_library", "search your library this way, shuffle")]:
    "search_put_shuffle_chain",
  [goldEntryKey("vh12-0125", "shuffle_library", "shuffle")]: "search_put_shuffle_chain",
  [goldEntryKey(
    "vh12-0126",
    "search_library",
    "Search your library for a Plains card, reveal it, put it into your hand, then shuffle",
  )]: "search_put_shuffle_chain",
  [goldEntryKey(
    "vh12-0126",
    "discard",
    "Discard this card: Search your library for a Plains card, reveal it, put it into your hand, then shuffle",
  )]: "activated_post_colon_effect",
  [goldEntryKey("vh12-0126", "shuffle_library", "then shuffle")]: "search_put_shuffle_chain",
  [goldEntryKey(
    "vh12-0130",
    "return_to_battlefield",
    "Return target artifact or non-Aura enchantment card from your graveyard to the battlefield",
  )]: "zone_transition_return",
  [goldEntryKey("vh12-0131", "return_to_hand", "Return this card from your graveyard to your hand")]:
    "activated_post_colon_effect",
  [goldEntryKey(
    "vh12-0135",
    "discard",
    "Discard two cards: Return this card from your graveyard to the battlefield tapped",
  )]: "activated_post_colon_effect",
  [goldEntryKey("vh12-0144", "sacrifice", "sacrificed when it enters")]: "replacement_if_would",
  [goldEntryKey("vh12-0146", "draw", "Draw a card")]: "granted_ability_quote",
  [goldEntryKey("vh12-0146", "sacrifice", "Sacrifice this token: Draw a card")]: "granted_ability_quote",
  [goldEntryKey("vh12-0147", "gain_life", "gain 3 life")]: "granted_ability_quote",
  [goldEntryKey("vh12-0148", "draw", "Draw a card")]: "granted_ability_quote",
  [goldEntryKey("vh12-0148", "create_token", "Create a colorless Clue artifact token")]: "granted_ability_quote",
  [goldEntryKey("vh12-0148", "sacrifice", "Sacrifice this artifact: Draw a card")]: "granted_ability_quote",
  [goldEntryKey("vh12-0148", "shuffle_library", "you may shuffle")]: "granted_ability_quote",
};

/** Explicit caseScope overrides from policy audit — never infer scope from empty gold alone. */
const CASE_SCOPE_OVERRIDES: Partial<Record<string, Omit<CaseScopeEntry, "caseId" | "goldWithinScope">>> = {
  "vh12-0080": {
    caseScope: "ability",
    targetAbilityId: "loyalty-minus-2-exile",
    scopeReason: "Gold scoped to −2 exile loyalty ability only; −9 ultimate omitted from gold by design.",
  },
  "vh12-0086": {
    caseScope: "ability",
    targetFaceId: "back",
    targetAbilityId: "loyalty-zero-conditional",
    scopeReason: "Back-face 0: loyalty ability partially gold-scoped; deal_damage branch omitted from gold.",
  },
  "vh12-0104": {
    caseScope: "clause",
    scopeReason: "Discover reminder parenthetical is mechanic definition, not card-native Layer-2 scope.",
  },
  "vh12-0106": {
    caseScope: "ability",
    scopeReason: "Triggered conditional branch gold incomplete for otherwise put_into_hand branch.",
  },
  "vh12-0145": {
    caseScope: "full_card",
    scopeReason:
      "Prior empty gold was benchmark defect; main spell effect (put_counter) is in scope under v1.4 audit.",
  },
  "vh12-0151": {
    caseScope: "full_card",
    scopeReason:
      "Prior empty gold was benchmark defect; main spell put_into_hand branch is in scope under v1.4 audit.",
  },
  "vh12-0148": {
    caseScope: "ability",
    scopeReason:
      "Gold scopes ETB investigate; granted-ability quote and token reminder actions require explicit ability/clause scope.",
  },
};

function inferCaseScope(testCase: OracleActionEvalCaseV2): Omit<CaseScopeEntry, "caseId"> {
  const override = CASE_SCOPE_OVERRIDES[testCase.id];
  if (override) {
    return {
      ...override,
      goldWithinScope: (testCase.expectedPrimitiveActions?.length ?? 0) > 0 || override.caseScope === "full_card",
    };
  }

  const gold = (testCase.expectedPrimitiveActions ?? []).filter((g) => !g.negative);
  const hasStructureOnly =
    gold.length === 0 &&
    Boolean((testCase as { expectedStructure?: unknown }).expectedStructure) &&
    !["validation-v12-reminder_heavy_mechanics"].includes(testCase.category ?? "");

  if (hasStructureOnly) {
    return {
      caseScope: "structure_only",
      certifiedEmptyLayer2: true,
      scopeReason:
        "Layer-1 structure benchmark with certified empty Layer-2 gold (expectedStructure present, no primitive gold).",
      goldWithinScope: true,
    };
  }

  if (gold.some((g) => (g as { optionId?: string }).optionId)) {
    const opt = gold.find((g) => (g as { optionId?: string }).optionId) as { optionId?: string };
    return {
      caseScope: "modal_option",
      targetOptionId: opt.optionId,
      scopeReason: "Gold entries carry modal optionId — benchmark scoped to single modal branch.",
      goldWithinScope: true,
    };
  }

  if (gold.some((g) => g.loyaltyCost)) {
    const loyalty = gold.find((g) => g.loyaltyCost);
    return {
      caseScope: "ability",
      targetAbilityId: loyalty?.loyaltyCost ? `loyalty-${loyalty.loyaltyCost}` : undefined,
      scopeReason: "Gold scoped to specific loyalty ability via loyaltyCost.",
      goldWithinScope: true,
    };
  }

  if (testCase.cardFace) {
    return {
      caseScope: "face",
      targetFaceId: testCase.cardFace,
      scopeReason: "Gold scoped to specific card face.",
      goldWithinScope: true,
    };
  }

  if (gold.length === 0) {
    return {
      caseScope: "structure_only",
      certifiedEmptyLayer2: false,
      scopeReason: "Empty gold without structure certification — flagged for v13 gold review; not auto no-action.",
      goldWithinScope: false,
    };
  }

  return {
    caseScope: "full_card",
    scopeReason: "Complete primitive gold within full card oracle text.",
    goldWithinScope: true,
  };
}

interface CorrectedGoldEntry extends ExpectedPrimitiveAction {
  migrationSource?: "v1.3_original" | "v1.4_migration" | "v1.4_gold_completion";
  policyExempt?: boolean;
  exemptReason?: string;
}

function buildCorrectedGold(
  testCase: OracleActionEvalCaseV2,
  policyAudit: PolicyAudit,
  v14Migrations: Map<string, { oldPrimitive: string; newPrimitive: string; policyReason: string }>,
): CorrectedGoldEntry[] {
  const exemptKeys = new Set(
    policyAudit.fnPolicyAudit.policyExemptEntries.map((e) =>
      goldEntryKey(e.caseId, e.actionType, e.evidenceContains),
    ),
  );
  const exemptReasonByKey = new Map(
    policyAudit.fnPolicyAudit.policyExemptEntries.map((e) => [
      goldEntryKey(e.caseId, e.actionType, e.evidenceContains),
      "Policy-exempt: not Layer-2 primitive under v1.4 audit",
    ]),
  );

  const entries: CorrectedGoldEntry[] = [];

  for (const g of testCase.expectedPrimitiveActions ?? []) {
    if (g.negative) continue;
    const key = goldEntryKey(testCase.id, g.actionType, g.evidenceContains);
    if (exemptKeys.has(key)) {
      entries.push({ ...g, policyExempt: true, exemptReason: exemptReasonByKey.get(key) });
      continue;
    }
    const mig = v14Migrations.get(`${testCase.id}:${g.actionType}:${g.evidenceContains}`);
    if (mig) {
      entries.push({
        ...g,
        actionType: mig.newPrimitive as ExpectedPrimitiveAction["actionType"],
        migrationSource: "v1.4_migration",
      });
    } else {
      entries.push({ ...g, migrationSource: "v1.3_original" });
    }
  }

  // v1.4 gold completions for incomplete benchmarks
  if (testCase.id === "vh12-0106") {
    entries.push({
      actionType: "put_into_hand" as ExpectedPrimitiveAction["actionType"],
      evidenceContains: "put it into your hand",
      migrationSource: "v1.4_gold_completion",
    });
  }
  if (testCase.id === "vh12-0151") {
    entries.push({
      actionType: "put_into_hand" as ExpectedPrimitiveAction["actionType"],
      evidenceContains: "put it into your hand",
      migrationSource: "v1.4_gold_completion",
    });
  }
  if (testCase.id === "vh12-0145") {
    entries.push({
      actionType: "put_counter",
      evidenceContains: "Put two +1/+1 counters",
      migrationSource: "v1.4_gold_completion",
    });
  }

  return entries;
}

function isEmissionInScope(
  action: SemanticActionForMatch,
  scope: CaseScopeEntry,
  _parse: OracleSemanticParse,
): boolean {
  if (scope.caseScope === "full_card") return true;

  if (scope.caseScope === "structure_only") {
    return !scope.certifiedEmptyLayer2;
  }

  if (scope.caseScope === "face" && scope.targetFaceId) {
    return faceIdsEquivalent(action.faceId, scope.targetFaceId);
  }

  if (scope.caseScope === "modal_option" && scope.targetOptionId) {
    const key = action.modalOptionKey ?? action.modalOptionId;
    return Boolean(key && (key === scope.targetOptionId || key.endsWith(`.${scope.targetOptionId}`)));
  }

  if (scope.caseScope === "ability") {
    if (scope.targetFaceId && !faceIdsEquivalent(action.faceId, scope.targetFaceId)) return false;
    if (scope.targetAbilityId?.startsWith("loyalty-")) {
      const m = scope.targetAbilityId.match(/loyalty-minus-(\d+)/);
      if (m && action.loyaltyCost) return action.loyaltyCost === `-${m[1]}`;
      if (scope.targetAbilityId === "loyalty-zero-conditional" && action.loyaltyCost === "0") return true;
      return false;
    }
    return false;
  }

  if (scope.caseScope === "clause") return false;

  return true;
}

function computeCorrectedMetrics(
  cases: OracleActionEvalCaseV2[],
  rawById: Map<string, SavedCase>,
  policyAudit: PolicyAudit,
  caseScopes: CaseScopeEntry[],
  v14Migrations: Map<string, { oldPrimitive: string; newPrimitive: string }>,
) {
  const scopeById = new Map(caseScopes.map((s) => [s.caseId, s]));

  let goldPositive = 0;
  let goldExempt = 0;
  let tpPrimitive = 0;
  let fnPrimitive = 0;
  let overExtraction = 0;
  let wrongPrimitive = 0;
  let wrongScopeExcluded = 0;
  let wrongArguments = 0;
  let duplicateEmission = 0;

  const wrongPrimitiveCases: string[] = [];

  for (const testCase of cases) {
    const saved = rawById.get(testCase.id);
    if (!saved) continue;
    const scope = scopeById.get(testCase.id)!;
    const parse = saved.semanticParse;
    const actions = semanticActionsForMatch(parse).filter((a) => a.reviewStatus === "accepted");

    const correctedGold = buildCorrectedGold(testCase, policyAudit, v14Migrations).filter(
      (g) => !g.policyExempt,
    );
    goldPositive += correctedGold.length;
    goldExempt += buildCorrectedGold(testCase, policyAudit, v14Migrations).filter((g) => g.policyExempt).length;

    const matchedActionIndices = new Set<number>();

    for (const exp of correctedGold) {
      const matched = levelAMatch(exp, actions);
      if (matched) {
        // Check wrong primitive: parser emitted different type with same evidence span
        const sameEvidence = actions.find(
          (a) =>
            a.evidenceText.toLowerCase().includes(exp.evidenceContains.toLowerCase().slice(0, 20)) ||
            exp.evidenceContains.toLowerCase().includes(a.evidenceText.toLowerCase().slice(0, 15)),
        );
        if (sameEvidence && sameEvidence.actionType !== exp.actionType) {
          fnPrimitive++;
          wrongPrimitiveCases.push(`${testCase.id}:${exp.actionType}(gold) vs ${sameEvidence.actionType}(parser)`);
        } else if (matched.actionType === exp.actionType) {
          tpPrimitive++;
          matchedActionIndices.add(matched.index);
        } else {
          fnPrimitive++;
        }
      } else {
        fnPrimitive++;
      }
    }

    for (const action of actions) {
      if (!isEmissionInScope(action, scope, parse)) {
        wrongScopeExcluded++;
        continue;
      }
      const matchedGold = correctedGold.some((g) => levelAMatch(g, [action]) !== null);
      if (matchedGold) continue;

      // Classify in-scope unmatched emissions
      const fpEntry = policyAudit.fpReclassification.entries.find((e) => e.caseId === testCase.id);
      if (fpEntry && fpEntry.emittedPrimitive === action.actionType) {
        if (fpEntry.correctPrimitive !== fpEntry.emittedPrimitive) {
          wrongPrimitive++;
          wrongPrimitiveCases.push(`${testCase.id}: emitted ${action.actionType}, expected ${fpEntry.correctPrimitive}`);
        } else if (fpEntry.classification.includes("gold_scope") || fpEntry.classification.includes("loyalty")) {
          wrongScopeExcluded++;
        }
      } else if (
        action.actionType === "draw" &&
        /put it into your hand|put one of those cards into your hand/i.test(action.evidenceText)
      ) {
        wrongPrimitive++;
      } else {
        overExtraction++;
      }
    }
  }

  return {
    goldPositive,
    goldExemptRemovedFromDenominator: goldExempt,
    originalGoldPositive: 246,
    policyExemptLabels: 16,
    provisionalDenominator: 230,
    primitiveExistence: {
      tp: tpPrimitive,
      fn: fnPrimitive,
      goldPositive,
      recall: goldPositive > 0 ? tpPrimitive / goldPositive : 0,
    },
    emissionErrors: {
      overExtraction,
      wrongPrimitive,
      wrongScopeExcluded,
      wrongArguments,
      duplicateEmission,
    },
    wrongPrimitiveCases: [...new Set(wrongPrimitiveCases)],
  };
}

function main() {
  mkdirSync(resolve(OUT_DIR), { recursive: true });

  const v12 = JSON.parse(readFileSync(V12_PATH, "utf8")) as {
    contentHash: string;
    cases: OracleActionEvalCaseV2[];
  };
  if (v12.contentHash !== V12_HASH) {
    throw new Error(`v12 hash mismatch: expected ${V12_HASH}, got ${v12.contentHash}`);
  }

  const policyAudit = JSON.parse(readFileSync(POLICY_AUDIT_PATH, "utf8")) as PolicyAudit;
  const forensic = JSON.parse(readFileSync(FORENSIC_PATH, "utf8"));
  const aggregate = JSON.parse(readFileSync(AGGREGATE_PATH, "utf8"));
  const raw = JSON.parse(readFileSync(RAW_PATH, "utf8")) as { cases: SavedCase[] };
  const rawById = new Map(raw.cases.map((c) => [c.caseId, c]));

  // --- Taxonomy v1.4 spec ---
  const v13Primitives = [
    "add_mana", "draw", "discard", "search_library", "deal_damage", "destroy", "exile", "counter",
    "return_to_hand", "return_to_battlefield", "create_token", "cast", "play", "put_onto_battlefield",
    "copy", "sacrifice", "mill", "gain_life", "lose_life", "scry", "surveil", "tap", "untap",
    "put_counter", "shuffle_library", "shuffle_into_library",
  ];
  const taxonomyV14Spec = {
    specVersion: "three-layer-v1.4",
    frozenAt: new Date().toISOString(),
    parentTaxonomyVersion: "three-layer-v1.3",
    parentTaxonomyRef: "web/src/lib/deck-builder/golden-catalog/oracle-action-taxonomy.ts",
    doNotMutateV13Benchmarks: true,
    layer2Additions: [
      {
        primitive: "put_into_hand",
        semantics:
          "Move a card object into the controller's hand zone using Oracle 'put' instruction — distinct from draw and return_to_hand.",
        distinctFrom: ["draw", "return_to_hand"],
        classificationRule:
          "Classify from Oracle action verb + source/destination, not destination zone alone. 'Put target card from graveyard into your hand' → put_into_hand. 'Return … to hand' → return_to_hand.",
        requiredArguments: ["object", "destinationZone:hand", "sourceZone?"],
        oraclePatterns: [
          "put it into your hand",
          "put that card into your hand",
          "put one of those cards into your hand",
          "reveal it and put it into your hand",
          "Put target card from your graveyard into your hand",
        ],
        notPatterns: ["Draw a card", "draws N cards", "return target … to its owner's hand"],
      },
    ],
    preservedPrimitives: {
      draw: "Library → hand via draw instruction only",
      return_to_hand: "Explicit 'return … to hand' bounce/recursion wording",
      put_into_hand: "Explicit 'put … into your/hand' zone transition",
    },
    primitiveActionTypes: [...v13Primitives.filter((p) => p !== "put_into_hand"), "put_into_hand"].sort(),
  };

  // --- v1.3 → v1.4 migration artifact ---
  const migrationCases = [
    {
      caseId: "vh12-0049",
      oldPrimitive: "draw",
      newPrimitive: "put_into_hand",
      evidenceContains: "Put one of those cards into your hand",
      policyReason: "Oracle put instruction is zone transition, not draw. Gold defect under v1.3.",
      parserConsulted: false,
    },
    {
      caseId: "vh12-0106",
      oldPrimitive: null,
      newPrimitive: "put_into_hand",
      evidenceContains: "put it into your hand",
      policyReason: "Gold completion: otherwise-branch put instruction missing from v1.3 gold.",
      parserConsulted: false,
    },
    {
      caseId: "vh12-0145",
      oldPrimitive: null,
      newPrimitive: "put_counter",
      evidenceContains: "Put two +1/+1 counters",
      policyReason: "Gold completion: empty benchmark defect; main spell effect in full_card scope.",
      parserConsulted: false,
    },
    {
      caseId: "vh12-0151",
      oldPrimitive: null,
      newPrimitive: "put_into_hand",
      evidenceContains: "put it into your hand",
      policyReason: "Gold completion: empty benchmark defect; main spell put branch in full_card scope.",
      parserConsulted: false,
    },
  ];

  const v14Migrations = new Map<string, { oldPrimitive: string; newPrimitive: string; policyReason: string }>();
  for (const m of migrationCases) {
    if (m.oldPrimitive) {
      v14Migrations.set(`${m.caseId}:${m.oldPrimitive}:${m.evidenceContains}`, {
        oldPrimitive: m.oldPrimitive,
        newPrimitive: m.newPrimitive,
        policyReason: m.policyReason,
      });
    }
  }

  const taxonomyMigration = {
    migrationVersion: "taxonomy-v1.3-to-v1.4-migration-v129",
    frozenAt: new Date().toISOString(),
    parentHash: V12_HASH,
    taxonomyFrom: "three-layer-v1.3",
    taxonomyTo: "three-layer-v1.4",
    parserConsulted: false,
    changedCases: migrationCases,
  };

  // --- Benchmark caseScope schema ---
  const caseScopeSchema = {
    schemaVersion: "benchmark-case-scope-v1",
    frozenAt: new Date().toISOString(),
    requiredFields: ["caseScope"],
    caseScopeEnum: ["full_card", "face", "ability", "modal_option", "clause", "structure_only"],
    optionalTargetFields: [
      "targetFaceId",
      "targetAbilityId",
      "targetOptionId",
      "targetClauseId",
    ],
    scoringRules: [
      "Legitimate parser actions outside explicit caseScope are excluded from scoring — not counted as FP.",
      "Empty expectedPrimitiveActions does NOT imply no Layer-2 actions unless caseScope=structure_only AND certifiedEmptyLayer2=true.",
      "Gold must be complete within declared caseScope before sealing validation sets.",
      "Wrong-primitive and over-extraction are separate error classes in RC3 reporting.",
    ],
    certifiedEmptyLayer2: {
      requiredWhen: "caseScope=structure_only AND benchmark expects zero Layer-2 primitive actions",
      fields: ["certifiedEmptyLayer2: true", "scopeReason"],
    },
  };

  // --- caseScope overlay for all 151 v12 cases ---
  const caseScopeOverlay = {
    overlayVersion: "validation-v12-case-scope-overlay-v129",
    frozenAt: new Date().toISOString(),
    parentDatasetHash: V12_HASH,
    parentDatasetRef: V12_PATH,
    parserConsulted: false,
    caseCount: v12.cases.length,
    entries: v12.cases.map((c) => {
      const scope = inferCaseScope(c);
      return { caseId: c.id, cardName: c.cardName, ...scope };
    }),
  };

  // --- Genuine grammar failures (32 rows) ---
  const genuineMisses = policyAudit.fnPolicyAudit.genuineMissEntries;
  if (genuineMisses.length !== 32) {
    throw new Error(`Expected 32 genuine misses, got ${genuineMisses.length}`);
  }

  const genuineGrammarFailures = genuineMisses.map((row, rank) => {
    const key = goldEntryKey(row.caseId, row.actionType, row.evidenceContains);
    const primaryFamily = PRIMARY_FAMILY[key];
    if (!primaryFamily) {
      throw new Error(`Missing primary family for ${key}`);
    }
    return {
      rank: rank + 1,
      caseId: row.caseId,
      cardName: row.cardName,
      expectedPrimitive: row.actionType,
      evidenceContains: row.evidenceContains,
      auditClassification: row.auditClassification,
      primaryGrammarFamily: primaryFamily,
      secondaryTags: [] as string[],
    };
  });

  // Verify mutually exclusive primaries — count by family
  const familyCounts = new Map<string, number>();
  for (const row of genuineGrammarFailures) {
    familyCounts.set(row.primaryGrammarFamily, (familyCounts.get(row.primaryGrammarFamily) ?? 0) + 1);
  }

  const rankedFamilies = [...familyCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([family, count], i) => ({
      priorityRank: i + 1,
      primaryGrammarFamily: family,
      genuineMissCount: count,
      rc3StructuralPriority: i < 6 ? "high" : "medium",
    }));

  // --- Policy/structure families (NOT recall targets) ---
  const policyStructureFamilies = {
    specVersion: "policy-structure-families-v129",
    frozenAt: new Date().toISOString(),
    note: "Regression families — not Layer-2 recall targets. Do not mix with GENUINE RC3 GRAMMAR FAILURES.",
    families: [
      {
        family: "persistent_cast_permission",
        description: "You may cast [category] / player can't cast — Layer 1 permission, not cast primitive",
        v12PolicyExemptCount: 6,
        isRecallTarget: false,
      },
      {
        family: "trigger_event_cast_reference",
        description: "Whenever you cast / if you cast — trigger condition, not cast resolution",
        v12PolicyExemptCount: 6,
        isRecallTarget: false,
      },
      {
        family: "reminder_mechanic_text",
        description: "Mechanic definition parentheticals (discover, flashback, etc.)",
        v12PolicyExemptCount: 2,
        isRecallTarget: false,
      },
      {
        family: "static_cost_reduction",
        description: "Costs N less to cast — static modifier, not cast action",
        v12PolicyExemptCount: 1,
        isRecallTarget: false,
      },
      {
        family: "ability_scope_exclusions",
        description: "Ability-scoped gold omits modal/back-face/loyalty branches",
        v12PolicyExemptCount: 1,
        isRecallTarget: false,
      },
      {
        family: "loyalty_gold_scope_mismatch",
        description: "Legitimate loyalty actions omitted from ability-scoped gold — scoring scope issue, not parser FP",
        v12AffectedFpCount: 2,
        isRecallTarget: false,
      },
      {
        family: "empty_benchmark_scope",
        description: "Empty gold without structure certification — requires explicit caseScope before scoring",
        v12AffectedCount: 2,
        isRecallTarget: false,
      },
    ],
  };

  // --- Semantic validator spec ---
  const semanticValidatorSpec = {
    specVersion: "semantic-validator-spec-v129",
    frozenAt: new Date().toISOString(),
    taxonomyVersion: "three-layer-v1.4",
    canonicalInput: "OracleSemanticParse",
    removedFromReleaseGating: ["inferSupportedPrimitiveFromEvidence"],
    unsupportedGateDefinition:
      "semantically invalid or unrepresentable action record — NOT evaluator phrase-dictionary failure",
    structuralValidation: [
      "actionType exists in taxonomy v1.4 PRIMITIVE_ACTION_TYPES",
      "required arguments structurally valid for actionType",
      "parent ability exists and action.clauseId resolves",
      "modal option exists when modalOptionId referenced",
      "object/referent IDs resolve in parse.objects",
      "provenance.actionSpan exists",
      "provenance spans contained within oracleText bounds",
      "zones coherent for zone-transition primitives (put_into_hand, return_to_hand, etc.)",
      "quantity representation valid when present",
    ],
    diagnosticOnly: {
      evidenceSupportConfidence: "Optional lexical overlap check — never triggers unsupported gate",
      lexicalDiagnostic: "Regex/phrase hints for developer triage only",
    },
    unsupportedExamples: [
      "actionType not in taxonomy",
      "put_into_hand missing destinationZone hand",
      "parentAbilityId dangling reference",
      "provenance span outside oracle text",
    ],
    notUnsupported: [
      "regex did not recognize phrase in inferSupportedPrimitiveFromEvidence",
      "evidenceSupportConfidence below threshold",
    ],
  };

  // --- RC3 pipeline spec ---
  const rc3PipelineSpec = {
    specVersion: "rc3-pipeline-spec-v129",
    frozenAt: new Date().toISOString(),
    parserLineage: "oracle-action-v1.30+ / RC3",
    pipeline: [
      "Oracle text",
      "AbilityBlock[]",
      "Clause[] per ability",
      "ClauseRole assignment",
      "objects / referents resolution",
      "zone transitions / events / permissions",
      "Layer-2 actions + typed arguments",
    ],
    clauseRoles: [
      "effect",
      "cost",
      "trigger_event",
      "condition",
      "replacement_event",
      "replacement_effect",
      "permission",
      "restriction",
      "reminder",
      "granted_ability",
      "choice",
      "modal_option",
      "delayed_effect",
    ],
    primitiveExtractionScopes: [
      "effect clauses",
      "replacement_effect clauses",
      "granted-ability effect clauses (when gold scopes card-native)",
    ],
    excludedFromPrimitiveExtraction: [
      "cost clauses (except as action prerequisites)",
      "trigger_event headers",
      "permission/restriction static text",
      "reminder parentheticals",
      "granted-ability quote interiors (unless explicitly scoped)",
    ],
    priorityStructuralFamilies: rankedFamilies.filter((f) => f.rc3StructuralPriority === "high"),
    activatedTriggeredNote:
      "activated: 39 dev examples / poor v12; triggered: 89 dev examples / poor v12 — abstraction failure, not example shortage",
  };

  // --- Metrics: historical vs policy-corrected ---
  const correctedMetrics = computeCorrectedMetrics(
    v12.cases,
    rawById,
    policyAudit,
    caseScopeOverlay.entries as CaseScopeEntry[],
    v14Migrations,
  );

  const metricsArtifact = {
    artifactVersion: "v12-metrics-historical-vs-corrected-v129",
    frozenAt: new Date().toISOString(),
    parentDatasetHash: V12_HASH,
    parentExecutionRef: RAW_PATH,
    parentPolicyAuditRef: POLICY_AUDIT_PATH,
    parserConsulted: false,
    note: "Historical RC2/v12 scores are immutable. Policy-corrected diagnostics use v1.4 gold overlay + caseScope — not release gates.",
    historical: {
      label: "RC2 on validation v12 — original v1.3 gold (IMMUTABLE)",
      accepted: aggregate.accepted,
      needsReview: aggregate.needsReview,
      allEmission: aggregate.allEmission,
      unsupported: aggregate.unsupported,
      diagnosticLevels: forensic.diagnosticRecallLevels,
      primitiveExistenceRecall: 0.7804878048780488,
      primitiveExistence: { tp: 192, fn: 54, goldPositive: 246 },
    },
    policyCorrected: {
      label: "v1.4 gold overlay + policy-exempt removal + explicit caseScope (DIAGNOSTIC ONLY)",
      methodology: [
        "Remove 16 policy-exempt FN labels from denominator",
        "Apply v1.4 put_into_hand migrations and gold completions",
        "Exclude out-of-scope legitimate emissions from FP accounting",
        "Separate over-extraction / wrong_primitive / wrong_scope / wrong_arguments",
      ],
      provisionalBeforeV14Migrations: {
        goldPositive: 230,
        policyExemptRemoved: 16,
        primitiveExistenceRecall: 192 / 230,
        note: "192/230 ≈ 83.5% — before v1.4 gold migrations and caseScope-rescored TP/FN",
      },
      afterV14MigrationsAndCaseScope: correctedMetrics,
      fpReclassification: {
        historicalAcceptedFp: 6,
        trueOverExtraction: policyAudit.fpReclassification.summary.parserActualOverExtraction,
        wrongPrimitive: policyAudit.fpReclassification.summary.wrongPrimitive,
        goldScope: policyAudit.fpReclassification.summary.goldScope,
        note: "Historical FP=6 mixes gold-scope (3) and wrong-primitive (3). True over-extraction FP=0.",
      },
      unsupportedReclassification: {
        historicalUnsupported: 11,
        legitimateSupportMapGap: 3,
        wrongPrimitive: 4,
        scopeMismatch: 4,
        note: "8/11 unsupported were NOT evaluator support-map gaps under policy audit",
      },
    },
  };

  // Write all artifacts
  const hashes: Record<string, string> = {};
  hashes.taxonomyV14Spec = writeArtifact("taxonomy-v1.4-spec.json", taxonomyV14Spec);
  hashes.taxonomyMigration = writeArtifact("taxonomy-v1.3-to-v1.4-migration-v129.json", taxonomyMigration);
  hashes.caseScopeSchema = writeArtifact("benchmark-case-scope-schema-v1.json", caseScopeSchema);
  hashes.caseScopeOverlay = writeArtifact("validation-v12-case-scope-overlay-v129.json", caseScopeOverlay);
  hashes.metrics = writeArtifact("v12-metrics-historical-vs-corrected-v129.json", metricsArtifact);
  hashes.genuineGrammarFailures = writeArtifact("genuine-grammar-failures-v129.json", {
    specVersion: "genuine-grammar-failures-v129",
    frozenAt: new Date().toISOString(),
    parentPolicyAuditRef: POLICY_AUDIT_PATH,
    totalGenuineMisses: 32,
    mutuallyExclusivePrimaryFamilies: true,
    rankedFamilies,
    entries: genuineGrammarFailures,
  });
  hashes.policyStructureFamilies = writeArtifact(
    "policy-structure-families-v129.json",
    policyStructureFamilies,
  );
  hashes.semanticValidatorSpec = writeArtifact("semantic-validator-spec-v129.json", semanticValidatorSpec);
  hashes.rc3PipelineSpec = writeArtifact("rc3-pipeline-spec-v129.json", rc3PipelineSpec);

  const manifestBody = {
    manifestVersion: "rc3-foundations-manifest-v129",
    frozenAt: new Date().toISOString(),
    status: "FOUNDATIONS_FROZEN",
    blockedUntilComplete: ["RC3 parser tuning", "validation v13 creation", "blind taxonomy migration"],
    parentRefs: {
      v12DatasetHash: V12_HASH,
      rc2ExecutionRef: RAW_PATH,
      policyAuditRef: POLICY_AUDIT_PATH,
      forensicRef: FORENSIC_PATH,
    },
    artifacts: Object.fromEntries(
      Object.entries(hashes).map(([k, h]) => [k, { hash: h, path: `${OUT_DIR}/${k.replace(/([A-Z])/g, "-$1").toLowerCase().replace(/^-/, "")}.json` }]),
    ),
  };
  // Fix manifest paths manually
  manifestBody.artifacts = {
    taxonomyV14Spec: { hash: hashes.taxonomyV14Spec, path: `${OUT_DIR}/taxonomy-v1.4-spec.json` },
    taxonomyMigration: {
      hash: hashes.taxonomyMigration,
      path: `${OUT_DIR}/taxonomy-v1.3-to-v1.4-migration-v129.json`,
    },
    caseScopeSchema: { hash: hashes.caseScopeSchema, path: `${OUT_DIR}/benchmark-case-scope-schema-v1.json` },
    caseScopeOverlay: {
      hash: hashes.caseScopeOverlay,
      path: `${OUT_DIR}/validation-v12-case-scope-overlay-v129.json`,
    },
    metrics: { hash: hashes.metrics, path: `${OUT_DIR}/v12-metrics-historical-vs-corrected-v129.json` },
    genuineGrammarFailures: {
      hash: hashes.genuineGrammarFailures,
      path: `${OUT_DIR}/genuine-grammar-failures-v129.json`,
    },
    policyStructureFamilies: {
      hash: hashes.policyStructureFamilies,
      path: `${OUT_DIR}/policy-structure-families-v129.json`,
    },
    semanticValidatorSpec: {
      hash: hashes.semanticValidatorSpec,
      path: `${OUT_DIR}/semantic-validator-spec-v129.json`,
    },
    rc3PipelineSpec: { hash: hashes.rc3PipelineSpec, path: `${OUT_DIR}/rc3-pipeline-spec-v129.json` },
  };

  hashes.manifest = writeArtifact("rc3-foundations-manifest-v129.json", manifestBody);

  console.log("RC3 foundations frozen:");
  for (const [name, hash] of Object.entries(hashes)) {
    console.log(`  ${name}: ${hash}`);
  }
  console.log(`\nPolicy-corrected primitive recall: ${(correctedMetrics.primitiveExistence.recall * 100).toFixed(1)}%`);
  console.log(`  TP=${correctedMetrics.primitiveExistence.tp} FN=${correctedMetrics.primitiveExistence.fn} gold+=${correctedMetrics.goldPositive}`);
}

main();
