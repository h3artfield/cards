/**
 * Lightweight global zone-transition FN classification census (zone_transitions family only).
 * Run: npx tsx scripts/audit-zone-fn-global-census-v137.ts
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { parseOracleSemanticsRC3, ORACLE_ACTION_RC3_PARSER_VERSION } from "../src/lib/deck-builder/golden-catalog/oracle-semantic-parse-rc3";
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";
import { matchGoldToSemanticActions } from "./oracle-action-semantic-matcher";
import { applyGoldMigrationV135 } from "./lib/rc3-gold-migration-v135";
import { loadEnvLocal } from "./lib/script-env";

loadEnvLocal();

type Envelope = { cases: OracleActionEvalCaseV2[] };

type ZoneFnClass =
  | "genuine_card_native_transition"
  | "reminder_mechanic_definition"
  | "cost"
  | "trigger_event_reference"
  | "gold_defect"
  | "evaluator_scope_issue";

function loadScoringCases(path: string): OracleActionEvalCaseV2[] {
  return applyGoldMigrationV135((JSON.parse(readFileSync(resolve(path), "utf8")) as Envelope).cases);
}

function classifyFamily(testCase: OracleActionEvalCaseV2, gold: OracleActionEvalCaseV2["expectedPrimitiveActions"][number]): string {
  const ev = (gold.evidenceContains ?? "").toLowerCase();
  const text = testCase.oracleText.toLowerCase();
  const category = (testCase as { category?: string }).category ?? "";
  if (/would.*instead|exile it instead/i.test(text) || category.includes("replacement")) return "replacement_effects";
  if (/exile|return|put.*onto the battlefield|from your graveyard|from exile/i.test(ev)) return "zone_transitions";
  return "other";
}

function classifyZoneFn(
  testCase: OracleActionEvalCaseV2,
  gold: OracleActionEvalCaseV2["expectedPrimitiveActions"][number],
): ZoneFnClass {
  const ev = gold.evidenceContains ?? "";
  const text = testCase.oracleText;
  const mechanicContext = (testCase as { expectedMechanicContext?: { mechanic?: string } }).expectedMechanicContext;
  const forbidden = (testCase as { forbiddenPrimitiveActions?: string[] }).forbiddenPrimitiveActions ?? [];

  if (mechanicContext?.mechanic === "ninjutsu" || forbidden.includes(gold.actionType)) {
    return "reminder_mechanic_definition";
  }
  if (/Ninjutsu \{[^}]+\} \([^)]*Put this card onto the battlefield/i.test(text) && /Put this card onto the battlefield/i.test(ev)) {
    return "reminder_mechanic_definition";
  }
  if (/Disturb \{[^}]+\} \(/i.test(text) && /cast this card from your graveyard/i.test(ev)) {
    return "reminder_mechanic_definition";
  }
  if (/Whenever you cast|When you cast|If you cast/i.test(ev) && gold.actionType === "cast") {
    return "trigger_event_reference";
  }
  if (gold.actionType === "return_to_battlefield" && /to your hand/i.test(ev)) {
    return "gold_defect";
  }
  if (/^\{[^}]+\}/.test(text) && text.indexOf(":") > 0) {
    const colon = text.indexOf(":");
    const idx = text.toLowerCase().indexOf(ev.toLowerCase().slice(0, Math.min(16, ev.length)));
    if (idx >= 0 && idx < colon) return "cost";
  }
  if ((testCase as { caseScope?: string }).caseScope === "structure_only") {
    return "evaluator_scope_issue";
  }
  return "genuine_card_native_transition";
}

function main() {
  const legacyV14Paths = [
    "data/oracle-action-eval-development-v26-v14.json",
    "data/oracle-action-eval-development-generalization-expansion-v2-v14.json",
    "data/oracle-action-eval-development-generalization-expansion-v3-v14.json",
    "data/oracle-action-eval-development-generalization-expansion-v5-v14.json",
  ];
  const positiveCatalog = loadScoringCases("data/oracle-action-eval-rc3-positive-training-catalog-v133.json");
  const combinedCases = [...legacyV14Paths.flatMap(loadScoringCases), ...positiveCatalog];

  const items: Array<Record<string, unknown>> = [];
  const classCounts = new Map<ZoneFnClass, number>();

  for (const testCase of combinedCases) {
    const parsed = parseOracleSemanticsRC3({
      oracleId: testCase.oracleId,
      oracleText: testCase.oracleText,
      cardFace: testCase.cardFace,
    });
    const expected = testCase.expectedPrimitiveActions.filter((e) => !e.negative);
    const matched = matchGoldToSemanticActions({
      expected,
      parse: parsed,
      tier: "accepted",
      oracleText: testCase.oracleText,
      caseId: testCase.id,
    });
    const matchedExpected = new Set(matched.matches.filter((m) => m.matched).map((m) => m.expectedIndex));

    for (let ei = 0; ei < expected.length; ei++) {
      if (matchedExpected.has(ei)) continue;
      const gold = expected[ei]!;
      if (classifyFamily(testCase, gold) !== "zone_transitions") continue;
      const classification = classifyZoneFn(testCase, gold);
      classCounts.set(classification, (classCounts.get(classification) ?? 0) + 1);
      items.push({
        caseId: testCase.id,
        cardName: (testCase as { cardName?: string }).cardName,
        actionType: gold.actionType,
        evidenceContains: gold.evidenceContains,
        classification,
        coverageStratum: (testCase as { coverageStratum?: string }).coverageStratum,
        unrelated: !(testCase as { spentV12Regression?: boolean }).spentV12Regression,
      });
    }
  }

  const unrelatedItems = items.filter((i) => i.unrelated);
  const unrelatedClassCounts = new Map<ZoneFnClass, number>();
  for (const item of unrelatedItems) {
    const c = item.classification as ZoneFnClass;
    unrelatedClassCounts.set(c, (unrelatedClassCounts.get(c) ?? 0) + 1);
  }

  const report = {
    generatedAt: new Date().toISOString(),
    checkpoint: "zone-fn-global-census-v137",
    parserVersion: ORACLE_ACTION_RC3_PARSER_VERSION,
    scope: "zone_transitions family FNs only",
    historicalRaw: {
      note: "Pre v12-Ninjutsu current-policy overlay on combined corpus",
      zoneTransitionFamilyFns: items.length,
      classification: Object.fromEntries([...classCounts.entries()].sort((a, b) => b[1] - a[1])),
    },
    currentPolicy: {
      note: "After excluding Ninjutsu reminder gold defects (cat + v12 overlay)",
      zoneTransitionFamilyFns: items.filter((i) => i.classification !== "reminder_mechanic_definition").length,
      classification: (() => {
        const cp = new Map<ZoneFnClass, number>();
        for (const item of items) {
          if (item.classification === "reminder_mechanic_definition") continue;
          const c = item.classification as ZoneFnClass;
          cp.set(c, (cp.get(c) ?? 0) + 1);
        }
        return Object.fromEntries([...cp.entries()].sort((a, b) => b[1] - a[1]));
      })(),
      genuineZoneParserGaps: items.filter((i) => i.classification === "genuine_card_native_transition").length,
    },
    totalZoneTransitionFamilyFns: items.length,
    globalClassification: Object.fromEntries([...classCounts.entries()].sort((a, b) => b[1] - a[1])),
    unrelatedZoneFns: unrelatedItems.length,
    unrelatedClassification: Object.fromEntries([...unrelatedClassCounts.entries()].sort((a, b) => b[1] - a[1])),
    genuineUnrelatedParserGaps: unrelatedClassCounts.get("genuine_card_native_transition") ?? 0,
    items,
  };

  mkdirSync(resolve("data/milestones/rc3-development"), { recursive: true });
  writeFileSync(
    resolve("data/milestones/rc3-development/zone-fn-global-census-v137.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  console.log(JSON.stringify(report, null, 2));
}

main();
