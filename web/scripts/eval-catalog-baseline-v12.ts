/**
 * Official catalog-clean baseline — oracle-action-v1.12-unified-matcher on frozen v13/v8.
 * Run: npx tsx scripts/eval-catalog-baseline-v12.ts
 * Debug (no provenance): npx tsx scripts/eval-catalog-baseline-v12.ts --debug
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { execSync } from "node:child_process";
import { loadEnvLocal } from "./lib/script-env";
import { loadGoldenCatalogIndex } from "./lib/load-golden-catalog-index";
import {
  guardOfficialBenchmarkDataset,
  type EvalDatasetEnvelope,
} from "./lib/eval-provenance-guard";
import { evaluateCaseSet } from "./eval-oracle-action-extraction-v6";
import { auditEvalCaseIdentity, summarizeIdentityAudit } from "./lib/eval-identity-audit-lib";
import { buildDevelopmentCardNameLookup } from "./lib/dev-case-card-name-lookup";
import { buildFullEvalCardNameLookup } from "./lib/eval-case-card-name-lookup";
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";
import {
  extractOracleActionsV1,
} from "../src/lib/deck-builder/golden-catalog/oracle-action-parser-v1";
import { evaluateCaseUnified, matchGoldToActions } from "./oracle-action-unified-matcher";
import { normalizeToPrimitive } from "../src/lib/deck-builder/golden-catalog/oracle-action-taxonomy";

loadEnvLocal();

const PARSER_V12 = "oracle-action-v1.12-unified-matcher";
const DEBUG = process.argv.includes("--debug");
const DEV_PATH = "data/oracle-action-eval-development-v17.json";
const VAL_PATH = "data/oracle-action-eval-validation-v8.json";
const BLIND_PATH = "data/oracle-action-eval-final-blind-v2.json";

type FailureFamily =
  | "missed_extraction"
  | "wrong_primitive"
  | "wrong_face_or_zone"
  | "wrong_ability_attachment"
  | "condition_or_optionality"
  | "duplicate_emission"
  | "unsupported_emission"
  | "evaluator_defect"
  | "other_parser_mismatch";

function loadDataset(path: string): EvalDatasetEnvelope {
  return JSON.parse(readFileSync(resolve(process.cwd(), path), "utf8")) as EvalDatasetEnvelope;
}

function goldPositiveCount(cases: OracleActionEvalCaseV2[]): number {
  return cases.reduce((n, c) => n + c.expectedPrimitiveActions.filter((p) => !p.negative).length, 0);
}

function summarizeSetResults(
  results: ReturnType<typeof evaluateCaseSet>,
  cases: OracleActionEvalCaseV2[],
) {
  const accepted = results.metricsByEmissionTier.acceptedOnly;
  const needsReview = results.metricsByEmissionTier.needsReviewOnly;
  const allEmission = results.metricsByEmissionTier.allEmission;
  const auth = results.authoritativeClassification.counts;
  const fp = results.falsePositiveClassification;

  return {
    caseCount: cases.length,
    goldPositiveCount: goldPositiveCount(cases),
    accepted: {
      tp: accepted.truePositives,
      fp: accepted.falsePositives,
      fn: accepted.falseNegatives,
      precision: accepted.precision,
      recall: accepted.recall,
    },
    needsReview: {
      tp: needsReview.truePositives,
      fp: needsReview.falsePositives,
    },
    allEmission: {
      tp: allEmission.truePositives,
      fp: allEmission.falsePositives,
      fn: allEmission.falseNegatives,
      precision: allEmission.precision,
      recall: allEmission.recall,
    },
    tierInvariantChecks: results.metricsByEmissionTier.tierInvariants,
    acceptedGenuinelyUnsupported: auth.genuinely_unsupported_by_oracle,
    wrongPrimitiveCount: auth.supported_but_wrong_primitive,
    wrongStructureCount: auth.supported_but_wrong_structure_or_attachment,
    wrongZoneCount: fp.wrong_card_face,
    wrongAbilityCount: fp.wrong_ability_association,
    wrongConditionOptionalityCount: fp.condition_or_optionality_mismatch,
    duplicateCount: auth.duplicate,
    evaluatorDefectCount: auth.evaluator_defect,
    metricsByPrimitive: results.perPrimitive,
    metricsByAbilityStructure: results.metricsByAbilityType,
    metricsByLayout: results.metricsByLayout,
  };
}

function classifyValidationFailures(cases: OracleActionEvalCaseV2[]): {
  byFamily: Record<FailureFamily, number>;
  inventory: Array<{
    caseId: string;
    cardName?: string;
    families: FailureFamily[];
    missedGold: string[];
    falsePositiveNotes: string[];
  }>;
} {
  const byFamily: Record<FailureFamily, number> = {
    missed_extraction: 0,
    wrong_primitive: 0,
    wrong_face_or_zone: 0,
    wrong_ability_attachment: 0,
    condition_or_optionality: 0,
    duplicate_emission: 0,
    unsupported_emission: 0,
    evaluator_defect: 0,
    other_parser_mismatch: 0,
  };

  const inventory: Array<{
    caseId: string;
    cardName?: string;
    families: FailureFamily[];
    missedGold: string[];
    falsePositiveNotes: string[];
  }> = [];

  for (const testCase of cases) {
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
      optionalEffect: a.optionalEffect,
      optional: a.optional,
      optionalCost: a.optionalCost,
    }));
    const allTier = matchGoldToActions({ expected, actions, tier: "all" });
    const unified = evaluateCaseUnified(testCase, raw.actions);
    if (unified.allEmission.fn === 0 && unified.allEmission.fp === 0) continue;

    const families = new Set<FailureFamily>();
    const missedGold: string[] = [];
    const falsePositiveNotes: string[] = [];

    for (const idx of allTier.unmatchedExpectedIndices) {
      families.add("missed_extraction");
      const exp = expected[idx];
      missedGold.push(`${exp.actionType}:${exp.evidenceContains}`);
    }

    for (const actionIdx of allTier.unmatchedActionIndices) {
      const fp = raw.actions[actionIdx];
      const primitive = normalizeToPrimitive(fp.actionType, fp.evidenceText);
      const expectedTypes = new Set(expected.map((e) => e.actionType));
      if (primitive && testCase.forbiddenPrimitiveActions?.includes(primitive)) {
        families.add("unsupported_emission");
        falsePositiveNotes.push(`forbidden ${primitive}: ${fp.evidenceText.slice(0, 60)}`);
      } else if (primitive && expectedTypes.has(primitive)) {
        if (expected.some((e) => e.cardFace && e.cardFace !== fp.faceId)) {
          families.add("wrong_face_or_zone");
        } else {
          families.add("wrong_ability_attachment");
        }
        falsePositiveNotes.push(`structure/attachment: ${primitive} @ ${fp.evidenceText.slice(0, 60)}`);
      } else if (primitive && !expectedTypes.has(primitive)) {
        families.add("wrong_primitive");
        falsePositiveNotes.push(`wrong primitive ${primitive}: ${fp.evidenceText.slice(0, 60)}`);
      } else {
        families.add("other_parser_mismatch");
        falsePositiveNotes.push(fp.evidenceText.slice(0, 80));
      }
    }

    for (const f of families) byFamily[f] += 1;
    inventory.push({
      caseId: testCase.id,
      cardName: (testCase as { cardName?: string }).cardName,
      families: [...families],
      missedGold,
      falsePositiveNotes,
    });
  }

  inventory.sort((a, b) => a.caseId.localeCompare(b.caseId));
  return { byFamily, inventory };
}

async function main() {
  if (DEBUG) {
    console.warn("[debug] Provenance guard bypassed — NOT an official benchmark report.");
  }

  const repoRoot = resolve(process.cwd(), "..");
  execSync(
    "git checkout 3eaae76 -- web/src/lib/deck-builder/golden-catalog/oracle-action-parser-v1.ts web/src/lib/deck-builder/golden-catalog/oracle-action-schema.ts",
    { cwd: repoRoot, stdio: "inherit" },
  );

  const catalog = await loadGoldenCatalogIndex();
  const dev = loadDataset(DEV_PATH);
  const val = loadDataset(VAL_PATH);
  const blind = loadDataset(BLIND_PATH);

  let provenanceGuard: { pass: boolean; error?: string } = { pass: true };
  if (!DEBUG) {
    try {
      guardOfficialBenchmarkDataset({ envelope: dev, catalog, manifestContentHash: dev.contentHash });
      guardOfficialBenchmarkDataset({ envelope: val, catalog, manifestContentHash: val.contentHash });
    } catch (err) {
      provenanceGuard = { pass: false, error: err instanceof Error ? err.message : String(err) };
      throw err;
    }
  }

  const devLookup = buildDevelopmentCardNameLookup();
  const valLookup = buildFullEvalCardNameLookup();

  const identityResults = [
    ...dev.cases.map((c) =>
      auditEvalCaseIdentity({
        testCase: c,
        dataset: "development_set_v16",
        cardName: (c as { cardName?: string }).cardName ?? devLookup.get(c.id),
        catalog,
      }),
    ),
    ...val.cases.map((c) =>
      auditEvalCaseIdentity({
        testCase: c,
        dataset: "validation_set_v8",
        cardName: (c as { cardName?: string }).cardName ?? valLookup.get(c.id),
        catalog,
      }),
    ),
    ...blind.cases.map((c) =>
      auditEvalCaseIdentity({
        testCase: c,
        dataset: "final_blind_test_v2",
        cardName: (c as { cardName?: string }).cardName,
        catalog,
      }),
    ),
  ];
  const identitySummary = summarizeIdentityAudit(identityResults);

  const devResults = evaluateCaseSet(dev.cases, "development_set_v16");
  const valResults = evaluateCaseSet(val.cases, "validation_set_v8");
  const validationFailureInventory = classifyValidationFailures(val.cases);

  const devSummary = summarizeSetResults(devResults, dev.cases);
  const valSummary = summarizeSetResults(valResults, val.cases);

  const report = {
    generatedAt: new Date().toISOString(),
    official: !DEBUG,
    parserVersion: PARSER_V12,
    parserCheckpointCommit: "3eaae76",
    datasets: {
      development: DEV_PATH,
      validation: VAL_PATH,
    },
    provenanceGuard,
    goldCompleteness: {
      development: dev.cases.filter(
        (c) => (c as { goldCompletenessStatus?: string }).goldCompletenessStatus === "complete",
      ).length / dev.cases.length,
      validation: val.cases.filter(
        (c) => (c as { goldCompletenessStatus?: string }).goldCompletenessStatus === "complete",
      ).length / val.cases.length,
    },
    identityAudit: {
      totalCasesChecked: identitySummary.totalCasesChecked,
      exactMatchCases: identitySummary.exactMatchCases,
      developmentExactMatch: identityResults.filter((r) => r.dataset === "development_set_v16" && r.exactMatch).length,
      validationExactMatch: identityResults.filter((r) => r.dataset === "validation_set_v8" && r.exactMatch).length,
      blindExactMatch: identityResults.filter((r) => r.dataset === "final_blind_test_v2" && r.exactMatch).length,
    },
    developmentSetV16: {
      contentHash: dev.contentHash,
      ...devSummary,
    },
    validationSetV8: {
      contentHash: val.contentHash,
      ...valSummary,
      failureFamilyInventory: validationFailureInventory,
    },
    finalBlindTestV2: {
      contentHash: blind.contentHash,
      caseCount: blind.cases.length,
      parserExecuted: false,
      parserExecutionCount: (blind as { parserExecutionCount?: number }).parserExecutionCount ?? 0,
      sealed: (blind as { sealed?: boolean }).sealed ?? false,
    },
  };

  const outPath = resolve(
    process.cwd(),
    "reports",
    DEBUG ? "catalog-baseline-v12-debug.json" : "catalog-baseline-v12-official.json",
  );
  mkdirSync(resolve(outPath, ".."), { recursive: true });
  writeFileSync(outPath, JSON.stringify(report, null, 2), "utf8");

  execSync(
    "git checkout HEAD -- web/src/lib/deck-builder/golden-catalog/oracle-action-parser-v1.ts web/src/lib/deck-builder/golden-catalog/oracle-action-schema.ts",
    { cwd: repoRoot, stdio: "inherit" },
  );

  console.log(DEBUG ? "Catalog baseline v1.12 (DEBUG)" : "Catalog baseline v1.12 (OFFICIAL)");
  console.log(`  provenance guard: ${provenanceGuard.pass ? "pass" : "FAIL"}`);
  console.log(`  identity exact: ${report.identityAudit.exactMatchCases}/${report.identityAudit.totalCasesChecked}`);
  console.log(`  dev v16 hash: ${dev.contentHash}`);
  console.log(`  val v8 hash: ${val.contentHash}`);
  console.log(`  dev accepted P=${(devSummary.accepted.precision * 100).toFixed(1)}% R=${(devSummary.accepted.recall * 100).toFixed(1)}%`);
  console.log(`  val accepted P=${(valSummary.accepted.precision * 100).toFixed(1)}% R=${(valSummary.accepted.recall * 100).toFixed(1)}%`);
  console.log(`  blind parser executions: ${report.finalBlindTestV2.parserExecutionCount}`);
  console.log(`  report: ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
