/**
 * One-shot diagnosis of expansion-check #2 failing cases.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { extractOracleActionsV1 } from "../src/lib/deck-builder/golden-catalog/oracle-action-parser-v1";
import { classifyTextRoleAt } from "../src/lib/deck-builder/golden-catalog/oracle-span-role-classifier";
import { ORACLE_ACTION_PARSER_VERSION } from "../src/lib/deck-builder/golden-catalog/oracle-action-schema";
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";
import { evaluateCaseUnified, matchGoldToActions } from "./oracle-action-unified-matcher";
import { normalizeToPrimitive } from "../src/lib/deck-builder/golden-catalog/oracle-action-taxonomy";
import { evidenceMatchesOracle } from "./oracle-action-eval-shared";

const FAIL_IDS = [
  "dev-exp-v1-008",
  "dev-exp-v1-012",
  "dev-exp-v1-028",
  "dev-exp-v1-040",
  "dev-exp-v1-048",
];

function abstractConstruction(c: OracleActionEvalCaseV2): string {
  const t = c.oracleText.replace(/\n.*/s, "").slice(0, 120);
  if (/Create a token that's a copy/.test(c.oracleText)) {
    return "activated_cost → create_token_copy_of_target → delayed_exile_referent";
  }
  if (/Exile target creature/.test(c.oracleText) && /gains \d+ life/.test(c.oracleText)) {
    return "spell_effect → exile_target_creature ∥ each_player_gain_life";
  }
  if (/search your library and\/or graveyard/.test(c.oracleText)) {
    return "spell_effect → lose_life ∥ optional_search_library_or_graveyard_for_named_card → hand";
  }
  if (/Reveal the top card.*put that card into your hand.*loses life equal to its mana value/.test(c.oracleText)) {
    return "loyalty_+1 → reveal_put_hand ∥ opponents_lose_life_equal_to_revealed_mv";
  }
  if (/loses life equal to its mana value/.test(c.oracleText)) {
    return "loyalty_+1 → variable_lose_life_from_revealed_card_mv";
  }
  return t;
}

function primaryFailureFamily(
  c: OracleActionEvalCaseV2,
  gold: OracleActionEvalCaseV2["expectedPrimitiveActions"][number],
): string {
  if (!evidenceMatchesOracle(c.oracleText, gold.evidenceContains)) {
    return "gold_oracle_mismatch";
  }
  const raw = extractOracleActionsV1({ oracleId: c.oracleId, oracleText: c.oracleText, cardFace: c.cardFace });
  const emitted = raw.actions.filter((a) => a.reviewStatus === "accepted");
  const typeMatch = emitted.find((a) => a.actionType === gold.actionType);
  if (!typeMatch) {
    const alt = emitted.find((a) => normalizeToPrimitive(a.actionType, a.evidenceText) === gold.actionType);
    if (!alt && /copy of target/.test(c.oracleText) && gold.actionType === "copy") {
      return "wrong_primitive";
    }
    if (!alt && /search your library and\/or graveyard/.test(c.oracleText)) {
      return "missing_grammar";
    }
    if (!alt && /put that card into your hand/.test(gold.evidenceContains)) {
      return "unseen_wording_variant";
    }
    return "missing_grammar";
  }
  if (!typeMatch.evidenceText.toLowerCase().includes(gold.evidenceContains.toLowerCase().slice(0, 12))) {
    return "matcher_evidence_failure";
  }
  if (typeMatch.reviewStatus !== "accepted") return "confidence_calibration";
  return "ability_attachment";
}

function diagnoseCase(c: OracleActionEvalCaseV2) {
  const raw = extractOracleActionsV1({ oracleId: c.oracleId, oracleText: c.oracleText, cardFace: c.cardFace });
  const expected = c.expectedPrimitiveActions.filter((e) => !e.negative);
  const actions = raw.actions.map((a, index) => ({
    index,
    primitive: normalizeToPrimitive(a.actionType, a.evidenceText),
    evidenceText: a.evidenceText,
    evidenceStart: a.evidenceStart,
    evidenceEnd: a.evidenceEnd,
    cardFaceId: a.faceId,
    abilityIndex: a.abilityIndex,
    reviewStatus: a.reviewStatus as "accepted" | "needs_review",
    loyaltyCost: a.loyaltyCost,
    optionalEffect: a.optionalEffect,
    optional: a.optional,
    optionalCost: a.optionalCost,
  }));
  const m = matchGoldToActions({ expected, actions, tier: "accepted", oracleText: c.oracleText });
  const u = evaluateCaseUnified(
    c,
    raw.actions.map((a) => ({
      actionType: a.actionType,
      evidenceText: a.evidenceText,
      evidenceStart: a.evidenceStart,
      evidenceEnd: a.evidenceEnd,
      faceId: a.faceId,
      abilityIndex: a.abilityIndex,
      loyaltyCost: a.loyaltyCost,
      sagaChapterId: a.sagaChapterId,
      modalOptionId: a.modalOptionId,
      reviewStatus: a.reviewStatus,
      optionalEffect: a.optionalEffect,
      optional: a.optional,
      optionalCost: a.optionalCost,
    })),
  );

  const emittedDetail = raw.actions.map((a) => {
    const face = raw.abilities.find((ab) => ab.cardFaceId === a.faceId && ab.abilityIndex === a.abilityIndex);
    const localStart = a.evidenceStart - (face?.paragraphStart ?? 0);
    const role = classifyTextRoleAt({
      paragraph: face?.paragraphText ?? a.evidenceText,
      localStart: Math.max(0, localStart),
      localEnd: localStart + a.evidenceText.length,
    });
    return {
      actionType: a.actionType,
      reviewStatus: a.reviewStatus,
      evidenceText: a.evidenceText,
      abilityIndex: a.abilityIndex,
      loyaltyCost: a.loyaltyCost,
      textRole: role,
      sourceZones: a.sourceZones,
      destinationZones: a.destinationZones,
      optionalEffect: a.optionalEffect,
      conditionType: a.conditionType,
      referentObject: a.referentObject,
      referentActionId: a.referentActionId,
      delayedEffect: a.delayedEffect,
      timingCondition: a.timingCondition,
      quantityType: a.quantityType,
      quantityExpression: a.quantityExpression,
      tokenCopyOf: a.tokenCopyOf,
    };
  });

  const goldAnalysis = expected.map((g) => ({
    actionType: g.actionType,
    evidenceContains: g.evidenceContains,
    evidenceInOracle: evidenceMatchesOracle(c.oracleText, g.evidenceContains),
    primaryFailureFamily: primaryFailureFamily(c, g),
  }));

  return {
    caseId: c.id,
    oracleId: c.oracleId,
    expansionFamily: (c as { expansionMetadata?: { family?: string } }).expansionMetadata?.family,
    abstractConstruction: abstractConstruction(c),
    metrics: u.accepted,
    goldAnalysis,
    emitted: emittedDetail,
    unmatchedGold: m.unmatchedExpectedIndices.map((i) => expected[i]),
    unmatchedActions: m.unmatchedActionIndices.map((i) => actions[i]),
  };
}

function main() {
  const exp = JSON.parse(
    readFileSync("data/oracle-action-eval-development-generalization-expansion-v2.json", "utf8"),
  ) as { cases: OracleActionEvalCaseV2[] };

  const diagnoses = FAIL_IDS.map((id) => {
    const c = exp.cases.find((x) => x.id === id);
    if (!c) throw new Error(`missing ${id}`);
    return diagnoseCase(c);
  });

  const familyCounts: Record<string, number> = {};
  for (const d of diagnoses) {
    for (const g of d.goldAnalysis) {
      familyCounts[g.primaryFailureFamily] = (familyCounts[g.primaryFailureFamily] ?? 0) + 1;
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    parserVersion: ORACLE_ACTION_PARSER_VERSION,
    expansionCheckExecutionCount: 2,
    holdoutStatus: "spent_for_development",
    spentReason: "failure-family diagnosis after milestone #2",
    diagnoses,
    failureFamilyCounts: familyCounts,
  };

  const out = resolve(process.cwd(), "data/milestones/rc2-development-planning/expansion-check-v2-diagnosis.json");
  writeFileSync(out, JSON.stringify(report, null, 2), "utf8");
  console.log(JSON.stringify(report, null, 2));
}

main();
