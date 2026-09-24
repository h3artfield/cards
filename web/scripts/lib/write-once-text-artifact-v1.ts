/**
 * Fail-closed atomic write-once guard for raw text milestone evidence artifacts.
 */
import { writeFileSync } from "node:fs";

export function writeOnceTextArtifact(absPath: string, text: string): void {
  try {
    writeFileSync(absPath, text, { flag: "wx" });
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "EEXIST") {
      throw new Error(
        `FAIL_CLOSED: write-once text artifact already exists and must not be overwritten: ${absPath}. Create a versioned successor artifact and seal a new protocol amendment for legitimate rerun.`,
      );
    }
    throw err;
  }
}
