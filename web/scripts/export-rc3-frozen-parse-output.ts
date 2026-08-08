/**
 * Export immutable frozen RC3 parse output for rescoring without re-running parser.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { parseOracleSemanticsRC3, ORACLE_ACTION_RC3_PARSER_VERSION } from "../src/lib/deck-builder/golden-catalog/oracle-semantic-parse-rc3";
import {
  clearRC3PromotedFamilies,
  resetRC3PromotedFamiliesToDefault,
  setRC3PromotedFamilies,
} from "../src/lib/deck-builder/golden-catalog/oracle-rc3-promotion";
import { semanticActionsForMatch } from "./oracle-action-semantic-matcher";
import { stableActionKey, stableEmittedKey } from "./lib/semantic-action-identity";
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";

type Case = OracleActionEvalCaseV2 & { cardName?: string };

function loadCombined(): Case[] {
  const paths = [
    "data/oracle-action-eval-development-v26-v14.json",
    "data/oracle-action-eval-development-generalization-expansion-v2-v14.json",
    "data/oracle-action-eval-development-generalization-expansion-v3-v14.json",
    "data/oracle-action-eval-development-generalization-expansion-v5-v14.json",
    "data/oracle-action-eval-rc3-positive-training-catalog-v133.json",
  ];
  const all: Case[] = [];
  for (const p of paths) all.push(...(JSON.parse(readFileSync(p, "utf8")) as { cases: Case[] }).cases);
  return all;
}

function blobSha(path: string): string {
  return execSync(`git hash-object ${path}`, { encoding: "utf8" }).trim();
}

function main() {
  const label = process.argv.find((a) => a.startsWith("--label="))?.split("=")[1] ?? "frozen";
  const promotion = process.argv.find((a) => a.startsWith("--promotion="))?.split("=")[1] ?? "default";
  const repoRoot = resolve(process.cwd(), "..");
  const commit = execSync("git rev-parse HEAD", { cwd: repoRoot, encoding: "utf8" }).trim();

  if (promotion === "none") clearRC3PromotedFamilies();
  else if (promotion === "search") {
    clearRC3PromotedFamilies();
    setRC3PromotedFamilies(["search_put_shuffle_chain"]);
  } else resetRC3PromotedFamiliesToDefault();

  const cases = loadCombined();
  const caseOutputs = cases.map((testCase) => {
    const parsed = parseOracleSemanticsRC3({
      oracleId: testCase.oracleId,
      oracleText: testCase.oracleText,
      cardFace: testCase.cardFace,
    });
    const actions = semanticActionsForMatch(parsed).filter((a) => a.reviewStatus === "accepted");
    return {
      caseId: testCase.id,
      oracleId: testCase.oracleId,
      cardName: testCase.cardName,
      semanticInvalidActionCount: parsed.semanticValidation.invalidActionCount,
      semanticValidatorViolationCount: parsed.semanticValidation.invalidCount,
      emittedActions: actions.map((action) => {
        const legacy = parsed.legacy.actions.find((a) => a.actionId === parsed.actions[action.index]?.actionId);
        const row = {
          stableKey: stableEmittedKey({
            caseId: testCase.id,
            oracleId: testCase.oracleId,
            action,
            extractionSource: (legacy as { extractionSource?: string })?.extractionSource,
          }),
          actionKey: stableActionKey(action),
          actionType: action.actionType,
          evidenceText: action.evidenceText,
          evidenceStart: action.evidenceStart,
          parentAbilityId: action.parentAbilityId,
          clauseId: action.clauseId,
          modalOptionId: action.modalOptionKey ?? action.modalOptionId,
          faceId: action.faceId,
          extractionSource: (legacy as { extractionSource?: string })?.extractionSource,
        };
        return row;
      }),
    };
  });

  const out = {
    frozenAt: new Date().toISOString(),
    label,
    lineage: {
      parentCommit: "6a757a736dfda9004860bb38d5e677880590882c",
      note:
        label.includes("132")
          ? "Immutable v1.31 parent commit; v1.32 working parser state captured at export time — not an immutable v1.32 commit"
          : "v1.34 stabilization parser at HEAD",
      gitCommitAtExport: commit,
      parserVersion: ORACLE_ACTION_RC3_PARSER_VERSION,
      transformBlobSha: blobSha("src/lib/deck-builder/golden-catalog/oracle-rc3-transform.ts"),
      clauseNativeBlobSha: blobSha("src/lib/deck-builder/golden-catalog/oracle-rc3-clause-native.ts"),
      promotion,
    },
    caseCount: cases.length,
    contentHash: createHash("sha256").update(JSON.stringify(caseOutputs)).digest("hex"),
    cases: caseOutputs,
  };

  const outDir = resolve("data/milestones/rc3-development");
  mkdirSync(outDir, { recursive: true });
  const outPath = resolve(outDir, `frozen-parse-output-${label}.json`);
  writeFileSync(outPath, `${JSON.stringify(out, null, 2)}\n`);
  console.log(JSON.stringify({ label, outPath, caseCount: cases.length, parserVersion: ORACLE_ACTION_RC3_PARSER_VERSION }, null, 2));
}

main();
