/**
 * Fail-closed atomic write-once guard for completed milestone evidence artifacts.
 * Uses exclusive create (wx) so concurrent writers cannot both pass a prior exists check.
 */
import { writeFileSync } from "node:fs";

export function writeOnceMilestoneArtifact(absPath: string, value: unknown): void {
  const bytes = JSON.stringify(value, null, 2);
  try {
    writeFileSync(absPath, bytes, { flag: "wx" });
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "EEXIST") {
      throw new Error(
        `FAIL_CLOSED: write-once artifact already exists and must not be overwritten: ${absPath}. Create a versioned successor artifact and seal a new protocol amendment for legitimate rerun.`,
      );
    }
    throw err;
  }
}
