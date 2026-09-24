/**
 * Audit none/Layer1 → primitive accepted FPs — gold/taxonomy only.
 * Run: npx tsx scripts/audit-none-layer1-fp-families.ts
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { execSync } from "node:child_process";
import { loadEnvLocal } from "./lib/script-env";
import { extractOracleActionsV1 } from "../src/lib/deck-builder/golden-catalog/oracle-action-parser-v1";
import { normalizeToPrimitive } from "../src/lib/deck-builder/golden-catalog/oracle-action-taxonomy";
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";
import { matchGoldToActions, primitiveMatchesExpected } from "./oracle-action-unified-matcher";
import { evidenceMatchesExtracted, evidenceMatchesOracle } from "./oracle-action-eval-shared";
import type { CatalogEvalCase } from "./lib/eval-provenance-guard";

loadEnvLocal();

const TARGET_PREDICTED = ["add_mana", "exile", "draw", "create_token", "cast"] as const;

type AuditClassification =
  | "gold_missing_legitimate_layer2"
  | "trigger_header_reference_only"
  | "cost_header_reference_only"
  | "static_permission_restriction_only"
  | "replacement_event_not_performed"
  | "actual_layer2_effect_gold_correct"
  | "parser_unsupported_primitive";

type AbilityTypeGuess = "activated" | "triggered" | "static" | "replacement" | "spell_effect" | "unknown";

function guessAbilityType(oracleText: string, evidence: string): AbilityTypeGuess {
  const idx = oracleText.toLowerCase().indexOf(evidence.toLowerCase().slice(0, 20));
  const window = idx >= 0 ? oracleText.slice(Math.max(0, idx - 120), idx + evidence.length + 40) : oracleText;
  if (/\{T\}|\{[^}]+\}:/.test(window) && /Add \{/.test(evidence)) return "activated";
  if (/\bWhenever\b/i.test(window) && /\b(?:draw|create|exile|destroy)\b/i.test(evidence)) {
    if (/\bWhenever [^,]+,\s*(?:draw|create|exile)/i.test(window)) return "triggered";
    if (/\bWhenever you draw\b/i.test(window)) return "trigger_header_reference_only" as AbilityTypeGuess;
  }
  if (/\bWhen\b/i.test(window) && !/\bWhenever you draw\b/i.test(window)) return "triggered";
  if (/\bIf a .+ would\b/i.test(window) || /\binstead\b/i.test(window)) return "replacement";
  if (/\bYou may cast .+ from your graveyard\b/i.test(window) && /cast/i.test(evidence)) return "static";
  if (/\bAs an additional cost\b/i.test(window)) return "cost_header_reference_only" as AbilityTypeGuess;
  if (/\bCreatures can't\b|\bcan't cast\b|\bAs long as\b/i.test(window)) return "static";
  return "unknown";
}

function classifyEntry(input: {
  testCase: CatalogEvalCase;
  predicted: string;
  evidence: string;
  abilityType: AbilityTypeGuess;
}): { classification: AuditClassification; shouldLayer2: boolean; correctPrimitive?: string; reason: string } {
  const { testCase, predicted, evidence, abilityType } = input;
  const ot = testCase.oracleText;
  const gold = testCase.expectedPrimitiveActions.filter((e) => !e.negative);
  const hasMatchingGold = gold.some(
    (g) => g.actionType === predicted && evidenceMatchesExtracted(evidence, g.evidenceContains),
  );

  if (hasMatchingGold) {
    return {
      classification: "actual_layer2_effect_gold_correct",
      shouldLayer2: true,
      correctPrimitive: predicted,
      reason: "Gold already labels this primitive — matrix bucket is misclassified",
    };
  }

  if (abilityType === ("trigger_header_reference_only" as AbilityTypeGuess)) {
    return {
      classification: "trigger_header_reference_only",
      shouldLayer2: false,
      reason: "Draw/create/etc. appears in trigger condition, not effect clause",
    };
  }
  if (abilityType === ("cost_header_reference_only" as AbilityTypeGuess)) {
    return {
      classification: "cost_header_reference_only",
      shouldLayer2: false,
      reason: "Action verb in additional cost, not effect",
    };
  }

  if (/\bAs an additional cost\b/i.test(ot) && evidence.toLowerCase().includes(ot.toLowerCase().slice(0, 30))) {
    return {
      classification: "cost_header_reference_only",
      shouldLayer2: false,
      reason: "Additional cost language",
    };
  }

  if (/\bWhenever you draw a card\b/i.test(ot) && /draw a card/i.test(evidence)) {
    return {
      classification: "trigger_header_reference_only",
      shouldLayer2: false,
      reason: "Draw in intervening trigger event, not triggered effect",
    };
  }

  if (abilityType === "replacement" || (/\bwould\b/i.test(evidence) && /\binstead\b/i.test(ot))) {
    return {
      classification: "gold_missing_legitimate_layer2",
      shouldLayer2: true,
      correctPrimitive: predicted,
      reason: "Replacement effect performs exile/etc. — Layer 1 replacement + Layer 2 primitive",
    };
  }

  if (abilityType === "static" && /cast|play/i.test(predicted)) {
    return {
      classification: "static_permission_restriction_only",
      shouldLayer2: false,
      reason: "Static cast/play permission — Layer 1 permission structure, not imperative cast action",
    };
  }

  if (/\bCreatures can't\b|\bcan't be\b|\bAs long as\b/i.test(evidence)) {
    return {
      classification: "static_permission_restriction_only",
      shouldLayer2: false,
      reason: "Static restriction text",
    };
  }

  if (abilityType === "activated" && predicted === "add_mana" && /\{T\}|:\s*Add/i.test(ot)) {
    return {
      classification: "gold_missing_legitimate_layer2",
      shouldLayer2: true,
      correctPrimitive: "add_mana",
      reason: "Activated mana ability — Layer 1 activated + Layer 2 add_mana (complementary, not exclusive)",
    };
  }

  if (abilityType === "triggered" && ["draw", "create_token", "exile", "destroy"].includes(predicted)) {
    const triggerEffect = /\b(?:When|Whenever)[^,]+,\s*/i.test(ot);
    if (triggerEffect) {
      return {
        classification: "gold_missing_legitimate_layer2",
        shouldLayer2: true,
        correctPrimitive: predicted,
        reason: "Triggered ability effect — Layer 1 triggered + Layer 2 primitive",
      };
    }
  }

  if (/\{T\}:\s*Add/i.test(ot) && predicted === "add_mana") {
    return {
      classification: "gold_missing_legitimate_layer2",
      shouldLayer2: true,
      correctPrimitive: "add_mana",
      reason: "Activated Add mana — missing Layer 2 gold",
    };
  }

  if (/\bWhen .+ dies,\s*create/i.test(ot) && predicted === "create_token") {
    return {
      classification: "gold_missing_legitimate_layer2",
      shouldLayer2: true,
      correctPrimitive: "create_token",
      reason: "Triggered token creation — missing Layer 2 gold",
    };
  }

  if (/\bWhen .+ enters,\s*draw/i.test(ot) && predicted === "draw") {
    return {
      classification: "gold_missing_legitimate_layer2",
      shouldLayer2: true,
      correctPrimitive: "draw",
      reason: "ETB draw trigger — missing Layer 2 gold",
    };
  }

  if (gold.length === 0 && (testCase.expectedStructure?.minTriggeredAbilities || testCase.expectedStructure?.minActivatedAbilities)) {
    if (abilityType === "activated" || abilityType === "triggered") {
      return {
        classification: "gold_missing_legitimate_layer2",
        shouldLayer2: true,
        correctPrimitive: predicted,
        reason: "Layer 1 structure present but Layer 2 primitive missing from gold",
      };
    }
  }

  if (/\bDestroy target\b/i.test(evidence) && !gold.some((g) => g.actionType === "destroy")) {
    return {
      classification: "gold_missing_legitimate_layer2",
      shouldLayer2: true,
      correctPrimitive: "destroy",
      reason: "Spell or activated destroy effect missing from gold",
    };
  }

  return {
    classification: "parser_unsupported_primitive",
    shouldLayer2: false,
    reason: "Parser emission not supported by oracle action model or spurious span",
  };
}

function inferExpectedForMatrix(testCase: OracleActionEvalCaseV2, evidence: string, predicted: string): string {
  const gold = testCase.expectedPrimitiveActions.filter((e) => !e.negative);
  for (const exp of gold) {
    if (evidenceMatchesExtracted(evidence, exp.evidenceContains)) return exp.actionType;
  }
  if (gold.length === 0 && testCase.expectedStructure && Object.keys(testCase.expectedStructure).length > 0) {
    return "none/Layer1";
  }
  if (gold.length === 0) return "none/Layer1";
  return "none/Layer1";
}

async function main() {
  const repoRoot = resolve(process.cwd(), "..");
  execSync(
    "git checkout 3eaae76 -- web/src/lib/deck-builder/golden-catalog/oracle-action-parser-v1.ts web/src/lib/deck-builder/golden-catalog/oracle-action-schema.ts",
    { cwd: repoRoot, stdio: "inherit" },
  );

  let devPath = resolve(process.cwd(), "data/oracle-action-eval-development-v17.json");
  try {
    readFileSync(devPath, "utf8");
  } catch {
    devPath = resolve(process.cwd(), "data/oracle-action-eval-development-v16.json");
  }
  const dev = JSON.parse(readFileSync(devPath, "utf8")) as { cases: CatalogEvalCase[] };

  const entries: Array<Record<string, unknown>> = [];

  for (const testCase of dev.cases) {
    const raw = extractOracleActionsV1({
      oracleId: testCase.oracleId,
      oracleText: testCase.oracleText,
      cardFace: testCase.cardFace,
    });
    const expected = testCase.expectedPrimitiveActions.filter((e) => !e.negative);
    const actions = raw.actions.map((a, index) => ({
      index,
      primitive: normalizeToPrimitive(a.actionType, a.evidenceText),
      evidenceText: a.evidenceText,
      cardFaceId: a.faceId,
      abilityIndex: a.abilityIndex,
      reviewStatus: a.reviewStatus as "accepted" | "needs_review",
    }));

    const accepted = matchGoldToActions({ expected, actions, tier: "accepted" });

    for (const actionIdx of accepted.unmatchedActionIndices) {
      const a = actions[actionIdx];
      if (a.reviewStatus !== "accepted" || !a.primitive) continue;
      if (!TARGET_PREDICTED.includes(a.primitive as (typeof TARGET_PREDICTED)[number])) continue;

      const matchedAnyGold = expected.some((exp) =>
        primitiveMatchesExpected(
          { ...a, optionalEffect: undefined, optionalCost: undefined, optional: undefined },
          exp,
        ),
      );
      if (matchedAnyGold) continue;

      const matrixExpected = inferExpectedForMatrix(testCase, a.evidenceText, a.primitive);
      if (matrixExpected !== "none/Layer1") continue;

      const abilityType = guessAbilityType(testCase.oracleText, a.evidenceText);
      const audit = classifyEntry({
        testCase,
        predicted: a.primitive,
        evidence: a.evidenceText,
        abilityType,
      });

      entries.push({
        caseId: testCase.id,
        card: testCase.cardName ?? testCase.id,
        predictedFamily: `none/Layer1 → ${a.primitive}`,
        exactOracleText: testCase.oracleText.length > 400 ? testCase.oracleText.slice(0, 400) + "…" : testCase.oracleText,
        exactAbilityEvidence: a.evidenceText,
        abilityType,
        parserPrimitive: a.primitive,
        currentGold: testCase.expectedPrimitiveActions,
        currentStructure: testCase.expectedStructure,
        shouldLayer2Exist: audit.shouldLayer2,
        correctPrimitiveIfYes: audit.correctPrimitive,
        classification: audit.classification,
        reason: audit.reason,
      });
    }
  }

  const byFamily: Record<string, number> = {};
  const byClassification: Record<string, number> = {};
  for (const e of entries) {
    const fam = e.predictedFamily as string;
    byFamily[fam] = (byFamily[fam] ?? 0) + 1;
    const cls = e.classification as string;
    byClassification[cls] = (byClassification[cls] ?? 0) + 1;
  }

  const goldCorrections = entries.filter((e) => e.classification === "gold_missing_legitimate_layer2");

  const report = {
    generatedAt: new Date().toISOString(),
    dataset: devPath.includes("v17") ? "development_set_v17" : "development_set_v16",
    auditedFamilies: TARGET_PREDICTED.map((p) => `none/Layer1 → ${p}`),
    totalAudited: entries.length,
    byFamily,
    byClassification,
    staticPermissionPolicy:
      "Static cast/play permissions (e.g. 'You may cast from graveyard') = Layer 1 permission structure only; not imperative cast Layer 2 primitives unless resolving a one-shot instruction",
    entries,
    goldCorrectionCaseIds: [...new Set(goldCorrections.map((e) => e.caseId as string))],
  };

  const outPath = resolve(
    process.cwd(),
    devPath.includes("v17") ? "reports/none-layer1-fp-audit-v17.json" : "reports/none-layer1-fp-audit-v16.json",
  );
  mkdirSync(resolve(outPath, ".."), { recursive: true });
  writeFileSync(outPath, JSON.stringify(report, null, 2), "utf8");

  execSync(
    "git checkout HEAD -- web/src/lib/deck-builder/golden-catalog/oracle-action-parser-v1.ts web/src/lib/deck-builder/golden-catalog/oracle-action-schema.ts",
    { cwd: repoRoot, stdio: "inherit" },
  );

  console.log(JSON.stringify({ outPath, byFamily, byClassification, goldCorrectionCount: goldCorrections.length }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
