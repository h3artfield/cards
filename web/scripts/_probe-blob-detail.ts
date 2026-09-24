import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PARSER_BLOB_SCOPE_PATHS } from "./lib/parser-scope-paths-v1";

const paths = [
  ...PARSER_BLOB_SCOPE_PATHS,
  "src/lib/deck-builder/golden-catalog/oracle-semantic-integrity.ts",
  "scripts/test-rc8-action-ownership-regressions.ts",
];
for (const p of paths) {
  const h = createHash("sha256").update(readFileSync(resolve(p))).digest("hex");
  console.log(h.slice(0, 12), p);
}
