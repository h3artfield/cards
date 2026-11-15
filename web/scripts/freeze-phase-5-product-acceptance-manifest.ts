#!/usr/bin/env npx tsx
/**
 * Phase 5 — PRODUCT_ACCEPTED freeze manifest.
 */
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { ARCHETYPE_DISCOVERY_V1_VERSION } from "../src/lib/deck-synthesis/archetype-discovery-types-v1";
import { blindHoldoutV5SetHash } from "../src/lib/deck-synthesis/archetype-discovery-blind-holdout-v5";

const OUT_PATH = "data/milestones/deck-synthesis/phase-5-product-acceptance-freeze-manifest.json";

function sha256File(relPath: string): string {
  return createHash("sha256").update(readFileSync(resolve(relPath))).digest("hex");
}

function main() {
  const v160 = JSON.parse(
    readFileSync(resolve("data/milestones/deck-synthesis/archetype-discovery-v1.6.0-freeze-manifest.json"), "utf8"),
  );
  const blindV5Adjudication = JSON.parse(
    readFileSync(resolve("data/milestones/deck-synthesis/blind-v5-root-cause-adjudication-v1.json"), "utf8"),
  );
  const blindV5Review = JSON.parse(
    readFileSync(resolve("data/milestones/deck-synthesis/archetype-discovery-blind-v5-human-mechanical-review.json"), "utf8"),
  );
  const repoRoot = execSync("git rev-parse --show-toplevel", { encoding: "utf8" }).trim();
  const gitCommitSha = execSync("git rev-parse HEAD", { cwd: repoRoot, encoding: "utf8" }).trim();

  const manifest = {
    version: "phase-5-product-acceptance-freeze-manifest",
    status: "PRODUCT_ACCEPTED",
    phaseStatus: "PHASE_5_STATUS = PRODUCT_ACCEPTED",
    frozenAt: new Date().toISOString(),
    gitCommitSha,
    discoveryEngineVersion: ARCHETYPE_DISCOVERY_V1_VERSION,
    supersedes: "data/milestones/deck-synthesis/archetype-discovery-v1.6.0-freeze-manifest.json",
    phase5Completion: {
      devRegression: "phase56-dev-regression-v1.1.json — PASS",
      blindV5: {
        status: "EVALUATED_PASS / SPENT",
        sealHash: blindHoldoutV5SetHash(),
        rootCauseAdjudication: "blind-v5-root-cause-adjudication-v1.json",
        phase5ProductVerdict: blindV5Adjudication.phase5ProductVerdict,
        knownIsolatedGeneralizationAbstentions: blindV5Adjudication.knownIsolatedGeneralizationAbstentions,
        recurringSystematicFamilies: blindV5Adjudication.recurringSystematicFamilies,
      },
      furtherPhase5Work: "STOP — no Phase 5.7, blind-v6, or additional commander-direction tuning",
    },
    frozenDependencies: {
      archetypeDiscovery: v160.discoveryEngineVersion,
      causalInference: v160.causalInferenceVersion,
      commandZoneComposition: v160.commandZoneCompositionVersion,
      benchmarkEligibility: v160.benchmarkEligibilityDependency,
      semanticOnlyContract: "candidate-retrieval-mode-v1 SEMANTIC_ONLY",
      rc8: "FROZEN",
      professorImplementation: "WAIT",
    },
    phase6Authorization: {
      phase6A: "AUTHORIZED — semantic candidate retrieval",
      optimizer: "WAIT",
      packageSearch: "WAIT",
      professorImplementation: "WAIT",
    },
    artifactHashes: {
      archetypeDiscoveryV160Freeze: v160.artifactHashes?.freezeManifest ?? sha256File("data/milestones/deck-synthesis/archetype-discovery-v1.6.0-freeze-manifest.json"),
      blindV5HumanReview: createHash("sha256").update(JSON.stringify(blindV5Review)).digest("hex"),
      blindV5RootCauseAdjudication: blindV5Adjudication.artifactHash,
      blindV5SealHash: blindHoldoutV5SetHash(),
    },
  };

  manifest.artifactHashes.freezeManifest = createHash("sha256").update(JSON.stringify(manifest)).digest("hex");

  const outPath = resolve(process.cwd(), OUT_PATH);
  mkdirSync(resolve(outPath, ".."), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(JSON.stringify({ outPath, phaseStatus: manifest.phaseStatus }, null, 2));
}

main();
