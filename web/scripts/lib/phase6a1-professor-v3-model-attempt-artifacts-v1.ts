/**
 * Write-once preservation of exact Professor v3 model attempt bytes for forensic diagnosis.
 */
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { writeOnceTextArtifact } from "./write-once-text-artifact-v1";
import type { ProfessorV3PromptPayloadV1 } from "./phase6a1-professor-v3-prompt-payload-v1";

export const PROFESSOR_V3_MODEL_ATTEMPT_ARTIFACTS_V1_VERSION = "phase6a1-professor-v3-model-attempt-artifacts-v1";

export type ProfessorV3ModelAttemptArtifactSinkV1 = (args: {
  attemptIndex: number;
  systemPrompt: string;
  userPayload: ProfessorV3PromptPayloadV1;
  repairPrompt?: string;
  rawResponse: unknown;
  afterToolResults: boolean;
}) => {
  systemPromptArtifact: string;
  userPayloadArtifact: string;
  repairPromptArtifact: string | null;
  rawResponseArtifact: string;
};

export function createProfessorV3ModelAttemptArtifactSink(args: {
  outputDir: string;
  relPrefix?: string;
}): ProfessorV3ModelAttemptArtifactSinkV1 {
  mkdirSync(args.outputDir, { recursive: true });
  const relPrefix = args.relPrefix ?? "model-attempts";

  return (input) => {
    const base = `attempt-${String(input.attemptIndex).padStart(3, "0")}`;
    const systemPromptArtifact = join(args.outputDir, `${base}-system-prompt.txt`);
    const userPayloadArtifact = join(args.outputDir, `${base}-user-payload.json`);
    const rawResponseArtifact = join(args.outputDir, `${base}-raw-response.json`);
    const repairPromptArtifact = input.repairPrompt
      ? join(args.outputDir, `${base}-repair-prompt.txt`)
      : null;

    writeOnceTextArtifact(systemPromptArtifact, input.systemPrompt);
    writeOnceTextArtifact(userPayloadArtifact, JSON.stringify(input.userPayload, null, 2));
    writeOnceTextArtifact(rawResponseArtifact, JSON.stringify(input.rawResponse, null, 2));
    if (repairPromptArtifact) writeOnceTextArtifact(repairPromptArtifact, input.repairPrompt!);

    return {
      systemPromptArtifact: `${relPrefix}/${base}-system-prompt.txt`,
      userPayloadArtifact: `${relPrefix}/${base}-user-payload.json`,
      repairPromptArtifact: repairPromptArtifact ? `${relPrefix}/${base}-repair-prompt.txt` : null,
      rawResponseArtifact: `${relPrefix}/${base}-raw-response.json`,
    };
  };
}

export function resolveProfessorV3ModelAttemptsDir(milestonesDir: string): string {
  return resolve(milestonesDir, "phase6a1-professor-v3-smoke-muldrotha-model-attempts-v1");
}
