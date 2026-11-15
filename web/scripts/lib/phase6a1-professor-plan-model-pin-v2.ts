/**
 * Load and hash the formal Professor PLAN v2 model pin.
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

export const PROFESSOR_PLAN_MODEL_PIN_V2_PATH = resolve(
  "data/milestones/deck-synthesis/phase6a1-professor-plan-model-pin-v2.json",
);

export type ProfessorReasoningConfigurationV2 = {
  effort: "none" | "low" | "medium" | "high" | "xhigh" | "max";
  mode: "standard" | "pro";
};

export type ProfessorModelPinV2 = {
  version: string;
  pinnedAt: string;
  authorization: string;
  provider: string;
  apiSurface: "responses";
  modelIdentifier: string;
  modelAlias?: string;
  productName: string;
  reasoningConfiguration: ProfessorReasoningConfigurationV2;
  inferenceParameters: {
    temperature: number | null;
    maxCompletionTokens: number;
    responseFormatFinal: "json_object";
    requestTimeoutMs: number;
  };
  experimentBounds: {
    maxProfessorToolCalls: number;
    maxEvidenceChunks: number;
    maxValidationRepairRounds: number;
  };
  note: string;
  sha256: string;
};

export function hashModelPinPayload(pin: Omit<ProfessorModelPinV2, "sha256">): string {
  return createHash("sha256").update(JSON.stringify(pin)).digest("hex");
}

export function loadProfessorModelPinV2(path: string = PROFESSOR_PLAN_MODEL_PIN_V2_PATH): ProfessorModelPinV2 {
  if (!existsSync(path)) {
    throw new Error(`Professor model pin not found: ${path}`);
  }
  const pin = JSON.parse(readFileSync(path, "utf8")) as ProfessorModelPinV2;
  const { sha256: _ignored, ...payload } = pin;
  const expected = hashModelPinPayload(payload);
  if (pin.sha256 !== expected) {
    throw new Error(`Professor model pin SHA256 mismatch: got ${pin.sha256}, expected ${expected}`);
  }
  return pin;
}

export function writeProfessorModelPinV2(pin: Omit<ProfessorModelPinV2, "sha256">, path: string = PROFESSOR_PLAN_MODEL_PIN_V2_PATH): ProfessorModelPinV2 {
  const sha256 = hashModelPinPayload(pin);
  const full: ProfessorModelPinV2 = { ...pin, sha256 };
  writeFileSync(path, JSON.stringify(full, null, 2));
  return full;
}
