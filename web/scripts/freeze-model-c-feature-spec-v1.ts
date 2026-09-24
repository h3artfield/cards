#!/usr/bin/env npx tsx
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  MODEL_C_FEATURE_SPEC,
  MODEL_C_FEATURE_SPEC_VERSION,
  modelCFeatureSpecArtifactPath,
} from "../src/lib/commander-strategy/model-c/model-c-feature-spec-v1";
import { trainingSnapshotDir } from "../src/lib/commander-strategy/training-snapshot-v1";

const path = modelCFeatureSpecArtifactPath();
mkdirSync(resolve(path, ".."), { recursive: true });
writeFileSync(path, JSON.stringify(MODEL_C_FEATURE_SPEC, null, 2));
console.log(`${MODEL_C_FEATURE_SPEC_VERSION} frozen: ${path}`);
