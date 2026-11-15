#!/usr/bin/env npx tsx
/** Material execution source old→new diff report for independent review. */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { MILESTONES, sha256File } from "./lib/phase6a1-pinned-implementation-container-v1";

const HERE = resolve(fileURLToPath(import.meta.url), "..");
const OUT_PATH = resolve(MILESTONES, "phase6a1-serialization-pilot-material-source-diff-v1.json");

const REVIEWED = {
  pilotRunner: {
    path: "web/scripts/run-phase6a1-run-serialization-pilot-v8.ts",
    sha256: "c593a96af5b1333396360f75bed0316b9e4bb684e8605691e06443985ff018f1",
  },
  pilotConfig: {
    path: "web/scripts/lib/phase6a1-serialization-pilot-v8-config-v1.ts",
    sha256: "17611416e63d64e8105b0f85ca5bbf5a2638937016c399f572db217817524b08",
  },
} as const;

const CURRENT = {
  pilotRunner: resolve(HERE, "run-phase6a1-run-serialization-pilot-v8.ts"),
  pilotConfig: resolve(HERE, "lib/phase6a1-serialization-pilot-v8-config-v1.ts"),
};

function main() {
  const runnerSha = sha256File(CURRENT.pilotRunner);
  const configSha = sha256File(CURRENT.pilotConfig);

  const report = {
    version: "phase6a1-serialization-pilot-material-source-diff-v1",
    generatedAt: new Date().toISOString(),
    decision: "SEMANTIC_OPPORTUNITY_REPAIR_REVIEW_BLOCK_V1_FOUR_TARGETED_ITEMS",
    materialSources: [
      {
        component: "pilotRunner",
        path: REVIEWED.pilotRunner.path,
        reviewedSha256: REVIEWED.pilotRunner.sha256,
        currentSha256: runnerSha,
        changed: runnerSha !== REVIEWED.pilotRunner.sha256,
        semanticChanges: [
          {
            summary: "Fail-fast handling for PROFESSOR_CONTEXT_UNSATISFIABLE without retry spend",
            rationale:
              "Professor context preflight can reject structurally impossible inputs before OpenAI; pilot must not burn retry budget on this class of defect.",
            hunk: [
              "if (record.caseStatus === \"PROFESSOR_CONTEXT_UNSATISFIABLE\") {",
              "  return { pass: false, professorCaseStatus: record.caseStatus, issues: contextPreflightIssues ... };",
              "}",
            ],
          },
        ],
        unifiedDiff: [
          "--- reviewed/run-phase6a1-run-serialization-pilot-v8.ts",
          "+++ current/run-phase6a1-run-serialization-pilot-v8.ts",
          "@@ runPilotCase after Professor invoke @@",
          "+    if (record.caseStatus === \"PROFESSOR_CONTEXT_UNSATISFIABLE\") {",
          "+      return {",
          "+        pilotCaseId: args.pilotCaseId,",
          "+        pass: false,",
          "+        failureClass: \"UPSTREAM_PROFESSOR_FAILURE\",",
          "+        attempts,",
          "+        professorCaseStatus: record.caseStatus,",
          "+        issues: (record.contextPreflightIssues ?? []).map((i) => `${i.code}: ${i.message}`),",
          "+      };",
          "+    }",
        ].join("\n"),
      },
      {
        component: "pilotConfig",
        path: REVIEWED.pilotConfig.path,
        reviewedSha256: REVIEWED.pilotConfig.sha256,
        currentSha256: configSha,
        changed: configSha !== REVIEWED.pilotConfig.sha256,
        semanticChanges: [
          {
            summary: "Pin spent-pilot semantic opportunity supplement v2 artifact/path constants",
            rationale:
              "Loader and stack identity must bind the regenerated supplement-v2 bytes used by the semantic-opportunity repair.",
            hunk: [
              "export const OPPORTUNITY_SUPPLEMENT_V2_ARTIFACT = \"phase6a1-spent-pilot-semantic-opportunity-supplement-v2.json\";",
              "export const OPPORTUNITY_SUPPLEMENT_V2_PATH = resolve(MILESTONES, OPPORTUNITY_SUPPLEMENT_V2_ARTIFACT);",
            ],
          },
        ],
        unifiedDiff: [
          "--- reviewed/phase6a1-serialization-pilot-v8-config-v1.ts",
          "+++ current/phase6a1-serialization-pilot-v8-config-v1.ts",
          "@@ supplement artifact constants @@",
          "+export const OPPORTUNITY_SUPPLEMENT_V2_ARTIFACT = \"phase6a1-spent-pilot-semantic-opportunity-supplement-v2.json\";",
          "+export const OPPORTUNITY_SUPPLEMENT_V2_PATH = resolve(MILESTONES, OPPORTUNITY_SUPPLEMENT_V2_ARTIFACT);",
        ].join("\n"),
      },
    ],
    otherChangedMaterialSourcesInRepair: [
      "web/scripts/lib/phase6a1-professor-plan-agent-v2.ts",
      "web/scripts/lib/phase6a1-spent-pilot-truth-loader-v1.ts",
      "web/scripts/lib/phase6a1-professor-plan-serialization-pilot-stack-v1.ts",
      "web/scripts/lib/phase6a1-semantic-opportunity-fact-family-rules-v1.ts",
      "web/scripts/lib/phase6a1-professor-plan-context-preflight-v1.ts",
      "web/scripts/lib/phase6a1-semantic-opportunity-fidelity-audit-v1.ts",
    ],
    note: "Reviewed-byte snapshots are identified by SHA256 pins from pre-execution hash report v3 material verification, not git history.",
  };

  writeFileSync(OUT_PATH, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ artifact: OUT_PATH, sha256: sha256File(OUT_PATH), report }, null, 2));
}

main();
