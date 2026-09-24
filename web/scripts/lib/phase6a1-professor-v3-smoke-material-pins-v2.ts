/**
 * Reviewed execution pins for Professor v3 Muldrotha smoke — fail closed on drift.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { MILESTONES, REPO, sha256File } from "./phase6a1-pinned-implementation-container-v1";
import { PROFESSOR_PLAN_MODEL_PIN_V2_PATH } from "./phase6a1-professor-plan-model-pin-v2";

export const PROFESSOR_V3_SMOKE_MATERIAL_PINS_V2_VERSION = "phase6a1-professor-v3-smoke-material-pins-v2";
export const PROFESSOR_V3_SMOKE_EXECUTION_PINS_V2_PATH = resolve(
  MILESTONES,
  "phase6a1-professor-v3-smoke-execution-pins-v2.json",
);

const WEB = resolve(REPO, "web");

export type ProfessorV3SmokeMaterialSourceV2 = {
  label: string;
  path: string;
};

export const PROFESSOR_V3_SMOKE_MATERIAL_SOURCES_V2: ProfessorV3SmokeMaterialSourceV2[] = [
  { label: "run-phase6a1-execute-smoke-professor-v3-muldrotha-v1", path: resolve(WEB, "scripts/run-phase6a1-execute-smoke-professor-v3-muldrotha-v1.ts") },
  { label: "phase6a1-professor-plan-agent-v3", path: resolve(WEB, "scripts/lib/phase6a1-professor-plan-agent-v3.ts") },
  { label: "phase6a1-professor-v3-model-caller-v2", path: resolve(WEB, "scripts/lib/phase6a1-professor-v3-model-caller-v2.ts") },
  { label: "phase6a1-professor-v3-model-attempt-artifacts-v2", path: resolve(WEB, "scripts/lib/phase6a1-professor-v3-model-attempt-artifacts-v2.ts") },
  { label: "phase6a1-professor-v3-smoke-output-targets-v2", path: resolve(WEB, "scripts/lib/phase6a1-professor-v3-smoke-output-targets-v2.ts") },
  { label: "phase6a1-professor-v3-smoke-failure-seal-v2", path: resolve(WEB, "scripts/lib/phase6a1-professor-v3-smoke-failure-seal-v2.ts") },
  { label: "phase6a1-professor-v3-smoke-material-pins-v2", path: resolve(WEB, "scripts/lib/phase6a1-professor-v3-smoke-material-pins-v2.ts") },
  { label: "phase6a1-professor-plan-context-builder-v3", path: resolve(WEB, "scripts/lib/phase6a1-professor-plan-context-builder-v3.ts") },
  { label: "phase6a1-professor-plan-context-preflight-v3", path: resolve(WEB, "scripts/lib/phase6a1-professor-plan-context-preflight-v3.ts") },
  { label: "phase6a1-professor-plan-normalizer-v3", path: resolve(WEB, "scripts/lib/phase6a1-professor-plan-normalizer-v3.ts") },
  { label: "phase6a1-professor-plan-prompt-v3", path: resolve(WEB, "scripts/lib/phase6a1-professor-plan-prompt-v3.ts") },
  { label: "phase6a1-professor-v3-prompt-payload-v1", path: resolve(WEB, "scripts/lib/phase6a1-professor-v3-prompt-payload-v1.ts") },
  { label: "phase6a1-spent-pilot-truth-loader-v1", path: resolve(WEB, "scripts/lib/phase6a1-spent-pilot-truth-loader-v1.ts") },
  { label: "phase6a1-professor-plan-model-pin-v2-loader", path: resolve(WEB, "scripts/lib/phase6a1-professor-plan-model-pin-v2.ts") },
  { label: "phase6a1-pinned-implementation-container-v1", path: resolve(WEB, "scripts/lib/phase6a1-pinned-implementation-container-v1.ts") },
  { label: "write-once-milestone-artifact-v2", path: resolve(WEB, "scripts/lib/write-once-milestone-artifact-v2.ts") },
  { label: "write-once-text-artifact-v1", path: resolve(WEB, "scripts/lib/write-once-text-artifact-v1.ts") },
  { label: "professor-v3-execution-trace-v1", path: resolve(WEB, "src/lib/deck-synthesis/professor-v3-execution-trace-v1.ts") },
  { label: "professor-v3-run-ledger-v1", path: resolve(WEB, "src/lib/deck-synthesis/professor-v3-run-ledger-v1.ts") },
  { label: "professor-v3-evidence-ledger-v1", path: resolve(WEB, "src/lib/deck-synthesis/professor-v3-evidence-ledger-v1.ts") },
  { label: "strategy-package-validator-v3", path: resolve(WEB, "src/lib/deck-synthesis/strategy-package-validator-v3.ts") },
  { label: "typed-assertion-grounding-v3", path: resolve(WEB, "src/lib/deck-synthesis/typed-assertion-grounding-v3.ts") },
  { label: "professor-planning-contracts-v3", path: resolve(WEB, "src/lib/deck-synthesis/professor-planning-contracts-v3.ts") },
  { label: "professor-functional-roles-v3", path: resolve(WEB, "src/lib/deck-synthesis/professor-functional-roles-v3.ts") },
  { label: "strategic-assertion-vocabulary-v3", path: resolve(WEB, "src/lib/deck-synthesis/strategic-assertion-vocabulary-v3.ts") },
  { label: "phase6a1-professor-plan-model-pin-v2", path: PROFESSOR_PLAN_MODEL_PIN_V2_PATH },
  { label: "phase6a1-spent-pilot-commander-mechanism-truth-supplement-v1", path: resolve(MILESTONES, "phase6a1-spent-pilot-commander-mechanism-truth-supplement-v1.json") },
  { label: "phase6a1-spent-pilot-semantic-opportunity-supplement-v2", path: resolve(MILESTONES, "phase6a1-spent-pilot-semantic-opportunity-supplement-v2.json") },
];

export type ProfessorV3SmokeMaterialPinEntryV2 = {
  label: string;
  path: string;
  sha256: string;
  byteSize: number;
};

export type ProfessorV3SmokeExecutionPinsV2 = {
  version: "phase6a1-professor-v3-smoke-execution-pins-v2";
  decision: string;
  sealedAt: string;
  stackIdentity: string;
  fileCount: number;
  files: ProfessorV3SmokeMaterialPinEntryV2[];
  sha256: string;
};

function hashPinPayload(payload: Omit<ProfessorV3SmokeExecutionPinsV2, "sha256">): string {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

export function sha256Bytes(bytes: Buffer | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function computeProfessorV3SmokeMaterialPins(args?: {
  sources?: ProfessorV3SmokeMaterialSourceV2[];
}): ProfessorV3SmokeMaterialPinEntryV2[] {
  const sources = args?.sources ?? PROFESSOR_V3_SMOKE_MATERIAL_SOURCES_V2;
  return sources.map((entry) => {
    if (!existsSync(entry.path)) throw new Error(`Missing pinned smoke material: ${entry.path}`);
    return {
      label: entry.label,
      path: entry.path.replace(/\\/g, "/"),
      sha256: sha256File(entry.path),
      byteSize: readFileSync(entry.path).length,
    };
  });
}

export function buildProfessorV3SmokeMaterialPinReportV2(args?: {
  sources?: ProfessorV3SmokeMaterialSourceV2[];
}) {
  const files = computeProfessorV3SmokeMaterialPins(args);
  return {
    version: PROFESSOR_V3_SMOKE_MATERIAL_PINS_V2_VERSION,
    generatedAt: new Date().toISOString(),
    fileCount: files.length,
    files,
  };
}

export function loadProfessorV3SmokeExecutionPinsV2(path: string = PROFESSOR_V3_SMOKE_EXECUTION_PINS_V2_PATH): ProfessorV3SmokeExecutionPinsV2 {
  if (!existsSync(path)) throw new Error(`Missing reviewed execution pins: ${path}`);
  const pin = JSON.parse(readFileSync(path, "utf8")) as ProfessorV3SmokeExecutionPinsV2;
  const { sha256: _ignored, ...payload } = pin;
  const expected = hashPinPayload(payload);
  if (pin.sha256 !== expected) {
    throw new Error(`Execution pins SHA256 mismatch: got ${pin.sha256}, expected ${expected}`);
  }
  return pin;
}

export function sealProfessorV3SmokeExecutionPinsV2(args?: {
  path?: string;
  decision?: string;
  stackIdentity?: string;
  sources?: ProfessorV3SmokeMaterialSourceV2[];
}): ProfessorV3SmokeExecutionPinsV2 {
  const files = computeProfessorV3SmokeMaterialPins({ sources: args?.sources });
  const payload = {
    version: "phase6a1-professor-v3-smoke-execution-pins-v2" as const,
    decision: args?.decision ?? "PROFESSOR_V3_ARCHITECTURE_FROZEN_SMOKE_READINESS_BLOCK_V2_EXECUTION_SEAL_AND_EXACT_IO_REQUIRED",
    sealedAt: new Date().toISOString(),
    stackIdentity: args?.stackIdentity ?? "professor-v3-muldrotha-smoke-execution-tree-v2",
    fileCount: files.length,
    files,
  };
  const sealed: ProfessorV3SmokeExecutionPinsV2 = { ...payload, sha256: hashPinPayload(payload) };
  return sealed;
}

export type ProfessorV3SmokeExecutionPinVerificationV2 =
  | { ok: true; reviewed: ProfessorV3SmokeExecutionPinsV2; current: ProfessorV3SmokeMaterialPinEntryV2[] }
  | {
      ok: false;
      reviewed: ProfessorV3SmokeExecutionPinsV2;
      current: ProfessorV3SmokeMaterialPinEntryV2[];
      mismatches: Array<{ label: string; expectedSha256: string; actualSha256: string; path: string }>;
      missingLabels: string[];
      unexpectedLabels: string[];
    };

export function verifyProfessorV3SmokeExecutionPinsV2(args?: {
  expectedPath?: string;
  sources?: ProfessorV3SmokeMaterialSourceV2[];
}): ProfessorV3SmokeExecutionPinVerificationV2 {
  const reviewed = loadProfessorV3SmokeExecutionPinsV2(args?.expectedPath);
  const current = computeProfessorV3SmokeMaterialPins({ sources: args?.sources });
  const expectedByLabel = new Map(reviewed.files.map((f) => [f.label, f]));
  const currentByLabel = new Map(current.map((f) => [f.label, f]));
  const mismatches: Array<{ label: string; expectedSha256: string; actualSha256: string; path: string }> = [];
  const missingLabels: string[] = [];
  for (const [label, expected] of expectedByLabel) {
    const actual = currentByLabel.get(label);
    if (!actual) {
      missingLabels.push(label);
      continue;
    }
    if (actual.sha256 !== expected.sha256) {
      mismatches.push({
        label,
        expectedSha256: expected.sha256,
        actualSha256: actual.sha256,
        path: actual.path,
      });
    }
  }
  const unexpectedLabels = [...currentByLabel.keys()].filter((label) => !expectedByLabel.has(label));
  if (mismatches.length || missingLabels.length || unexpectedLabels.length) {
    return { ok: false, reviewed, current, mismatches, missingLabels, unexpectedLabels };
  }
  return { ok: true, reviewed, current };
}

export function assertProfessorV3SmokeExecutionPinsV2(args?: {
  expectedPath?: string;
  sources?: ProfessorV3SmokeMaterialSourceV2[];
}): ProfessorV3SmokeExecutionPinVerificationV2 & { ok: true } {
  const result = verifyProfessorV3SmokeExecutionPinsV2(args);
  if (!result.ok) {
    const detail = [
      ...result.mismatches.map((m) => `${m.label}: expected ${m.expectedSha256}, got ${m.actualSha256}`),
      ...result.missingLabels.map((l) => `missing reviewed label ${l}`),
      ...result.unexpectedLabels.map((l) => `unexpected label ${l}`),
    ].join("; ");
    throw new Error(`FAIL_CLOSED: Professor v3 smoke execution pin mismatch — ${detail}`);
  }
  return result;
}
