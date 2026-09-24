/**
 * Parser-blind zone-transition + replacement-effect FN audit (unrelated catalog).
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { parseOracleSemanticsRC3 } from "../src/lib/deck-builder/golden-catalog/oracle-semantic-parse-rc3";
import { applyGoldMigrationV135 } from "./lib/rc3-gold-migration-v135";
import { loadEnvLocal } from "./lib/script-env";
import {
  matchGoldToSemanticActions,
  semanticActionsForMatch,
} from "./oracle-action-semantic-matcher";
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";

loadEnvLocal();

const ZONE_IDS = [
  "rc3-pos-cat-0009",
  "rc3-pos-cat-0010",
  "rc3-pos-cat-0011",
  "rc3-pos-cat-0027",
  "rc3-pos-cat-0030",
];

const REPLACEMENT_IDS = [
  "rc3-pos-cat-0017",
  "rc3-pos-cat-0018",
  "rc3-pos-cat-0019",
  "rc3-pos-cat-0020",
];

type Envelope = { cases: OracleActionEvalCaseV2[] };

function loadCase(id: string): OracleActionEvalCaseV2 {
  const cases = applyGoldMigrationV135(
    (JSON.parse(readFileSync("data/oracle-action-eval-rc3-positive-training-catalog-v133.json", "utf8")) as Envelope)
      .cases,
  );
  const c = cases.find((x) => x.id === id);
  if (!c) throw new Error(`missing ${id}`);
  return c;
}

function oracleClause(text: string, needle: string, pad = 80): string {
  const idx = text.toLowerCase().indexOf(needle.toLowerCase().slice(0, Math.min(24, needle.length)));
  if (idx < 0) return text.replace(/\n/g, " ").slice(0, pad);
  const start = Math.max(0, idx - 20);
  return text.slice(start, start + pad).replace(/\n/g, " ");
}

function inferZoneTransitionFamily(actionType: string, evidence: string): string {
  const ev = evidence.toLowerCase();
  if (actionType === "return_to_hand" || (/return/.test(ev) && /to (?:its owner's |your )?hand/.test(ev))) {
    return "return_to_hand";
  }
  if (
    actionType === "return_to_battlefield" ||
    (/return/.test(ev) && /to the battlefield|onto the battlefield/.test(ev))
  ) {
    return "return_to_battlefield";
  }
  if (actionType === "put_into_hand" || (/put/.test(ev) && /into (?:your |their )?hand/.test(ev) && !/battlefield/.test(ev))) {
    return "put_into_hand";
  }
  if (
    actionType === "put_onto_battlefield" ||
    (/put/.test(ev) && /onto the battlefield|on(to)? the battlefield/.test(ev))
  ) {
    return "put_onto_battlefield";
  }
  if (actionType === "shuffle_into_library" || /shuffle.*into.*library/.test(ev)) {
    return "shuffle_into_library";
  }
  if (actionType === "exile" || /\bexile/.test(ev)) return "exile";
  return "other";
}

function inferSourceZone(evidence: string, oracle: string): string {
  const ev = evidence.toLowerCase();
  if (/from your graveyard|from a graveyard/.test(ev)) return "graveyard";
  if (/from your hand/.test(ev)) return "hand";
  if (/from exile|from among them exiled|exiled with/.test(ev)) return "exile";
  if (/from your library|from the top of your library/.test(ev)) return "library";
  if (/from among them/.test(ev) && /search your library|reveal/.test(oracle.toLowerCase())) return "library";
  if (/this card|itself/.test(ev) && /transform|mdfc|\/\//.test(oracle)) return "unknown_mdfc_transform";
  if (/put this card onto the battlefield/.test(ev)) return "unknown_mdfc_transform";
  return "unknown";
}

function inferDestZone(evidence: string): string {
  const ev = evidence.toLowerCase();
  if (/onto the battlefield|to the battlefield/.test(ev)) return "battlefield";
  if (/into your hand|to your hand|to its owner's hand/.test(ev)) return "hand";
  if (/into your graveyard|to your graveyard/.test(ev)) return "graveyard";
  if (/into.*library|shuffle.*into.*library/.test(ev)) return "library";
  if (/exile/.test(ev)) return "exile";
  return "unknown";
}

function inferReplacementCategory(oracle: string, evidence: string): string {
  const text = oracle.toLowerCase();
  const ev = evidence.toLowerCase();
  if (/exile it instead|exile that card instead/.test(ev)) return "exile-instead";
  if (/would be put into a graveyard.*exile.*instead/.test(text)) return "exile-instead";
  if (/if .* would .* instead/.test(text)) return "if_would_instead";
  if (/instead/.test(ev) && /damage/.test(text)) return "damage_replacement";
  if (/instead/.test(ev) && /dies|destroyed/.test(text)) return "dies_replacement";
  if (/instead/.test(ev)) return "instead";
  return "other";
}

function diagnoseFn(
  testCase: OracleActionEvalCaseV2,
  gold: OracleActionEvalCaseV2["expectedPrimitiveActions"][number],
) {
  const parse = parseOracleSemanticsRC3({
    oracleId: testCase.oracleId,
    oracleText: testCase.oracleText,
    cardFace: testCase.cardFace,
  });
  const expected = testCase.expectedPrimitiveActions.filter((e) => !e.negative);
  const matched = matchGoldToSemanticActions({
    expected,
    parse,
    tier: "accepted",
    oracleText: testCase.oracleText,
    caseId: testCase.id,
  });
  const actions = semanticActionsForMatch(parse).filter((a) => a.reviewStatus === "accepted");
  const sameType = actions.filter((a) => a.actionType === gold.actionType);
  const anyType = actions.map((a) => ({
    actionType: a.actionType,
    evidence: a.evidenceText,
    executionContext: a.executionContext,
    optionalEffect: a.optionalEffect,
  }));

  let failureStage = "semantic_action_builder";
  let errorClass = "missing_emission";
  if (sameType.length === 0) {
    const partial = actions.filter((a) => a.evidenceText.toLowerCase().includes((gold.evidenceContains ?? "").toLowerCase().slice(0, 15)));
    failureStage = partial.length ? "semantic_action_builder" : "primitive_extraction";
    errorClass = "wrong_action_type";
  } else if (!sameType.some((a) => a.evidenceText.toLowerCase().includes((gold.evidenceContains ?? "").toLowerCase().slice(0, 15)))) {
    failureStage = "referent_resolution";
    errorClass = "wrong_evidence";
  }

  return { parse, anyType, sameType, failureStage, errorClass };
}

function auditZone() {
  return ZONE_IDS.flatMap((id) => {
    const tc = loadCase(id);
    return tc.expectedPrimitiveActions
      .filter((g) => !g.negative && inferZoneTransitionFamily(g.actionType, g.evidenceContains ?? "") !== "other")
      .filter((g) => /exile|return|put.*battlefield|put.*hand|shuffle.*library/i.test(g.evidenceContains ?? ""))
      .map((gold) => {
        const { anyType, failureStage, errorClass } = diagnoseFn(tc, gold);
        const ev = gold.evidenceContains ?? "";
        return {
          caseId: id,
          cardName: (tc as { cardName?: string }).cardName,
          oracleClause: oracleClause(tc.oracleText, ev),
          caseScope: (tc as { caseScope?: string }).caseScope ?? "full_card",
          coverageStratum: (tc as { coverageStratum?: string }).coverageStratum,
          expectedPrimitive: gold.actionType,
          expectedEvidence: ev,
          sourceZone: inferSourceZone(ev, tc.oracleText),
          destinationZone: inferDestZone(ev),
          objectReferent: /target/.test(ev) ? "target" : /this card|itself/.test(ev) ? "self" : /among them/.test(ev) ? "revealed_selection" : "unspecified",
          quantity: /a creature card|target land/.test(ev) ? "one" : "unspecified",
          optionality: gold.optionalEffect ?? gold.optional ?? false,
          transitionFamily: inferZoneTransitionFamily(gold.actionType, ev),
          currentParserEmissions: anyType,
          failureStage,
          errorClass,
        };
      });
  });
}

function auditReplacement() {
  const rows: Array<Record<string, unknown>> = [];
  for (const id of REPLACEMENT_IDS) {
    const tc = loadCase(id);
    for (const gold of tc.expectedPrimitiveActions.filter((g) => !g.negative)) {
      if (!/instead|would.*exile|exile it instead/i.test(gold.evidenceContains ?? "") && gold.actionType !== "cast") continue;
      if (gold.actionType === "cast" && !/graveyard/i.test(gold.evidenceContains ?? "")) continue;
      const { anyType, failureStage, errorClass } = diagnoseFn(tc, gold);
      const ev = gold.evidenceContains ?? "";
      const oracle = tc.oracleText;
      rows.push({
        caseId: id,
        cardName: (tc as { cardName?: string }).cardName,
        cardFace: gold.cardFace,
        oracleClause: oracleClause(oracle, ev),
        caseScope: (tc as { caseScope?: string }).caseScope ?? "full_card",
        replacementEvent: oracle.match(/would be put into[^.]+|if a (?:source|creature|spell)[^.]+would[^.]+/i)?.[0] ?? "would-event (see clause)",
        replacementEffect: ev,
        expectedLayer2Action: gold.actionType,
        replacementCategory: inferReplacementCategory(oracle, ev),
        currentParserEmissions: anyType,
        failureStage,
        errorClass,
      });
    }
  }
  return rows;
}

function countSubfamilies(zoneRows: ReturnType<typeof auditZone>, repRows: ReturnType<typeof auditReplacement>) {
  const zoneCounts: Record<string, number> = {};
  for (const r of zoneRows) zoneCounts[r.transitionFamily] = (zoneCounts[r.transitionFamily] ?? 0) + 1;
  const repCounts: Record<string, number> = {};
  for (const r of repRows) repCounts[String(r.replacementCategory)] = (repCounts[String(r.replacementCategory)] ?? 0) + 1;
  return { zoneCounts, repCounts };
}

function main() {
  const zoneRows = auditZone();
  const repRows = auditReplacement();
  const { zoneCounts, repCounts } = countSubfamilies(zoneRows, repRows);

  const report = {
    generatedAt: new Date().toISOString(),
    checkpoint: "zone-replacement-fn-audit-v137",
    gateMath: {
      combined: { tp: 577, fp: 2, fn: 58, denominator: 635, tpNeededFor92Pct: 585, gap: 8 },
      unrelated: { tp: 50, fp: 0, fn: 18, denominator: 68, tpNeededFor90Pct: 62, gap: 12 },
    },
    recoverableIfPerfect: {
      zoneTransitions: { unrelated: zoneRows.length, note: "5 unrelated zone FNs audited" },
      replacementEffects: { unrelated: repRows.filter((r) => r.expectedLayer2Action === "exile").length, note: "4 exile-instead + 1 cast-on-replacement-card" },
      combinedZoneGlobal: 14,
      combinedReplacementGlobal: 7,
    },
    zoneTransitionLedger: zoneRows,
    zoneSubfamilyCounts: zoneCounts,
    replacementEffectLedger: repRows,
    replacementSubfamilyCounts: repCounts,
    provisionalRecommendation: {
      nextFamily: "zone_transitions",
      z1Pass: "put_onto_battlefield — MDFC transform self-zone (3/5 unrelated zone FNs share mdfc_transform_zone_transition stratum)",
      coherence: zoneCounts.put_onto_battlefield === 3 ? "coherent_single_family" : "mixed",
      replacementVsZone: "replacement exile-instead is structurally uniform (4/4 exile-instead) but requires replacement-event grammar; zone MDFC put has lower FP risk",
    },
  };

  const outDir = resolve("data/milestones/rc3-development");
  mkdirSync(outDir, { recursive: true });
  const outPath = resolve(outDir, "zone-replacement-fn-audit-v137.json");
  writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ outPath, zoneSubfamilyCounts: zoneCounts, replacementSubfamilyCounts: repCounts }, null, 2));
}

main();
