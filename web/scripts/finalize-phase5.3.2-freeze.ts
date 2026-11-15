#!/usr/bin/env npx tsx
/**
 * Finalize Phase 5.3.2 freeze manifest after human mechanical review acceptance.
 */
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  ARCHETYPE_DISCOVERY_BLIND_V1_STATUS,
  blindHoldoutSetHash,
} from "../src/lib/deck-synthesis/archetype-discovery-blind-holdout-v1";
import { ARCHETYPE_DISCOVERY_V1_VERSION } from "../src/lib/deck-synthesis/archetype-discovery-types-v1";
import { COMMANDER_CAUSAL_INFERENCE_VERSION } from "../src/lib/deck-synthesis/commander-causal-inference-v1.1";
import {
  CANDIDATE_RETRIEVAL_MODE_V1,
  DECK_BUILD_ROUTE_OVERLAY_V1,
} from "../src/lib/deck-synthesis/commander-deck-synthesis-v1-spec";
import { DECK_BUILD_ROUTE_OVERLAY_V1_VERSION } from "../src/lib/deck-synthesis/deck-build-route-overlay-v1";
import { GOLDEN_CATALOG_VERSION } from "../src/lib/deck-builder/golden-catalog/version";
import {
  RC8_PARSER_BLOB_CLOSURE,
  RC8_PARSER_VERSION,
  SEMANTIC_INDEX_VERSION,
  loadSemanticUniverseManifest,
} from "../src/lib/commander-strategy/semantic-universe-v1";
import {
  CARD_INTERACTION_PROFILE_V2_1_VERSION,
  DECK_INTERACTION_PROFILE_V2_1_VERSION,
  INTERACTION_PROFILE_V2_1_SPEC_VERSION,
} from "../src/lib/commander-strategy/interaction-profile-v2.1/types";
import { RC8_SOURCE_REGISTRY_VERSION } from "../src/lib/commander-strategy/interaction-profile-v2/types";

function hashFile(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function hashJson(path: string): string {
  const raw = readFileSync(path, "utf8");
  return createHash("sha256").update(raw).digest("hex");
}

async function main() {
  const root = resolve(process.cwd());
  const outDir = resolve(root, "data/milestones/deck-synthesis");
  const src = resolve(root, "src/lib/deck-synthesis");

  let gitSha = "unknown";
  try {
    gitSha = execSync("git rev-parse HEAD", { cwd: resolve(root, ".."), encoding: "utf8" }).trim();
  } catch {
    /* optional */
  }

  const semanticManifest = loadSemanticUniverseManifest();
  const qaPath = resolve(outDir, "archetype-discovery-v1.3.2-phase5.3.2-qa.json");
  const humanReviewPath = resolve(outDir, "archetype-discovery-v1.3.2-human-mechanical-review.json");
  const reviewPackagePath = resolve(outDir, "archetype-discovery-v1.3.2-mechanical-review-package.json");

  const sourceHashes: Record<string, string> = {
    "commander-build-direction-v1.ts": hashFile(resolve(src, "commander-build-direction-v1.ts")),
    "mechanical-motifs-v1.ts": hashFile(resolve(src, "mechanical-motifs-v1.ts")),
    "commander-causal-inference-v1.1.ts": hashFile(resolve(src, "commander-causal-inference-v1.1.ts")),
    "commander-causal-roles-v1.ts": hashFile(resolve(src, "commander-causal-roles-v1.ts")),
    "discover-archetypes-v1.ts": hashFile(resolve(src, "discover-archetypes-v1.ts")),
    "benchmark-commander-resolver-v1.ts": hashFile(resolve(src, "benchmark-commander-resolver-v1.ts")),
    "pattern-prerequisites-v1.ts": hashFile(resolve(src, "pattern-prerequisites-v1.ts")),
    "human-label-mapping-v1.ts": hashFile(resolve(src, "human-label-mapping-v1.ts")),
    "mechanical-engine-patterns-v1.ts": hashFile(resolve(src, "mechanical-engine-patterns-v1.ts")),
    "catalog-feasibility-v1.ts": hashFile(resolve(src, "catalog-feasibility-v1.ts")),
    "archetype-discovery-types-v1.ts": hashFile(resolve(src, "archetype-discovery-types-v1.ts")),
    "deck-build-route-overlay-v1.ts": hashFile(resolve(src, "deck-build-route-overlay-v1.ts")),
    "commander-deck-synthesis-v1-spec.ts": hashFile(resolve(src, "commander-deck-synthesis-v1-spec.ts")),
  };

  const manifest = {
    version: "archetype-discovery-v1.3.2-freeze-manifest",
    status: "ACCEPTED_FROZEN",
    frozenAt: new Date().toISOString(),
    acceptedBy: "human-mechanical-review-v1.3.2",
    gitCommitSha: gitSha,
    discoveryEngineVersion: ARCHETYPE_DISCOVERY_V1_VERSION,
    causalInferenceVersion: COMMANDER_CAUSAL_INFERENCE_VERSION,
    commanderBuildDirectionSchemaVersion: "CommanderBuildDirection-v1.3.2",
    motifVocabularyVersion: "mechanical-motifs-v1.3.2",
    blindHoldoutV1Hash: blindHoldoutSetHash(),
    blindHoldoutV1Status: ARCHETYPE_DISCOVERY_BLIND_V1_STATUS,
    humanReviewGate: {
      mechanicalDirectionPrecision: 0.9852941176470589,
      primaryMechanicalDirectionAccuracy: 1,
      missingCentralRate: 0,
      causalChainCorrectness: 1,
      retrievalUsableRate: 1,
      zeroUsableRate: 0,
      mechanismTypeCorrectness: 1,
      pass: true,
      caseCount: 68,
      acceptedCount: 67,
    },
    structuralAcceptanceProxy: {
      value: 0.8970588235294118,
      note: "Automated regression proxy — NOT semantic acceptance gate",
    },
    knownIsolatedDevFailures: [
      {
        caseId: "blind-nivmizzet",
        commander: "Niv-Mizzet, Parun",
        classification: "KNOWN_ISOLATED_DEV_FAILURE",
        rootCauseClass: "NO_DRIVER_EVIDENCE",
        detail: "instant/sorcery cast → draw/damage driver chain not extracted",
        repairDeferredUntil: "blind-v2 generalization evidence",
        doNotFixBeforeBlindV2: true,
      },
    ],
    frozenComponents: [
      "archetype-discovery-v1.3.2",
      "commander-causal-inference-v1.2",
      "CommanderBuildDirection schema (causalChainStatus, driverProvenance, coverage fields)",
      "mechanical-motifs-v1 (ACTIVATED/TRIGGERED/STATIC mana split + compositional motifs)",
      "commander-build-direction-v1 (driver propagation, centrality, chain composition)",
      "commander-causal-roles-v1 (costRequires/costConsumes/activatedEngineCosts)",
      "pattern-prerequisites-v1",
      "catalog-feasibility-v1",
      "benchmark-commander-resolver-v1",
      "human-label-mapping-v1",
      "mechanical-engine-patterns-v1 (thresholds unchanged)",
      "discover-archetypes-v1",
      "deck-build-route-overlay-v1 contract",
      "candidate-retrieval-mode-v1 SEMANTIC_ONLY contract",
    ],
    dependencyVersions: {
      rc8ParserVersion: RC8_PARSER_VERSION,
      rc8ParserBlobClosure: semanticManifest.parserBlobClosure ?? RC8_PARSER_BLOB_CLOSURE,
      rc8SourceRegistryVersion: RC8_SOURCE_REGISTRY_VERSION,
      semanticIndexVersion: semanticManifest.semanticIndexVersion ?? SEMANTIC_INDEX_VERSION,
      goldenCatalogVersion: GOLDEN_CATALOG_VERSION,
      ipv2_1CardProfileVersion: CARD_INTERACTION_PROFILE_V2_1_VERSION,
      ipv2_1DeckProfileVersion: DECK_INTERACTION_PROFILE_V2_1_VERSION,
      ipv2_1SpecVersion: INTERACTION_PROFILE_V2_1_SPEC_VERSION,
      deckBuildRouteOverlayVersion: DECK_BUILD_ROUTE_OVERLAY_V1_VERSION,
      candidateRetrievalModeVersion: CANDIDATE_RETRIEVAL_MODE_V1.version,
      semanticOnlyRetrievalStatus: CANDIDATE_RETRIEVAL_MODE_V1.status,
    },
    contracts: {
      deckBuildRouteOverlay: DECK_BUILD_ROUTE_OVERLAY_V1,
      semanticOnlyRetrieval: CANDIDATE_RETRIEVAL_MODE_V1.modes.SEMANTIC_ONLY,
    },
    sourceHashes,
    artifactHashes: {
      qaReport: hashJson(qaPath),
      humanMechanicalReview: hashJson(humanReviewPath),
      humanReviewPackage: hashJson(reviewPackagePath),
    },
    policy: {
      rc8: "FROZEN",
      phase6: "WAIT",
      optimizer: "WAIT",
      semanticOnlyRetrieval: "FROZEN",
      changeControl:
        "Any change to frozen components requires a new discovery version (e.g. v1.3.3 or v1.4.0).",
      blindV2: "SEALED — see archetype-discovery-blind-v2-seal-manifest.json",
    },
    blindV2SealReference: {
      sealManifest: "archetype-discovery-blind-v2-seal-manifest.json",
      selectionArtifact: "archetype-discovery-blind-v2-selection-artifact.json",
      strategyCaseCount: 50,
      note: "Blind-v2 created after freeze; evaluation run is separate from frozen discovery code.",
    },
  };

  const outPath = resolve(outDir, "archetype-discovery-v1.3.2-freeze-manifest.json");
  writeFileSync(outPath, JSON.stringify(manifest, null, 2));
  console.log(JSON.stringify({ status: manifest.status, outPath, manifestHash: hashJson(outPath) }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
