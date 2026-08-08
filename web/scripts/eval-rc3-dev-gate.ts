/**
 * RC3 development gate — reports metrics by corpus slice. Never executes on v13.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { parseOracleSemanticsRC3, ORACLE_ACTION_RC3_PARSER_VERSION } from "../src/lib/deck-builder/golden-catalog/oracle-semantic-parse-rc3";
import { verifySemanticParseIntegrity } from "../src/lib/deck-builder/golden-catalog/oracle-semantic-integrity";
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";
import { evaluateCaseSemantic, sumSemanticMetrics, type SemanticCaseMetrics } from "./oracle-action-semantic-matcher";
import { applyGoldMigrationV135 } from "./lib/rc3-gold-migration-v135";
import { isForbiddenPolicyLeak, guardrailLeakageFamily, type GuardrailLeakageFamily } from "./lib/rc3-case-scope-scoring";

type Envelope = { cases: OracleActionEvalCaseV2[]; contentHash?: string };

function evalSlice(cases: OracleActionEvalCaseV2[], label: string) {
  const rows: SemanticCaseMetrics[] = [];
  let semanticInvalid = 0;
  let semanticInvalidActions = 0;
  let idViolations = 0;
  let provenanceViolations = 0;
  let costLeakage = 0;
  let reminderLeakage = 0;
  let triggerEventLeakage = 0;
  let permissionLeakage = 0;
  let needsReviewTp = 0;
  let needsReviewFp = 0;

  for (const testCase of cases) {
    const parsed = parseOracleSemanticsRC3({
      oracleId: testCase.oracleId,
      oracleText: testCase.oracleText,
      cardFace: testCase.cardFace,
    });
    semanticInvalid += parsed.semanticValidation.invalidCount;
    semanticInvalidActions += parsed.semanticValidation.invalidActionCount;
    rows.push(evaluateCaseSemantic(testCase, parsed));

    const integrity = verifySemanticParseIntegrity(parsed, testCase.oracleText);
    idViolations += integrity.idViolations.length;
    provenanceViolations += integrity.provenanceViolations.length;

    for (const action of parsed.actions) {
      if (action.reviewStatus === "needs_review") {
        const matched = testCase.expectedPrimitiveActions.some(
          (g) => !g.negative && g.actionType === action.actionType,
        );
        if (matched) needsReviewTp++;
        else needsReviewFp++;
      }
      const ev = action.provenance.actionSpan.text;
      if (action.actionType === "sacrifice" && /^\{[^}]+\}/.test(testCase.oracleText) && testCase.oracleText.indexOf(":") > 0) {
        const colon = testCase.oracleText.indexOf(":");
        if (action.provenance.actionSpan.cardStart < colon) costLeakage++;
      }
      if (/\([^)]{20,}\)/.test(ev) && /Flashback|Discover|Cycling/i.test(ev)) reminderLeakage++;
      if (action.actionType === "cast" && /Whenever you cast|When you cast|If you cast/i.test(ev)) triggerEventLeakage++;
      // Permission leakage: persistent cast permission emitted as L2 — not static "can't cast" restrictions
      if (
        action.actionType === "cast" &&
        /You may cast[^.\n]*from your (?:graveyard|hand)\b/i.test(testCase.oracleText) &&
        /You may cast[^.\n]*from your (?:graveyard|hand)\b/i.test(ev) &&
        !/without paying|this turn|that card|from exile/i.test(ev)
      ) {
        const expectedPermissionCast = testCase.expectedPrimitiveActions.some(
          (g) =>
            !g.negative &&
            g.actionType === "cast" &&
            ev.toLowerCase().includes((g.evidenceContains ?? "").toLowerCase().slice(0, 12)),
        );
        if (!expectedPermissionCast) permissionLeakage++;
      }
    }
  }

  const accepted = sumSemanticMetrics(rows);
  return {
    label,
    caseCount: cases.length,
    accepted,
    needsReview: { tp: needsReviewTp, fp: needsReviewFp },
    semanticInvalid,
    semanticInvalidActionCount: semanticInvalidActions,
    semanticValidatorViolationCount: semanticInvalid,
    invariants: {
      idViolations,
      provenanceViolations,
      costLeakage,
      reminderLeakage,
      triggerEventLeakage,
      permissionLeakage,
    },
  };
}

function evalGuardrails(path: string) {
  const envelope = JSON.parse(readFileSync(path, "utf8")) as Envelope & {
    cases: Array<
      OracleActionEvalCaseV2 & {
        forbiddenPrimitiveActions?: string[];
        coverageStratum?: string;
        caseScope?: string;
        scopeEvidenceContains?: string;
      }
    >;
  };
  let forbiddenEmitted = 0;
  let acceptedViolations = 0;
  let needsReviewViolations = 0;
  const violationDetails: Array<{ caseId: string; primitive: string; evidence: string; stratum?: string }> = [];
  const leakageByFamily: Record<GuardrailLeakageFamily, number> = {
    persistent_cast_permission: 0,
    trigger_event_cast_reference: 0,
    reminder_mechanic_text: 0,
    static_cost_reduction: 0,
    activated_cost_only: 0,
    static_restriction: 0,
    ability_scope_exclusion: 0,
    other: 0,
  };

  for (const testCase of envelope.cases) {
    const parsed = parseOracleSemanticsRC3({
      oracleId: testCase.oracleId,
      oracleText: testCase.oracleText,
      cardFace: testCase.cardFace,
    });
    const forbidden = new Set(testCase.forbiddenPrimitiveActions ?? []);
    for (const action of parsed.actions.filter((a) => a.reviewStatus === "accepted")) {
      if (!forbidden.has(action.actionType)) continue;
      if (
        !isForbiddenPolicyLeak({
          testCase,
          actionType: action.actionType,
          cardStart: action.provenance.actionSpan.cardStart,
          cardEnd: action.provenance.actionSpan.cardEnd,
        })
      ) {
        continue;
      }
      forbiddenEmitted++;
      acceptedViolations++;
      const family = guardrailLeakageFamily(testCase.coverageStratum);
      leakageByFamily[family]++;
      violationDetails.push({
        caseId: testCase.id,
        primitive: action.actionType,
        evidence: action.provenance.actionSpan.text,
        stratum: testCase.coverageStratum,
      });
    }
    for (const action of parsed.actions.filter((a) => a.reviewStatus === "needs_review")) {
      if (!forbidden.has(action.actionType)) continue;
      if (
        isForbiddenPolicyLeak({
          testCase,
          actionType: action.actionType,
          cardStart: action.provenance.actionSpan.cardStart,
          cardEnd: action.provenance.actionSpan.cardEnd,
        })
      ) {
        needsReviewViolations++;
      }
    }
  }

  return {
    label: "policy_guardrail",
    path,
    caseCount: envelope.cases.length,
    forbiddenActionsEmitted: forbiddenEmitted,
    acceptedViolations,
    needsReviewViolations,
    violationDetails,
    leakageByFamily,
  };
}

function evalFamilyMetrics(cases: Array<OracleActionEvalCaseV2 & { coverageStratum?: string; spentV12Regression?: boolean }>) {
  const families = new Map<
    string,
    {
      spentV12: SemanticCaseMetrics[];
      unrelated: SemanticCaseMetrics[];
    }
  >();

  for (const testCase of cases) {
    const family = testCase.coverageStratum ?? "unknown";
    if (!families.has(family)) families.set(family, { spentV12: [], unrelated: [] });
    const parsed = parseOracleSemanticsRC3({
      oracleId: testCase.oracleId,
      oracleText: testCase.oracleText,
      cardFace: testCase.cardFace,
    });
    const row = evaluateCaseSemantic(testCase, parsed);
    const bucket = testCase.spentV12Regression ? "spentV12" : "unrelated";
    families.get(family)![bucket].push(row);
  }

  const table: Record<string, unknown> = {};
  for (const [family, buckets] of families) {
    table[family] = {
      spentV12: { ...sumSemanticMetrics(buckets.spentV12), caseCount: buckets.spentV12.length },
      unrelated: { ...sumSemanticMetrics(buckets.unrelated), caseCount: buckets.unrelated.length },
    };
  }
  return table;
}

function aggregateClauseNativeStats(cases: OracleActionEvalCaseV2[]) {
  let v1Only = 0;
  let nativeOnly = 0;
  let overlap = 0;
  let disagreements = 0;
  for (const testCase of cases) {
    const parsed = parseOracleSemanticsRC3({
      oracleId: testCase.oracleId,
      oracleText: testCase.oracleText,
      cardFace: testCase.cardFace,
    });
    const stats = (parsed.legacy as { clauseNativeStats?: { v1Only: number; nativeOnly: number; overlap: number; disagreements: number } })
      .clauseNativeStats;
    if (stats) {
      v1Only += stats.v1Only;
      nativeOnly += stats.nativeOnly;
      overlap += stats.overlap;
      disagreements += stats.disagreements;
    }
  }
  return { v1Only, nativeOnly, overlap, disagreements };
}

function load(path: string): OracleActionEvalCaseV2[] {
  return (JSON.parse(readFileSync(path, "utf8")) as Envelope).cases;
}

function loadScoringCases(path: string): OracleActionEvalCaseV2[] {
  return applyGoldMigrationV135(load(path));
}

function main() {
  const repoRoot = resolve(process.cwd(), "..");
  const parserCommit = execSync("git rev-parse HEAD", { cwd: repoRoot, encoding: "utf8" }).trim();
  const parserBlob = execSync(`git hash-object web/src/lib/deck-builder/golden-catalog/oracle-rc3-transform.ts`, {
    cwd: repoRoot,
    encoding: "utf8",
  }).trim();

  const legacyV14Paths = [
    { path: "data/oracle-action-eval-development-v26-v14.json", label: "legacy_dev_v26_v14" },
    { path: "data/oracle-action-eval-development-generalization-expansion-v2-v14.json", label: "legacy_exp_v2_v14" },
    { path: "data/oracle-action-eval-development-generalization-expansion-v3-v14.json", label: "legacy_exp_v3_v14" },
    { path: "data/oracle-action-eval-development-generalization-expansion-v5-v14.json", label: "legacy_exp_v5_v14" },
  ];

  const legacySlices = legacyV14Paths.map((p) => evalSlice(loadScoringCases(p.path), p.label));

  const positiveCatalog = loadScoringCases("data/oracle-action-eval-rc3-positive-training-catalog-v133.json");
  let syntheticFixtures: OracleActionEvalCaseV2[] = [];
  try {
    syntheticFixtures = loadScoringCases("data/oracle-action-eval-rc3-synthetic-structural-fixtures-v133.json");
  } catch {
    syntheticFixtures = [];
  }
  const positiveAll = [...positiveCatalog, ...syntheticFixtures];

  const v12Regression = positiveCatalog.filter((c) => (c as { spentV12Regression?: boolean }).spentV12Regression);
  const unrelatedCatalog = positiveCatalog.filter((c) => !(c as { spentV12Regression?: boolean }).spentV12Regression);

  const v12Slice = evalSlice(v12Regression, "v12_regression_slice");
  const unrelatedCatalogSlice = evalSlice(unrelatedCatalog, "unrelated_catalog_positive_slice");
  const syntheticSlice = evalSlice(syntheticFixtures, "synthetic_structural_fixtures");
  const positiveCombined = evalSlice(positiveAll, "positive_training_combined");
  const guardrails = evalGuardrails("data/oracle-action-eval-rc3-policy-guardrail-v132.json");
  const familyMetrics = evalFamilyMetrics(positiveCatalog);

  const combinedCases = [
    ...legacyV14Paths.flatMap((p) => loadScoringCases(p.path)),
    ...positiveCatalog,
  ];

  function countExtractionSources(cases: OracleActionEvalCaseV2[]) {
    let v1Legacy = 0;
    let rc3Transform = 0;
    let rc3ClauseNative = 0;
    let untagged = 0;
    for (const testCase of cases) {
      const parsed = parseOracleSemanticsRC3({ oracleId: testCase.oracleId, oracleText: testCase.oracleText, cardFace: testCase.cardFace });
      for (const action of parsed.legacy.actions) {
        const src = (action as { extractionSource?: string }).extractionSource;
        if (src === "v1_legacy") v1Legacy++;
        else if (src === "rc3_transform") rc3Transform++;
        else if (src === "rc3_clause_native") rc3ClauseNative++;
        else untagged++;
      }
    }
    return { v1_legacy: v1Legacy, rc3_transform: rc3Transform, rc3_clause_native: rc3ClauseNative, untagged };
  }

  const extractionSourceCounts = countExtractionSources(combinedCases);

  const combined = evalSlice(combinedCases, "combined_development");
  const clauseNativeStats = aggregateClauseNativeStats(combinedCases);

  const putIntoHandAudit = {
    wrongDrawBefore: "RC2 mapped put-into-hand phrases to draw",
    rc3Reclassified: combinedCases.filter((c) => {
      const p = parseOracleSemanticsRC3({ oracleId: c.oracleId, oracleText: c.oracleText, cardFace: c.cardFace });
      return p.actions.some((a) => a.actionType === "put_into_hand");
    }).length,
    remainingDrawForPutPhrases: combinedCases.filter((c) => {
      const p = parseOracleSemanticsRC3({ oracleId: c.oracleId, oracleText: c.oracleText, cardFace: c.cardFace });
      return p.actions.some(
        (a) => a.actionType === "draw" && /put\b[^.]*into\b[^.]*hand/i.test(a.provenance.actionSpan.text),
      );
    }).length,
  };

  const report = {
    generatedAt: new Date().toISOString(),
    checkpoint: "rc3-stabilization-v134-checkpoint-1",
    lineage: {
      parentCommit: "6a757a736dfda9004860bb38d5e677880590882c",
      parentVersion: "oracle-action-v1.31-rc3-ast-dev",
      intermediateDevelopmentState: "v1.32 — working development on parent; no separate immutable commit",
      currentVersion: ORACLE_ACTION_RC3_PARSER_VERSION,
      note: "6a757a73 is the corrected v1.31 freeze — do not retroactively label it v1.32",
    },
    benchmarkSlices: {
      unrelatedCatalogPositive: { caseCount: unrelatedCatalog.length, note: "Catalog-backed generalization metric denominator" },
      syntheticStructuralFixtures: { caseCount: syntheticFixtures.length, excludedFromCatalogRecall: true },
      demilichOverlap: "intentional_same_oracle_disjoint_scope_policy_fixture — see disjoint-scope-oracle-overlap-v133.json",
    },
    priorCheckpoint: {
      version: "oracle-action-v1.33-rc3-ast-dev",
      note: "Accepted development checkpoint — search default promoted; granted span detector introduced",
      intermediateFrom: "oracle-action-v1.31-rc3-ast-dev @ 6a757a73 via v1.32 working state",
    },
    parser: {
      version: ORACLE_ACTION_RC3_PARSER_VERSION,
      commit: parserCommit,
      blobSha: parserBlob,
      lineage: "RC3 — separate from frozen oracle-action-rc2",
    },
    permissionLeakageAudit: {
      resolution: "stale_diagnostic_false_positive",
      cases: [
        {
          caseId: "eval-0193",
          cardName: "Codie, Vociferous Codex",
          reclassifiedAs: "legitimate_one_shot_cast",
          explanation: "Static restriction 'can't cast permanent spells' no longer triggers heuristic.",
        },
        {
          caseId: "dev-v9-011",
          cardName: "Omniscience",
          reclassifiedAs: "benchmark_has_gold_for_permission_cast",
          explanation: "Persistent hand-cast permission is intentional gold on this case — not guardrail leakage.",
        },
      ],
    },
    guardrailViolations: {
      before: { acceptedForbidden: 2, cases: ["rc3-guard-0001", "rc3-guard-0013"], pack: "rc3-policy-guardrail-v130" },
      after: {
        acceptedForbidden: guardrails.acceptedViolations,
        details: guardrails.violationDetails,
        leakageByFamily: guardrails.leakageByFamily,
        pack: "rc3-policy-guardrail-v132",
      },
    },
    taxonomyV14: {
      put_into_hand: "implemented",
      distinctFromDraw: true,
      distinctFromReturnToHand: true,
    },
    semanticValidator: {
      status: "implemented",
      releaseGate: "structural invalid only — inferSupportedPrimitiveFromEvidence removed from gating",
    },
    structuralFamilies: {
      granted_ability: { status: "clause_native_recursive", note: "GrantedAbility → nestedAbilityBlock recursive parse" },
      search_put_shuffle: { status: "clause_native_object_identity", note: "selectedObjectId → referentObjectId chain links" },
      mdfc_transform: { status: "partial_explicit_state", note: "TransformTransitionNode with mode/source/destination" },
      activated_post_colon: { status: "clause_native_colon_aware", note: "costRegion/effectRegion structural split" },
      replacement: { status: "clause_native_replacement_ast", note: "ReplacementEffect eventClause + replacementClause" },
      put_into_hand: putIntoHandAudit,
    },
    familyMetrics,
    clauseNativeStats: {
      ...clauseNativeStats,
      priorPreview: {
        corpus: "combined_development_430_cases",
        caseCount: 430,
        nativeOnlyActionCount: 185,
        note: "v1.31 preview counted native-only across full combined dev corpus including legacy v1.4",
      },
      currentShadowInventory: {
        corpus: "positive_training_catalog_v133_plus_legacy_v14",
        caseCount: combinedCases.length,
        note: "v1.32 inventory script labels corpus explicitly — count differs by denominator only",
      },
    },
    extractionSourceCounts,
    metrics: {
      legacyV14Corpora: legacySlices,
      v12RegressionSlice: v12Slice,
      unrelatedCatalogPositiveSlice: unrelatedCatalogSlice,
      syntheticStructuralFixtures: syntheticSlice,
      positiveTrainingCombined: positiveCombined,
      policyGuardrails: guardrails,
      combinedDevelopment: combined,
    },
    gates: {
      combinedDevelopment: {
        precisionTarget: 0.98,
        recallTarget: 0.92,
        pass:
          combined.accepted.precision >= 0.98 &&
          combined.accepted.recall >= 0.92 &&
          combined.semanticInvalid === 0,
      },
      unrelatedCatalogPositive: {
        precisionTarget: 0.95,
        recallTarget: 0.9,
        pass:
          unrelatedCatalogSlice.accepted.precision >= 0.95 && unrelatedCatalogSlice.accepted.recall >= 0.9,
      },
      policyGuardrails: {
        acceptedForbiddenEmissionsTarget: 0,
        pass: guardrails.acceptedViolations === 0,
      },
    },
    v13Execution: "NOT_RUN — parserExecutionCount remains 0",
  };

  const outDir = resolve("data/milestones/rc3-development");
  mkdirSync(outDir, { recursive: true });
  const outPath = resolve(outDir, "rc3-checkpoint-v134-report.json");
  writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ outPath, report }, null, 2));
}

main();
