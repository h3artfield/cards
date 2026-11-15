/**
 * Initialize catalog coverage gold workspace: calibration batch, blind packs, protocol draft.
 *
 * Run: cd web && npx tsx scripts/init-catalog-coverage-gold-workspace-v1.ts
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { execSync } from "node:child_process";
import { loadEnvLocal } from "./lib/script-env";
import { loadGoldenCatalogIndex, combinedGoldenOracleText } from "./lib/load-golden-catalog-index";
import {
  CATALOG_COVERAGE_SEMANTIC_GOLD_SCHEMA_VERSION,
  CATALOG_COVERAGE_WHOLE_CARD_RUBRIC_VERSION,
} from "./lib/catalog-coverage-semantic-gold-schema-v1";
import { computeGoldPolicyStackV18Hashes } from "./lib/gold-policy-stack-v1.8";

loadEnvLocal();

const OUT_DIR = "data/milestones/catalog-shadow";
const ANNOTATION_PROTOCOL_VERSION = "catalog-coverage-annotation-protocol-v1";

async function main() {
  // Step 1: calibration batch (if missing)
  const calPath = resolve(OUT_DIR, "catalog-coverage-calibration-batch-v1.json");
  if (!existsSync(calPath)) {
    execSync("npx tsx scripts/build-catalog-coverage-calibration-batch-v1.ts", {
      cwd: process.cwd(),
      stdio: "inherit",
    });
  }

  const sample = JSON.parse(
    readFileSync(resolve(OUT_DIR, "catalog-coverage-sample-v2.json"), "utf8"),
  );
  const calibration = JSON.parse(readFileSync(calPath, "utf8"));
  const index = await loadGoldenCatalogIndex();
  const policyStack = computeGoldPolicyStackV18Hashes();

  const calibrationOracleIds = new Set(
    calibration.cards.map((c: { oracleId: string }) => c.oracleId),
  );

  const fullCards = sample.cards.map(
    (card: {
      oracleId: string;
      canonicalName: string;
      oracleTextHash: string;
      cardStructureHash: string;
      layout?: string;
      populationCategory: string;
      complexityBucket: string;
    }) => {
      const catalog = index.byOracleId.get(card.oracleId);
      if (!catalog) throw new Error(`Missing catalog: ${card.oracleId}`);
      const oracleText = combinedGoldenOracleText(catalog);
      return {
        ...card,
        typeLine: catalog.typeLine,
        oracleText,
        cardFaces: catalog.cardFaces,
        isCalibrationCard: calibrationOracleIds.has(card.oracleId),
        doubleAdjudicationRequired:
          card.complexityBucket === "pathological" ||
          card.complexityBucket === "complex" ||
          (catalog.cardFaces?.length ?? 0) > 1 ||
          /\b(?:have|gains?) "/i.test(oracleText) ||
          /\bIf you would\b|\binstead\b/i.test(oracleText) ||
          /\bChoose (?:one|two|any number)\b/i.test(oracleText),
      };
    },
  );

  const doubleAdjudicationTarget = Math.max(250, fullCards.filter((c) => c.doubleAdjudicationRequired).length);

  const workspace = {
    artifactType: "CatalogCoverageGoldWorkspace",
    version: "catalog-coverage-gold-workspace-v1",
    status: "CALIBRATION_IN_PROGRESS",
    initializedAt: new Date().toISOString(),
    studyPopulation: {
      eligibleCount: 35932,
      populationHash: "986c26116efaea45a20bb0cffe388fc20340db47839300ce69127942681dcbc5",
      cardStructurePopulationHash: sample.cardStructurePopulationHash,
    },
    sampleV2: {
      sampleIdentityHash: sample.sampleIdentityHash,
      sampleCount: sample.sampleCount,
      supersededSampleV1Hash: sample.supersededSampleV1?.sampleIdentityHash,
    },
    versions: {
      annotationProtocolVersion: ANNOTATION_PROTOCOL_VERSION,
      wholeCardRubricVersion: CATALOG_COVERAGE_WHOLE_CARD_RUBRIC_VERSION,
      semanticGoldSchemaVersion: CATALOG_COVERAGE_SEMANTIC_GOLD_SCHEMA_VERSION,
      goldPolicyVersion: "semantic-gold-policy-v1.8",
      goldPolicyStackHash: policyStack.stackCompositeHash,
      parserVersion: "oracle-action-v1.44-rc8-ownership-grant-family",
    },
    workflow: {
      phase: "P1_protocol_calibration",
      calibrationBatchIdentityHash: calibration.batchIdentityHash,
      calibrationBatchSize: calibration.batchSize,
      calibrationComplete: false,
      fullGoldComplete: false,
      goldPolicyCertified: false,
      rc8ScoringAuthorized: false,
    },
    humanGoldQaTargets: {
      primaryAdjudication: "1000/1000",
      doubleAdjudicationOverall: "≥250/1000",
      doubleAdjudicationPathological: "50/50",
      doubleAdjudicationEnrichment: [
        "complex",
        "multi_face",
        "granted",
        "replacement",
        "modal",
      ],
      disagreementResolution: "required — do not average",
    },
    blankTextTreatment: {
      categoryCInSample: fullCards.filter((c) => c.populationCategory === "C").length,
      rule: "legitimateCard=true, oracleRulesTextEmpty=true, expectedCardNativeL2Actions=[]; zero actions may be EXACT",
    },
    parserBlindness: {
      mandatory: true,
      forbiddenInputs: calibration.cards[0]?.forbiddenInputs ?? [
        "RC8 semantic AST",
        "accepted actions",
        "needs_review",
        "diagnostics",
        "structural-invalid status",
        "shadow outputs",
        "prior benchmark history",
      ],
    },
    cards: fullCards,
    doubleAdjudicationPlan: {
      targetCount: doubleAdjudicationTarget,
      flaggedCount: fullCards.filter((c) => c.doubleAdjudicationRequired).length,
    },
  };

  mkdirSync(resolve(OUT_DIR), { recursive: true });

  writeFileSync(
    resolve(OUT_DIR, "catalog-coverage-annotation-protocol-v1.json"),
    `${JSON.stringify(
      {
        artifactType: "CatalogCoverageAnnotationProtocol",
        version: ANNOTATION_PROTOCOL_VERSION,
        status: "DRAFT_PENDING_CALIBRATION",
        calibratedAt: null,
        frozenAt: null,
        purpose:
          "Ensure two human adjudicators interpret semantic gold schema identically before bulk annotation.",
        sampleIdentityHash: sample.sampleIdentityHash,
        populationHash: sample.populationHash,
        calibrationBatchIdentityHash: calibration.batchIdentityHash,
        semanticGoldSchemaVersion: CATALOG_COVERAGE_SEMANTIC_GOLD_SCHEMA_VERSION,
        wholeCardRubricVersion: CATALOG_COVERAGE_WHOLE_CARD_RUBRIC_VERSION,
        goldPolicyVersion: "semantic-gold-policy-v1.8",
        blankTextTreatment: workspace.blankTextTreatment,
        requiredSemanticDimensions: [
          "ability boundaries",
          "ability type",
          "Layer-2 primitive",
          "evidence span",
          "optionality",
          "condition/dependency",
          "semanticOwner",
          "executionContext",
          "source_card",
          "granted_object",
          "created_object",
          "face ownership",
          "modal option",
          "zone transition",
        ],
        parserBlindness: workspace.parserBlindness,
        officialRulingsPolicy: "Allowed when genuinely needed; record officialRulingsConsulted and rulingReferences.",
        disagreementTypes: [
          "primitive",
          "ownership",
          "ability_boundary",
          "whole_card_class",
          "blank_text_treatment",
          "other",
        ],
        calibrationResolutionRequired: true,
        bulkAnnotationBlockedUntilCalibrationFrozen: true,
      },
      null,
      2,
    )}\n`,
  );

  writeFileSync(
    resolve(OUT_DIR, "catalog-coverage-gold-workspace-v1.json"),
    `${JSON.stringify(workspace, null, 2)}\n`,
  );

  // Calibration blind pack
  execSync("npx tsx scripts/build-catalog-coverage-gold-blind-pack-v1.ts --batch=calibration", {
    cwd: process.cwd(),
    stdio: "inherit",
  });

  // Full blind pack (parser-blind card structure only)
  const fullBlindPack = {
    artifactType: "CatalogCoverageGoldBlindPack",
    version: "catalog-coverage-gold-blind-pack-v1",
    packKind: "full_sample_v2",
    sampleIdentityHash: sample.sampleIdentityHash,
    populationHash: sample.populationHash,
    semanticGoldSchemaVersion: CATALOG_COVERAGE_SEMANTIC_GOLD_SCHEMA_VERSION,
    wholeCardRubricVersion: CATALOG_COVERAGE_WHOLE_CARD_RUBRIC_VERSION,
    generatedAt: new Date().toISOString(),
    cardCount: fullCards.length,
    calibrationBatchOracleIds: [...calibrationOracleIds].sort(),
    note: "Complete parser-blind annotation pack. RC8 outputs forbidden until gold seal.",
    cards: fullCards.map((c) => ({
      oracleId: c.oracleId,
      canonicalName: c.canonicalName,
      cardStructureHash: c.cardStructureHash,
      oracleTextHash: c.oracleTextHash,
      layout: c.layout,
      typeLine: c.typeLine,
      populationCategory: c.populationCategory,
      complexityBucket: c.complexityBucket,
      isCalibrationCard: c.isCalibrationCard,
      doubleAdjudicationRequired: c.doubleAdjudicationRequired,
      canonicalStructure: {
        combinedOracleText: c.oracleText,
        cardFaces: c.cardFaces,
      },
      blankTextGuidance:
        c.populationCategory === "C"
          ? {
              legitimateCard: true,
              oracleRulesTextEmpty: true,
              expectedCardNativeL2Actions: [],
            }
          : undefined,
      adjudication: {
        primary: { status: "pending" },
        secondary: { status: "pending", required: c.doubleAdjudicationRequired },
      },
    })),
  };

  writeFileSync(
    resolve(OUT_DIR, "catalog-coverage-gold-blind-pack-full-v1.json"),
    `${JSON.stringify(fullBlindPack, null, 2)}\n`,
  );

  // Empty adjudication ledger
  writeFileSync(
    resolve(OUT_DIR, "catalog-coverage-gold-adjudication-ledger-v1.json"),
    `${JSON.stringify(
      {
        artifactType: "CatalogCoverageGoldAdjudicationLedger",
        version: "catalog-coverage-gold-adjudication-ledger-v1",
        status: "OPEN",
        sampleIdentityHash: sample.sampleIdentityHash,
        populationHash: sample.populationHash,
        primaryAdjudicatedCount: 0,
        secondaryAdjudicatedCount: 0,
        disagreementCount: 0,
        resolvedDisagreementCount: 0,
        records: [],
        disagreements: [],
      },
      null,
      2,
    )}\n`,
  );

  const workspaceHash = createHash("sha256")
    .update(JSON.stringify({ sampleIdentityHash: sample.sampleIdentityHash, cardCount: fullCards.length }))
    .digest("hex");

  console.log(
    JSON.stringify(
      {
        workspacePath: `${OUT_DIR}/catalog-coverage-gold-workspace-v1.json`,
        protocolPath: `${OUT_DIR}/catalog-coverage-annotation-protocol-v1.json`,
        calibrationBatchSize: calibration.batchSize,
        fullBlindPackPath: `${OUT_DIR}/catalog-coverage-gold-blind-pack-full-v1.json`,
        calibrationBlindPackPath: `${OUT_DIR}/catalog-coverage-gold-blind-pack-calibration-v1.json`,
        ledgerPath: `${OUT_DIR}/catalog-coverage-gold-adjudication-ledger-v1.json`,
        categoryCInSample: fullCards.filter((c) => c.populationCategory === "C").length,
        doubleAdjudicationTarget: doubleAdjudicationTarget,
        workspaceHash,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
