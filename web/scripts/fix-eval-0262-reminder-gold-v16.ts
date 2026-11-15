/**
 * eval-0262 reminder-text gold correction → development_set_v16.
 * Run: npx tsx scripts/fix-eval-0262-reminder-gold-v16.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvLocal } from "./lib/script-env";
import {
  computeDatasetContentHash,
  SECOND_PASS_GOLD_REVIEW_VERSION,
  type CatalogEvalCase,
  type EvalDatasetEnvelope,
} from "./lib/eval-provenance-guard";
import { evidenceMatchesOracle } from "./oracle-action-eval-shared";
import { TAXONOMY_VERSION } from "./oracle-action-eval-shared";
import type { ExpectedMechanicContext } from "./lib/gold-reminder-text-policy";
import { inferDerivedRoles } from "../src/lib/deck-builder/golden-catalog/oracle-action-taxonomy";

loadEnvLocal();

const CASE_ID = "eval-0262";
const CORRECTOR = "eval-0262-reminder-gold-v1";
const TOKEN_EVIDENCE = "Create two 1/1 green Saproling creature tokens.";

async function main() {
  const v15Path = resolve(process.cwd(), "data/oracle-action-eval-development-v15.json");
  const v15 = JSON.parse(readFileSync(v15Path, "utf8")) as EvalDatasetEnvelope & {
    cases: CatalogEvalCase[];
    contentHash: string;
  };

  const prior = v15.cases.find((c) => c.id === CASE_ID);
  if (!prior) throw new Error(`${CASE_ID} not in v15`);

  const adventureCorpus = prior.oracleText.split("\n//\n")[1] ?? "";
  if (!evidenceMatchesOracle(adventureCorpus, TOKEN_EVIDENCE)) {
    throw new Error(`Token evidence not found in Fungus Frolic face: ${TOKEN_EVIDENCE}`);
  }

  const expectedMechanicContext: ExpectedMechanicContext = {
    mechanic: "adventure",
    componentType: "adventure",
    derivedMechanicBehaviors: {
      adventureResolutionDestination: "exile",
      laterCastPermissionFromExile: true,
    },
    excludedReminderSpans: ["You may cast the creature later from exile", "Then exile this card"],
  };

  const expectedPrimitiveActions = [
    {
      actionType: "create_token" as const,
      evidenceContains: TOKEN_EVIDENCE,
      cardFace: "back" as const,
    },
  ];

  const roles = inferDerivedRoles(["create_token"]);

  const reviewedAt = new Date().toISOString();
  const corrected: CatalogEvalCase = {
    ...prior,
    expectedPrimitiveActions,
    expectedStructure: {
      minTriggeredAbilities: 1,
      abilityTypes: ["spell_effect"],
    },
    expectedMechanicContext,
    expectedRoles: roles.map((role) => ({
      role,
      fromPrimitiveActions: ["create_token"],
    })),
    evaluationSetVersion: "development-v16-reminder-gold-v1",
    goldReviewedAt: reviewedAt,
    goldReviewer: CORRECTOR,
    goldCompleter: CORRECTOR,
    goldCompletedAt: reviewedAt,
    goldReviewStatus: "reviewed",
    goldCompletenessStatus: "complete",
  };

  const v16Cases = v15.cases.map((c) => (c.id === CASE_ID ? corrected : c));
  const v16Hash = computeDatasetContentHash(v16Cases);

  if (v16Hash === v15.contentHash) {
    console.log(JSON.stringify({ unchanged: true, hash: v16Hash }, null, 2));
    return;
  }

  const correction = {
    caseId: CASE_ID,
    correctedAt: reviewedAt,
    corrector: CORRECTOR,
    policy: "Adventure reminder text is Layer 1 mechanic context, not Layer 2 primitive gold",
    removedPrimitives: prior.expectedPrimitiveActions.filter(
      (p) => p.actionType === "cast" && /cast the creature later from exile/i.test(p.evidenceContains),
    ),
    addedMechanicContext: expectedMechanicContext,
    layer2GoldAfter: expectedPrimitiveActions,
  };

  const v16 = {
    ...v15,
    setClassification: "development_set_v16",
    evaluationSetVersion: "development-v16-reminder-gold-v1",
    contentHash: v16Hash,
    parentClassification: "development_set_v15",
    parentContentHash: v15.contentHash,
    parentSetPath: "data/oracle-action-eval-development-v15.json",
    frozenAt: reviewedAt,
    reviewer: CORRECTOR,
    reviewTimestamp: reviewedAt,
    eval0262ReminderGoldCorrection: correction,
    goldLabelingPolicy: {
      reminderText: "Mechanic/keyword reminder parentheses must not produce Layer 2 primitives",
      adventureCastReminder: "Excluded — derived from Adventure rules layer, not card-specific oracle action",
    },
    cases: v16Cases,
  };

  writeFileSync(resolve(process.cwd(), "data/oracle-action-eval-development-v16.json"), JSON.stringify(v16, null, 2), "utf8");
  writeFileSync(
    resolve(process.cwd(), "data/oracle-action-eval-development-v16-diff.json"),
    JSON.stringify(
      {
        generatedAt: reviewedAt,
        parentDataset: "development_set_v15",
        parentContentHash: v15.contentHash,
        newDataset: "development_set_v16",
        newContentHash: v16Hash,
        changedCaseIds: [CASE_ID],
        correction,
      },
      null,
      2,
    ),
    "utf8",
  );

  const manifest = JSON.parse(
    readFileSync(resolve(process.cwd(), "data/oracle-action-eval-sets-manifest.json"), "utf8"),
  ) as Record<string, unknown>;
  manifest.developmentSet = {
    path: "data/oracle-action-eval-development-v16.json",
    classification: "development_set_v16",
    contentHash: v16Hash,
    caseCount: v16Cases.length,
    taxonomyVersion: TAXONOMY_VERSION,
    purpose: "Canonical development set — eval-0262 reminder-text gold corrected",
    parentClassification: "development_set_v15",
    parentContentHash: v15.contentHash,
    benchmarkStatus: "catalog_clean",
    usableForParserEvaluation: true,
  };
  writeFileSync(
    resolve(process.cwd(), "data/oracle-action-eval-sets-manifest.json"),
    JSON.stringify(manifest, null, 2),
    "utf8",
  );

  console.log(JSON.stringify({ v16Hash, correction }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
