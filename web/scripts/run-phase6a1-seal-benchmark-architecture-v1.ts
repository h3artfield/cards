#!/usr/bin/env npx tsx
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const OUT = resolve("data/milestones/deck-synthesis");
const sha = (f: string) => createHash("sha256").update(readFileSync(resolve(OUT, f))).digest("hex");

const files = {
  architectureSidecar: "phase6a1-professor-plan-functional-role-closure-architecture-clarification-v1.json",
  pipelineFreezeSpec: "phase6a1-professor-plan-prospective-pipeline-freeze-spec-v1.json",
  benchmarkDisposition: "phase6a1-professor-plan-v2-benchmark-disposition-v9-architecture.json",
  developmentTrack: "phase6a1-professor-plan-post-gold-development-track-v9-architecture.json",
  designV3: "phase6a1-professor-plan-functional-role-closure-design-v3.json",
  statusPrecedenceSidecar: "phase6a1-professor-plan-functional-role-closure-design-v3-status-precedence-v1.json",
  runtimeSchemaSidecar: "phase6a1-semantic-closure-runtime-input-schema-v8.json",
};

const pins = Object.fromEntries(
  Object.entries(files).map(([key, artifact]) => [key, { artifact, sha256: sha(artifact) }]),
);

const manifest = {
  version: "phase6a1-professor-plan-benchmark-architecture-sealed-manifest-v1",
  sealedAt: new Date().toISOString(),
  decision: "ARCHITECTURE_CLARIFICATION_SEALED_WAIT",
  productionClosureImplementation: "NOT_AUTHORIZED",
  architecturalPivot: "SUPERSEDES_SYNTHETIC_PROSPECTIVE_HOLDOUT_AUTHORING",
  evaluations: {
    evaluationA_closureAccuracy: "CURRENT_PROSPECTIVE_TARGET",
    evaluationB_endToEndPlanningImprovement: "DEFERRED",
  },
  nextProspectivePopulation: {
    codename: "holdout-prospective-pipeline-v1",
    status: "NOT_RUN_AWAITING_INDEPENDENT_REVIEW",
  },
  doNotCreate: "Synthetic v9 manually authored commander-profile holdout",
  pins,
  instruction: "REPORT AND WAIT before running Professor population for prospective pipeline v1",
};

const path = resolve(OUT, "phase6a1-professor-plan-benchmark-architecture-sealed-manifest-v1.json");
writeFileSync(path, JSON.stringify(manifest, null, 2));
console.log(JSON.stringify({ path, manifestSha256: sha("phase6a1-professor-plan-benchmark-architecture-sealed-manifest-v1.json"), pins }, null, 2));
