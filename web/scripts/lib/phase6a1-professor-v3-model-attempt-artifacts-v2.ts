/**
 * Write-once exact-byte model attempt artifacts at the API boundary.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { sha256Bytes } from "./phase6a1-professor-v3-smoke-material-pins-v2";
import { writeOnceTextArtifact } from "./write-once-text-artifact-v1";

export const PROFESSOR_V3_MODEL_ATTEMPT_ARTIFACTS_V2_VERSION = "phase6a1-professor-v3-model-attempt-artifacts-v2";

export type ProfessorV3ModelAttemptArtifactRecordV2 = {
  attemptIndex: number;
  afterToolResults: boolean;
  systemInstructionsArtifact: string;
  systemInstructionsSha256: string;
  userContentArtifact: string;
  userContentSha256: string;
  repairInstructionsArtifact: string | null;
  repairInstructionsSha256: string | null;
  apiRequestBodyArtifact: string;
  apiRequestBodySha256: string;
  apiResponseRawArtifact: string;
  apiResponseRawSha256: string;
  outputTextArtifact: string;
  outputTextSha256: string;
  parsedResponseArtifact: string;
  parsedResponseSha256: string;
};

export type ProfessorV3ModelAttemptBoundaryCaptureV2 = {
  attemptIndex: number;
  afterToolResults: boolean;
  systemInstructions: string;
  userContent: string;
  repairInstructions?: string;
  apiRequestBody: string;
  apiResponseRaw: string;
  outputText: string;
  parsedResponseJson: string;
};

function writeExactArtifact(absPath: string, exactBytes: string): { artifactPath: string; sha256: string } {
  writeOnceTextArtifact(absPath, exactBytes);
  return { artifactPath: absPath, sha256: sha256Bytes(exactBytes) };
}

export function writeProfessorV3ModelAttemptArtifactsV2(args: {
  outputDir: string;
  relPrefix?: string;
  capture: ProfessorV3ModelAttemptBoundaryCaptureV2;
}): ProfessorV3ModelAttemptArtifactRecordV2 {
  const relPrefix = args.relPrefix ?? "phase6a1-professor-v3-smoke-muldrotha-model-attempts-v1";
  const base = `attempt-${String(args.capture.attemptIndex).padStart(3, "0")}`;
  const prefix = join(args.outputDir, base);

  const system = writeExactArtifact(`${prefix}-system-instructions.txt`, args.capture.systemInstructions);
  const user = writeExactArtifact(`${prefix}-user-content.txt`, args.capture.userContent);
  const request = writeExactArtifact(`${prefix}-api-request-body.json`, args.capture.apiRequestBody);
  const raw = writeExactArtifact(`${prefix}-api-response-raw.json`, args.capture.apiResponseRaw);
  const outputText = writeExactArtifact(`${prefix}-output-text.txt`, args.capture.outputText);
  const parsed = writeExactArtifact(`${prefix}-parsed-response.json`, args.capture.parsedResponseJson);

  let repairInstructionsArtifact: string | null = null;
  let repairInstructionsSha256: string | null = null;
  if (args.capture.repairInstructions) {
    const repair = writeExactArtifact(`${prefix}-repair-instructions.txt`, args.capture.repairInstructions);
    repairInstructionsArtifact = `${relPrefix}/${base}-repair-instructions.txt`;
    repairInstructionsSha256 = repair.sha256;
  }

  return {
    attemptIndex: args.capture.attemptIndex,
    afterToolResults: args.capture.afterToolResults,
    systemInstructionsArtifact: `${relPrefix}/${base}-system-instructions.txt`,
    systemInstructionsSha256: system.sha256,
    userContentArtifact: `${relPrefix}/${base}-user-content.txt`,
    userContentSha256: user.sha256,
    repairInstructionsArtifact,
    repairInstructionsSha256,
    apiRequestBodyArtifact: `${relPrefix}/${base}-api-request-body.json`,
    apiRequestBodySha256: request.sha256,
    apiResponseRawArtifact: `${relPrefix}/${base}-api-response-raw.json`,
    apiResponseRawSha256: raw.sha256,
    outputTextArtifact: `${relPrefix}/${base}-output-text.txt`,
    outputTextSha256: outputText.sha256,
    parsedResponseArtifact: `${relPrefix}/${base}-parsed-response.json`,
    parsedResponseSha256: parsed.sha256,
  };
}

export function verifyProfessorV3ModelAttemptArtifactRecordV2(args: {
  outputDir: string;
  record: ProfessorV3ModelAttemptArtifactRecordV2;
}): boolean {
  const readAndHash = (fileName: string) => sha256Bytes(readFileSync(join(args.outputDir, fileName), "utf8"));
  const checks: Array<[string, string]> = [
    [args.record.systemInstructionsSha256, args.record.systemInstructionsArtifact.split("/").pop()!],
    [args.record.userContentSha256, args.record.userContentArtifact.split("/").pop()!],
    [args.record.apiRequestBodySha256, args.record.apiRequestBodyArtifact.split("/").pop()!],
    [args.record.apiResponseRawSha256, args.record.apiResponseRawArtifact.split("/").pop()!],
    [args.record.outputTextSha256, args.record.outputTextArtifact.split("/").pop()!],
    [args.record.parsedResponseSha256, args.record.parsedResponseArtifact.split("/").pop()!],
  ];
  return checks.every(([expectedSha, fileName]) => readAndHash(fileName) === expectedSha);
}
