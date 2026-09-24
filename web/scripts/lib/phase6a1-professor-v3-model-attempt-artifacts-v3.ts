/**
 * Staged write-once exact-byte model attempt artifacts at the API boundary.
 * Request bytes are preserved before fetch; raw response before parse/check.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { sha256Bytes } from "./phase6a1-professor-v3-smoke-material-pins-v3";
import { writeOnceTextArtifact } from "./write-once-text-artifact-v1";

export const PROFESSOR_V3_MODEL_ATTEMPT_ARTIFACTS_V3_VERSION = "phase6a1-professor-v3-model-attempt-artifacts-v3";

export type ProfessorV3ModelAttemptRequestPhaseRecordV3 = {
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
};

export type ProfessorV3ModelAttemptResponsePhaseRecordV3 = ProfessorV3ModelAttemptRequestPhaseRecordV3 & {
  apiResponseRawArtifact: string | null;
  apiResponseRawSha256: string | null;
  httpStatus: number | null;
  httpStatusText: string | null;
  httpMetadataArtifact: string | null;
  httpMetadataSha256: string | null;
};

export type ProfessorV3ModelAttemptArtifactRecordV3 = ProfessorV3ModelAttemptResponsePhaseRecordV3 & {
  outputTextArtifact: string | null;
  outputTextSha256: string | null;
  parsedResponseArtifact: string | null;
  parsedResponseSha256: string | null;
};

function relArtifact(relPrefix: string, base: string, suffix: string): string {
  return `${relPrefix}/${base}-${suffix}`;
}

function writeExactArtifact(absPath: string, exactBytes: string): { artifactPath: string; sha256: string } {
  writeOnceTextArtifact(absPath, exactBytes);
  return { artifactPath: absPath, sha256: sha256Bytes(exactBytes) };
}

export class ProfessorV3StagedModelAttemptWriterV3 {
  private readonly relPrefix: string;
  private readonly prefix: string;
  private readonly base: string;
  private requestRecord: ProfessorV3ModelAttemptRequestPhaseRecordV3 | null = null;
  private responseRecord: ProfessorV3ModelAttemptResponsePhaseRecordV3 | null = null;

  constructor(args: { outputDir: string; relPrefix?: string; attemptIndex: number; afterToolResults: boolean }) {
    this.relPrefix = args.relPrefix ?? "phase6a1-professor-v3-smoke-muldrotha-model-attempts-v1";
    this.base = `attempt-${String(args.attemptIndex).padStart(3, "0")}`;
    this.prefix = join(args.outputDir, this.base);
    this.requestRecord = {
      attemptIndex: args.attemptIndex,
      afterToolResults: args.afterToolResults,
      systemInstructionsArtifact: "",
      systemInstructionsSha256: "",
      userContentArtifact: "",
      userContentSha256: "",
      repairInstructionsArtifact: null,
      repairInstructionsSha256: null,
      apiRequestBodyArtifact: "",
      apiRequestBodySha256: "",
    };
  }

  writeRequestPhase(capture: {
    systemInstructions: string;
    userContent: string;
    repairInstructions?: string;
    apiRequestBody: string;
  }): ProfessorV3ModelAttemptRequestPhaseRecordV3 {
    const system = writeExactArtifact(`${this.prefix}-system-instructions.txt`, capture.systemInstructions);
    const user = writeExactArtifact(`${this.prefix}-user-content.txt`, capture.userContent);
    const request = writeExactArtifact(`${this.prefix}-api-request-body.json`, capture.apiRequestBody);
    let repairInstructionsArtifact: string | null = null;
    let repairInstructionsSha256: string | null = null;
    if (capture.repairInstructions) {
      const repair = writeExactArtifact(`${this.prefix}-repair-instructions.txt`, capture.repairInstructions);
      repairInstructionsArtifact = relArtifact(this.relPrefix, this.base, "repair-instructions.txt");
      repairInstructionsSha256 = repair.sha256;
    }
    this.requestRecord = {
      attemptIndex: this.requestRecord!.attemptIndex,
      afterToolResults: this.requestRecord!.afterToolResults,
      systemInstructionsArtifact: relArtifact(this.relPrefix, this.base, "system-instructions.txt"),
      systemInstructionsSha256: system.sha256,
      userContentArtifact: relArtifact(this.relPrefix, this.base, "user-content.txt"),
      userContentSha256: user.sha256,
      repairInstructionsArtifact,
      repairInstructionsSha256,
      apiRequestBodyArtifact: relArtifact(this.relPrefix, this.base, "api-request-body.json"),
      apiRequestBodySha256: request.sha256,
    };
    return this.requestRecord;
  }

  writeResponseRawPhase(capture: {
    apiResponseRaw: string;
    httpStatus: number;
    httpStatusText: string;
  }): ProfessorV3ModelAttemptResponsePhaseRecordV3 {
    if (!this.requestRecord) throw new Error("Request phase must be written before response phase");
    const raw = writeExactArtifact(`${this.prefix}-api-response-raw.json`, capture.apiResponseRaw);
    const httpMetadataJson = JSON.stringify(
      { httpStatus: capture.httpStatus, httpStatusText: capture.httpStatusText },
      null,
      2,
    );
    const httpMetadata = writeExactArtifact(`${this.prefix}-http-metadata.json`, httpMetadataJson);
    this.responseRecord = {
      ...this.requestRecord,
      apiResponseRawArtifact: relArtifact(this.relPrefix, this.base, "api-response-raw.json"),
      apiResponseRawSha256: raw.sha256,
      httpStatus: capture.httpStatus,
      httpStatusText: capture.httpStatusText,
      httpMetadataArtifact: relArtifact(this.relPrefix, this.base, "http-metadata.json"),
      httpMetadataSha256: httpMetadata.sha256,
    };
    return this.responseRecord;
  }

  finalizeSuccessPhase(capture: { outputText: string; parsedResponseJson: string }): ProfessorV3ModelAttemptArtifactRecordV3 {
    if (!this.responseRecord) throw new Error("Response phase must be written before success finalize");
    const outputText = writeExactArtifact(`${this.prefix}-output-text.txt`, capture.outputText);
    const parsed = writeExactArtifact(`${this.prefix}-parsed-response.json`, capture.parsedResponseJson);
    return {
      ...this.responseRecord,
      outputTextArtifact: relArtifact(this.relPrefix, this.base, "output-text.txt"),
      outputTextSha256: outputText.sha256,
      parsedResponseArtifact: relArtifact(this.relPrefix, this.base, "parsed-response.json"),
      parsedResponseSha256: parsed.sha256,
    };
  }

  finalizeIncompletePhase(capture?: { outputText?: string }): ProfessorV3ModelAttemptArtifactRecordV3 {
    if (!this.responseRecord) throw new Error("Response phase must be written before incomplete finalize");
    let outputTextArtifact: string | null = null;
    let outputTextSha256: string | null = null;
    if (capture?.outputText !== undefined) {
      const outputText = writeExactArtifact(`${this.prefix}-output-text.txt`, capture.outputText);
      outputTextArtifact = relArtifact(this.relPrefix, this.base, "output-text.txt");
      outputTextSha256 = outputText.sha256;
    }
    return {
      ...this.responseRecord,
      outputTextArtifact,
      outputTextSha256,
      parsedResponseArtifact: null,
      parsedResponseSha256: null,
    };
  }

  getRequestRecord(): ProfessorV3ModelAttemptRequestPhaseRecordV3 | null {
    return this.requestRecord;
  }

  getResponseRecord(): ProfessorV3ModelAttemptResponsePhaseRecordV3 | null {
    return this.responseRecord;
  }
}

export function verifyProfessorV3ModelAttemptArtifactRecordV3(args: {
  outputDir: string;
  record: ProfessorV3ModelAttemptArtifactRecordV3;
}): boolean {
  const readAndHash = (fileName: string) => sha256Bytes(readFileSync(join(args.outputDir, fileName), "utf8"));
  const checks: Array<[string | null, string | null]> = [
    [args.record.systemInstructionsSha256, args.record.systemInstructionsArtifact.split("/").pop()!],
    [args.record.userContentSha256, args.record.userContentArtifact.split("/").pop()!],
    [args.record.apiRequestBodySha256, args.record.apiRequestBodyArtifact.split("/").pop()!],
    [args.record.apiResponseRawSha256, args.record.apiResponseRawArtifact?.split("/").pop() ?? null],
    [args.record.httpMetadataSha256, args.record.httpMetadataArtifact?.split("/").pop() ?? null],
    [args.record.outputTextSha256, args.record.outputTextArtifact?.split("/").pop() ?? null],
    [args.record.parsedResponseSha256, args.record.parsedResponseArtifact?.split("/").pop() ?? null],
  ];
  return checks.every(([expectedSha, fileName]) => {
    if (!expectedSha || !fileName) return true;
    return readAndHash(fileName) === expectedSha;
  });
}

export function verifyProfessorV3ModelAttemptRequestPreservedV3(args: {
  outputDir: string;
  record: ProfessorV3ModelAttemptRequestPhaseRecordV3;
}): boolean {
  return (
    existsSync(join(args.outputDir, args.record.systemInstructionsArtifact.split("/").pop()!)) &&
    existsSync(join(args.outputDir, args.record.userContentArtifact.split("/").pop()!)) &&
    existsSync(join(args.outputDir, args.record.apiRequestBodyArtifact.split("/").pop()!))
  );
}

export function verifyProfessorV3ModelAttemptRawResponsePreservedV3(args: {
  outputDir: string;
  record: ProfessorV3ModelAttemptResponsePhaseRecordV3;
}): boolean {
  if (!args.record.apiResponseRawArtifact) return false;
  return existsSync(join(args.outputDir, args.record.apiResponseRawArtifact.split("/").pop()!));
}
