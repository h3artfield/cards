/**
 * Complete blind v2 gold certification — resolve incomplete cases, reseal immutable benchmark.
 * No parser execution. Run: npx tsx scripts/finalize-blind-gold-v2.ts
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvLocal } from "./lib/script-env";
import { loadGoldenCatalogIndex, combinedGoldenOracleText } from "./lib/load-golden-catalog-index";
import {
  computeDatasetContentHash,
  type CatalogEvalCase,
  type EvalDatasetEnvelope,
} from "./lib/eval-provenance-guard";
import { applyValidationGoldPolicyV11 } from "./lib/validation-gold-policy-v11";
import { sanitizeGoldPrimitives } from "./lib/gold-sanitize";
import { inferDerivedRoles } from "../src/lib/deck-builder/golden-catalog/oracle-action-taxonomy";
import { evidenceMatchesOracle } from "./oracle-action-eval-shared";
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";

loadEnvLocal();

const BLIND_V2_PATH = "data/oracle-action-eval-final-blind-v2.json";
const CERTIFIER = "blind-gold-finalizer-v2-policy";

type MaintenanceClassification =
  | "recoverable_gold"
  | "ambiguous_identity_semantics"
  | "irrecoverable_benchmark_case";

type BlindAdjudication = {
  classification: MaintenanceClassification;
  patch: Partial<CatalogEvalCase>;
  rationale: string;
};

const BLIND_ADJUDICATIONS: Record<string, BlindAdjudication> = {
  "blind-0028": {
    classification: "recoverable_gold",
    rationale:
      "Static flashback grant is Layer 1; card reminder cast is forbidden. No Layer-2 primitive for granting flashback.",
    patch: {
      expectedPrimitiveActions: [],
      expectedStructure: { optional: true },
      forbiddenPrimitiveActions: ["cast"],
      expectedRoles: [{ role: "recursion", fromPrimitiveActions: [] }],
    },
  },
  "blind-0031": {
    classification: "recoverable_gold",
    rationale:
      "Activated destroy effect is Layer 2; static life-payment restriction and activated cost exile are Layer 1.",
    patch: {
      expectedStructure: { minActivatedAbilities: 1 },
      expectedPrimitiveActions: [
        {
          actionType: "destroy",
          evidenceContains: "Destroy each nonland permanent with mana value X or less",
        },
      ],
      forbiddenPrimitiveActions: ["cast", "sacrifice"],
    },
  },
  "blind-0044": {
    classification: "recoverable_gold",
    rationale:
      "Static graveyard cast/play permission is Layer 1 optional structure; no card-specific Layer-2 primitive.",
    patch: {
      expectedStructure: { optional: true },
      expectedPrimitiveActions: [],
      forbiddenPrimitiveActions: ["cast"],
      expectedRoles: [{ role: "recursion", fromPrimitiveActions: [] }],
    },
  },
  "blind-0060": {
    classification: "recoverable_gold",
    rationale:
      "Aftermath back-face exile is Layer 2; reminder cast from graveyard is forbidden.",
    patch: {
      cardFace: "back",
      expectedPrimitiveActions: [
        {
          actionType: "exile",
          evidenceContains: "Exile any number of target creatures that have -1/-1 counters on them",
          cardFace: "back",
        },
      ],
      forbiddenPrimitiveActions: ["cast"],
      expectedRoles: [{ role: "removal", fromPrimitiveActions: ["exile"] }],
    },
  },
  "blind-0063": {
    classification: "recoverable_gold",
    rationale:
      "Sacrifice in activated cost is Layer 1 only; add_mana is the Layer-2 effect primitive.",
    patch: {
      expectedStructure: { minActivatedAbilities: 1 },
      expectedPrimitiveActions: [
        {
          actionType: "add_mana",
          evidenceContains: "Add one mana of any color",
        },
      ],
      forbiddenPrimitiveActions: ["sacrifice"],
    },
  },
};

function assessCompleteness(testCase: CatalogEvalCase): boolean {
  const corpus = testCase.oracleText;
  const positives = testCase.expectedPrimitiveActions.filter((p) => !p.negative);
  for (const p of positives) {
    if (!evidenceMatchesOracle(corpus, p.evidenceContains)) return false;
  }
  const hasLayer1 =
    (testCase.expectedStructure?.minTriggeredAbilities ?? 0) > 0 ||
    (testCase.expectedStructure?.minActivatedAbilities ?? 0) > 0 ||
    testCase.expectedStructure?.optional === true ||
    (testCase.forbiddenPrimitiveActions?.length ?? 0) > 0 ||
    /\b(can't|cannot|don't|do not)\b/i.test(corpus);
  if (positives.length === 0 && !hasLayer1) return false;
  return true;
}

async function main() {
  const catalog = await loadGoldenCatalogIndex();
  const blindPath = resolve(process.cwd(), BLIND_V2_PATH);
  const blind = JSON.parse(readFileSync(blindPath, "utf8")) as EvalDatasetEnvelope & {
    cases: CatalogEvalCase[];
    contentHash: string;
  };

  const reviewedAt = new Date().toISOString();
  const maintenanceLog: Array<Record<string, unknown>> = [];
  let incompleteAfter = 0;

  const cases: CatalogEvalCase[] = blind.cases.map((c) => {
    const golden = catalog.byOracleId.get(c.oracleId);
    if (!golden) throw new Error(`Blind case ${c.id} oracleId ${c.oracleId} not in catalog`);

    const adjudication = BLIND_ADJUDICATIONS[c.id];
    let testCase: OracleActionEvalCaseV2 = {
      ...(c as OracleActionEvalCaseV2),
      ...(adjudication?.patch ?? {}),
      oracleText: combinedGoldenOracleText(golden),
    };

    if (adjudication) {
      maintenanceLog.push({
        caseId: c.id,
        cardName: c.cardName,
        classification: adjudication.classification,
        rationale: adjudication.rationale,
      });
    }

    let primitives = testCase.expectedPrimitiveActions.filter((p) => !p.negative);
    primitives = sanitizeGoldPrimitives(testCase.oracleText, primitives);
    testCase = { ...testCase, expectedPrimitiveActions: primitives };

    const policyResult = applyValidationGoldPolicyV11(testCase);
    testCase = policyResult.testCase;

    const roles = inferDerivedRoles(
      testCase.expectedPrimitiveActions.filter((p) => !p.negative).map((p) => p.actionType),
    );
    const complete = assessCompleteness(testCase as CatalogEvalCase);
    if (!complete) incompleteAfter += 1;

    return {
      ...testCase,
      expectedRoles:
        adjudication?.patch.expectedRoles ??
        (roles.length
          ? roles.map((role) => ({
              role,
              fromPrimitiveActions: testCase.expectedPrimitiveActions
                .filter((p) => !p.negative)
                .map((p) => p.actionType),
            }))
          : c.expectedRoles),
      goldReviewVersion: CERTIFIER,
      goldReviewedAt: reviewedAt,
      goldReviewer: CERTIFIER,
      goldReviewStatus: "reviewed",
      goldCompletenessStatus: complete ? "complete" : "incomplete",
      identityStatus: "catalog_exact",
      taxonomyVersion: "three-layer-v1.3",
    } as CatalogEvalCase;
  });

  if (incompleteAfter > 0) {
    const bad = cases.filter((c) => c.goldCompletenessStatus === "incomplete").map((c) => c.id);
    throw new Error(`Still ${incompleteAfter} incomplete blind cases: ${bad.join(", ")}`);
  }

  const envelope: EvalDatasetEnvelope & { cases: CatalogEvalCase[] } = {
    setClassification: blind.setClassification ?? "final_blind_test_v2",
    evaluationSetVersion: "final-blind-v2-certified",
    taxonomyVersion: "three-layer-v1.3",
    contentHash: "",
    cases,
    sealed: true,
    parserExecutionCount: 0,
    benchmarkStatus: "catalog_clean",
    usableForParserEvaluation: true,
    goldCertification: {
      certifierId: CERTIFIER,
      certifiedAt: reviewedAt,
      priorContentHash: blind.contentHash,
      casesReviewed: `${cases.length}/${cases.length}`,
      incompleteCaseCount: 0,
      parserExecutionCount: 0,
      rc1OutputConsulted: false,
      maintenanceLog,
      policyNote:
        "Independent gold finalization using three-layer-v1.3 policy. No parser output consulted.",
    },
  };
  envelope.contentHash = computeDatasetContentHash(envelope.cases);

  const outPath = resolve(process.cwd(), "data/oracle-action-eval-final-blind-v2-certified.json");
  writeFileSync(outPath, `${JSON.stringify(envelope, null, 2)}\n`, "utf8");

  const auditDir = resolve(process.cwd(), "data/milestones/blind-v2-gold-certification");
  mkdirSync(auditDir, { recursive: true });
  writeFileSync(
    resolve(auditDir, "blind-v2-gold-certification-report.json"),
    `${JSON.stringify(
      {
        blindSet: "final_blind_test_v2",
        priorHash: blind.contentHash,
        certifiedHash: envelope.contentHash,
        certifiedAt: reviewedAt,
        incompleteCaseCount: 0,
        parserExecutionCount: 0,
        maintenanceLog,
        casesReviewed: cases.length,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  writeFileSync(
    resolve(auditDir, "blind-v2-gold-freeze.json"),
    `${JSON.stringify(
      {
        blindSet: "final_blind_test_v2",
        certifiedHash: envelope.contentHash,
        caseCount: cases.length,
        sealed: true,
        goldReviewStatus: "reviewed",
        goldCompletenessStatus: "complete",
        incompleteCaseCount: 0,
        parserExecutionCount: 0,
        taxonomyVersion: "three-layer-v1.3",
        frozenAt: reviewedAt,
        outputPath: "data/oracle-action-eval-final-blind-v2-certified.json",
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  console.log(
    JSON.stringify(
      {
        outPath,
        priorHash: blind.contentHash,
        certifiedHash: envelope.contentHash,
        caseCount: cases.length,
        incompleteCaseCount: 0,
        maintenanceLog,
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
