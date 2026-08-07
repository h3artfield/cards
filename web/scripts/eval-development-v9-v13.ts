import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { ORACLE_ACTION_PARSER_VERSION } from "../src/lib/deck-builder/golden-catalog/oracle-action-schema";
import { evaluateCaseSet } from "./eval-oracle-action-extraction-v6";

const v9 = JSON.parse(readFileSync(resolve(process.cwd(), "data/oracle-action-eval-development-v9.json"), "utf8"));
const r = evaluateCaseSet(v9.cases, "development_set_v9");
const accepted = r.metricsByEmissionTier.acceptedOnly;
const report = {
  generatedAt: new Date().toISOString(),
  parserVersion: ORACLE_ACTION_PARSER_VERSION,
  developmentSet: "development_set_v9",
  developmentSetHash: v9.contentHash,
  accepted,
  needsReview: r.metricsByEmissionTier.needsReviewOnly,
  allEmission: r.metricsByEmissionTier.allEmission,
  unsupported: r.authoritativeClassification.counts.genuinely_unsupported_by_oracle,
  tierInvariants: r.metricsByEmissionTier.tierInvariants,
  gates: {
    acceptedPrecisionPass: accepted.precision >= 0.98,
    acceptedRecallPass: accepted.recall >= 0.9,
    unsupportedPass: r.authoritativeClassification.counts.genuinely_unsupported_by_oracle === 0,
  },
};
mkdirSync(resolve(process.cwd(), "reports"), { recursive: true });
writeFileSync(resolve(process.cwd(), "reports", "oracle-action-eval-development-v9-v13.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
