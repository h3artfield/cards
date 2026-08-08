/**
 * Split synthetic structural fixtures from catalog-backed positive training (v133).
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

type Case = Record<string, unknown> & { id: string; oracleId?: string; identityStatus?: string };

function isSynthetic(c: Case): boolean {
  if (c.identityStatus === "synthetic_fixture") return true;
  if (String(c.oracleId ?? "").startsWith("synthetic-")) return true;
  if (String(c.id).includes("synthetic")) return true;
  return false;
}

function main() {
  const srcPath = resolve("data/oracle-action-eval-rc3-positive-training-v132.json");
  const src = JSON.parse(readFileSync(srcPath, "utf8")) as { cases: Case[]; evaluationSetVersion: string };
  const synthetic = src.cases.filter(isSynthetic);
  const catalog = src.cases.filter((c) => !isSynthetic(c));

  const demilichOverlap = {
    oracleId: "e1b6d0ab-4e11-43a2-8a7f-3fb51582ddf3",
    classification: "intentional_same_oracle_disjoint_scope_policy_fixture",
    guardrailCaseId: "rc3-guard-0001",
    guardrailScope: "clause: demilich-graveyard-cast-permission",
    positiveCaseId: "rc3-pos-one-shot-cast-0001",
    positiveScope: "ability: attack copy → optional cast branch",
    v13Overlap: false,
    note: "Same Oracle ID across development packs with disjoint caseScope — not a v13 overlap violation.",
  };

  const catalogEnvelope = {
    setClassification: "rc3_positive_training_catalog_v133",
    evaluationSetVersion: "rc3-positive-training-catalog-v133",
    parentPackVersion: "rc3-positive-training-v132",
    taxonomyVersion: "three-layer-v1.4",
    parserConsulted: false,
    cases: catalog,
    contentHash: "",
  };
  catalogEnvelope.contentHash = createHash("sha256").update(JSON.stringify(catalogEnvelope.cases)).digest("hex");

  const syntheticEnvelope = {
    setClassification: "rc3_synthetic_structural_fixtures_v133",
    evaluationSetVersion: "rc3-synthetic-structural-fixtures-v133",
    taxonomyVersion: "three-layer-v1.4",
    parserConsulted: false,
    excludedFromCatalogGeneralizationMetrics: true,
    cases: synthetic.map((c) => ({ ...c, identityStatus: "synthetic_fixture", benchmarkTier: "synthetic_regression_only" })),
    contentHash: "",
  };
  syntheticEnvelope.contentHash = createHash("sha256").update(JSON.stringify(syntheticEnvelope.cases)).digest("hex");

  writeFileSync(resolve("data/oracle-action-eval-rc3-positive-training-catalog-v133.json"), `${JSON.stringify(catalogEnvelope, null, 2)}\n`);
  writeFileSync(resolve("data/oracle-action-eval-rc3-synthetic-structural-fixtures-v133.json"), `${JSON.stringify(syntheticEnvelope, null, 2)}\n`);

  const outDir = resolve("data/milestones/rc3-benchmark-selection");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(
    resolve(outDir, "disjoint-scope-oracle-overlap-v133.json"),
    `${JSON.stringify({ generatedAt: new Date().toISOString(), fixtures: [demilichOverlap] }, null, 2)}\n`,
  );

  console.log(
    JSON.stringify(
      {
        catalogCases: catalog.length,
        syntheticCases: synthetic.length,
        unrelatedCatalogCount: catalog.filter((c) => !c.spentV12Regression).length,
        demilichOverlap,
      },
      null,
      2,
    ),
  );
}

main();
