/**
 * Inventory clause-native-only actions by family and classification.
 * Run: cd web && npx tsx scripts/inventory-rc3-clause-native-only-v132.ts
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { extractOracleActionsV1 } from "../src/lib/deck-builder/golden-catalog/oracle-action-parser-v1";
import {
  extractClauseNativeActions,
  mergeClauseNativeWithV1,
  type ClauseNativeExtractionResult,
} from "../src/lib/deck-builder/golden-catalog/oracle-rc3-clause-native";
import { applyRC3Transforms } from "../src/lib/deck-builder/golden-catalog/oracle-rc3-transform";
import { isForbiddenPolicyLeak } from "./lib/rc3-case-scope-scoring";
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";
import { evaluateCaseSemantic } from "./oracle-action-semantic-matcher";
import { buildOracleSemanticParse } from "../src/lib/deck-builder/golden-catalog/oracle-semantic-parse-builder";
import { validateOracleSemanticParse } from "../src/lib/deck-builder/golden-catalog/oracle-semantic-validator";

type Envelope = { cases: OracleActionEvalCaseV2[] };

function classifyNativeAction(
  native: ClauseNativeExtractionResult,
  action: { evidenceStart: number; actionType: string; clauseId?: string },
): string {
  if (native.grantedAbilities.some((g) => action.clauseId?.startsWith(g.grantingClauseId) || action.clauseId?.includes(":granted:"))) {
    return "granted_ability";
  }
  if (native.searchChains.some((chain) => chain.some((l) => l.absStart === action.evidenceStart))) {
    return "search_chain";
  }
  if (native.activatedAbilities.some((a) => action.evidenceStart >= a.effectRegion.start)) {
    return "activated_effect";
  }
  if (native.replacementEffects.length > 0 && action.clauseId?.includes("repl")) {
    return "replacement_effect";
  }
  if (native.transformTransitions.some((t) => t.absStart === action.evidenceStart)) {
    return "mdfc_transform";
  }
  return "other";
}

function loadCases(): OracleActionEvalCaseV2[] {
  const paths = [
    "data/oracle-action-eval-rc3-positive-training-v132.json",
    "data/oracle-action-eval-rc3-positive-training-v130.json",
    "data/oracle-action-eval-development-v26-v14.json",
  ];
  const all: OracleActionEvalCaseV2[] = [];
  for (const p of paths) {
    try {
      all.push(...(JSON.parse(readFileSync(p, "utf8")) as Envelope).cases);
    } catch {
      /* optional v132 */
    }
  }
  return all;
}

function main() {
  const positive = loadCases();
  const guardrail = (JSON.parse(
    readFileSync("data/oracle-action-eval-rc3-policy-guardrail-v132.json", "utf8"),
  ) as Envelope).cases;

  const byFamily: Record<string, number> = {
    granted_ability: 0,
    search_chain: 0,
    activated_effect: 0,
    replacement_effect: 0,
    mdfc_transform: 0,
    other: 0,
  };
  let goldTpCandidates = 0;
  let outsideScope = 0;
  let policyForbidden = 0;
  let unscored = 0;
  let semanticInvalid = 0;

  const samples: Array<{ family: string; actionType: string; evidence: string; cardName?: string }> = [];

  for (const testCase of positive) {
    const base = extractOracleActionsV1({
      oracleId: testCase.oracleId,
      oracleText: testCase.oracleText,
      cardFace: testCase.cardFace,
    });
    const transformed = applyRC3Transforms(base, {
      oracleId: testCase.oracleId,
      oracleText: testCase.oracleText,
      cardFace: testCase.cardFace,
    });
    const native = extractClauseNativeActions({
      oracleId: testCase.oracleId,
      oracleText: testCase.oracleText,
      cardFace: testCase.cardFace,
    });
    const preview = mergeClauseNativeWithV1(transformed.actions, native);
    const v1Keys = new Set(
      transformed.actions.map((a) => `${a.actionType}:${Math.round(a.evidenceStart / 8)}`),
    );
    const nativeOnly = native.actions.filter(
      (n) => !v1Keys.has(`${n.actionType}:${Math.round(n.evidenceStart / 8)}`),
    );

    for (const action of nativeOnly) {
      const family = classifyNativeAction(native, action);
      byFamily[family] = (byFamily[family] ?? 0) + 1;

      const semantic = buildOracleSemanticParse(
        { ...base, actions: [...transformed.actions, action] },
        testCase.oracleText,
      );
      const validation = validateOracleSemanticParse(semantic, testCase.oracleText);
      if (validation.invalidCount > 0) semanticInvalid++;

      const gold = testCase.expectedPrimitiveActions.filter((g) => !g.negative);
      const wouldMatch = gold.some(
        (g) => g.actionType === action.actionType && action.evidenceText.includes(g.evidenceContains?.slice(0, 8) ?? "___"),
      );
      if (wouldMatch) goldTpCandidates++;
      else unscored++;

      if (samples.length < 30) {
        samples.push({ family, actionType: action.actionType, evidence: action.evidenceText.slice(0, 80), cardName: testCase.cardName });
      }
    }
  }

  for (const testCase of guardrail) {
    const native = extractClauseNativeActions({
      oracleId: testCase.oracleId,
      oracleText: testCase.oracleText,
    });
    for (const action of native.actions) {
      if (
        isForbiddenPolicyLeak({
          testCase: testCase as never,
          actionType: action.actionType,
          cardStart: action.evidenceStart,
          cardEnd: action.evidenceEnd,
        })
      ) {
        policyForbidden++;
      }
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    totalNativeOnly: Object.values(byFamily).reduce((a, b) => a + b, 0),
    byFamily,
    classification: { goldTpCandidates, outsideScope, policyForbidden, unscored, semanticInvalid },
    samples,
  };

  const outDir = resolve("data/milestones/rc3-development");
  mkdirSync(outDir, { recursive: true });
  const outPath = resolve(outDir, "rc3-clause-native-only-inventory-v132.json");
  writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
}

main();
