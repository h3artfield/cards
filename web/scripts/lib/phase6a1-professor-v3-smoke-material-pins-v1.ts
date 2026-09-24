/**
 * Pinned material sources for one real Muldrotha Professor v3 smoke execution.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { MILESTONES, REPO, sha256File } from "./phase6a1-pinned-implementation-container-v1";
import { PROFESSOR_PLAN_MODEL_PIN_V2_PATH } from "./phase6a1-professor-plan-model-pin-v2";

export const PROFESSOR_V3_SMOKE_MATERIAL_PINS_V1_VERSION = "phase6a1-professor-v3-smoke-material-pins-v1";

const WEB = resolve(REPO, "web");

const MATERIAL_SOURCES = [
  { label: "phase6a1-professor-plan-agent-v3", path: resolve(WEB, "scripts/lib/phase6a1-professor-plan-agent-v3.ts") },
  { label: "phase6a1-professor-v3-model-caller-v1", path: resolve(WEB, "scripts/lib/phase6a1-professor-v3-model-caller-v1.ts") },
  { label: "phase6a1-professor-v3-model-attempt-artifacts-v1", path: resolve(WEB, "scripts/lib/phase6a1-professor-v3-model-attempt-artifacts-v1.ts") },
  { label: "phase6a1-professor-v3-smoke-output-targets-v1", path: resolve(WEB, "scripts/lib/phase6a1-professor-v3-smoke-output-targets-v1.ts") },
  { label: "phase6a1-professor-v3-semantic-relationship-source-v1", path: resolve(WEB, "scripts/lib/phase6a1-professor-v3-semantic-relationship-source-v1.ts") },
  { label: "phase6a1-professor-plan-context-builder-v3", path: resolve(WEB, "scripts/lib/phase6a1-professor-plan-context-builder-v3.ts") },
  { label: "phase6a1-professor-plan-normalizer-v3", path: resolve(WEB, "scripts/lib/phase6a1-professor-plan-normalizer-v3.ts") },
  { label: "phase6a1-professor-plan-prompt-v3", path: resolve(WEB, "scripts/lib/phase6a1-professor-plan-prompt-v3.ts") },
  { label: "phase6a1-professor-v3-prompt-payload-v1", path: resolve(WEB, "scripts/lib/phase6a1-professor-v3-prompt-payload-v1.ts") },
  { label: "professor-v3-execution-trace-v1", path: resolve(WEB, "src/lib/deck-synthesis/professor-v3-execution-trace-v1.ts") },
  { label: "professor-v3-run-ledger-v1", path: resolve(WEB, "src/lib/deck-synthesis/professor-v3-run-ledger-v1.ts") },
  { label: "strategy-package-validator-v3", path: resolve(WEB, "src/lib/deck-synthesis/strategy-package-validator-v3.ts") },
  { label: "typed-assertion-grounding-v3", path: resolve(WEB, "src/lib/deck-synthesis/typed-assertion-grounding-v3.ts") },
  { label: "phase6a1-professor-plan-model-pin-v2", path: PROFESSOR_PLAN_MODEL_PIN_V2_PATH },
  { label: "phase6a1-spent-pilot-commander-mechanism-truth-supplement-v1", path: resolve(MILESTONES, "phase6a1-spent-pilot-commander-mechanism-truth-supplement-v1.json") },
  { label: "phase6a1-spent-pilot-semantic-opportunity-supplement-v2", path: resolve(MILESTONES, "phase6a1-spent-pilot-semantic-opportunity-supplement-v2.json") },
  { label: "run-phase6a1-execute-smoke-professor-v3-muldrotha-v1", path: resolve(WEB, "scripts/run-phase6a1-execute-smoke-professor-v3-muldrotha-v1.ts") },
] as const;

export function buildProfessorV3SmokeMaterialPinReport() {
  const files = MATERIAL_SOURCES.map((entry) => {
    if (!existsSync(entry.path)) throw new Error(`Missing pinned smoke material: ${entry.path}`);
    return {
      label: entry.label,
      path: entry.path.replace(/\\/g, "/"),
      sha256: sha256File(entry.path),
      byteSize: readFileSync(entry.path).length,
    };
  });
  return {
    version: PROFESSOR_V3_SMOKE_MATERIAL_PINS_V1_VERSION,
    generatedAt: new Date().toISOString(),
    fileCount: files.length,
    files,
  };
}
