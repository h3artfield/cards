import { existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Ensure prospective artifact directory exists before any log redirect / Tee-Object.
 */
export function ensureProspectiveOutputDirectory(relativeOrAbsolutePath: string): string {
  const dir = resolve(relativeOrAbsolutePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}
