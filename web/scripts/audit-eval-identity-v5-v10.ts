/**
 * Audit catalog-corrected datasets only (v5 + v10).
 * Run: npx tsx scripts/audit-eval-identity-v5-v10.ts
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvLocal } from "./lib/script-env";
import { buildFullEvalCardNameLookup } from "./lib/eval-case-card-name-lookup";
import { auditEvalCaseIdentity, summarizeIdentityAudit } from "./lib/eval-identity-audit-lib";
import { loadGoldenCatalogIndex } from "./lib/load-golden-catalog-index";

loadEnvLocal();

async function main() {
  const catalog = await loadGoldenCatalogIndex();
  const lookup = buildFullEvalCardNameLookup();
  const results = [];

  for (const [version, path] of [
    ["validation_set_v5", "data/oracle-action-eval-validation-v5.json"],
    ["development_set_v10", "data/oracle-action-eval-development-v10.json"],
  ] as const) {
    const payload = JSON.parse(readFileSync(resolve(process.cwd(), path), "utf8")) as {
      cases: Parameters<typeof auditEvalCaseIdentity>[0]["testCase"][];
    };
    for (const testCase of payload.cases) {
      results.push(
        auditEvalCaseIdentity({ testCase, dataset: version, cardName: lookup.get(testCase.id), catalog }),
      );
    }
  }

  const summary = summarizeIdentityAudit(results);
  console.log(JSON.stringify(summary, null, 2));
}

main().catch(console.error);
