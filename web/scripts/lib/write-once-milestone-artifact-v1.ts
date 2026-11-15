/**
 * Fail-closed write-once guard for completed milestone evidence artifacts.
 */
import { existsSync, writeFileSync } from "node:fs";

export function assertWriteOnceArtifactAbsent(absPath: string): void {
  if (existsSync(absPath)) {
    throw new Error(
      `FAIL_CLOSED: write-once artifact already exists and must not be overwritten: ${absPath}. Create a versioned successor artifact and seal a new protocol amendment for legitimate rerun.`,
    );
  }
}

export function writeOnceMilestoneArtifact(absPath: string, value: unknown): void {
  assertWriteOnceArtifactAbsent(absPath);
  writeFileSync(absPath, JSON.stringify(value, null, 2));
}
