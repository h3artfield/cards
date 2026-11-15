/**
 * Parser-blind v14 gold policy correction — preserves pre-policy seal artifact.
 */
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { computeDatasetContentHash, type EvalDatasetEnvelope } from "./lib/eval-provenance-guard";
import { derivePrimitivesFromOracleText } from "./lib/catalog-oracle-gold-completer";
import { sanitizeGoldPrimitives } from "./lib/gold-sanitize";
import { attachCaseScopeV11 } from "./lib/case-scope-v11";
import type { ExpectedPrimitiveAction, OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";
import { enrichGoldAction } from "./lib/gold-semantic-enrichment-v1";
import { validateBenchmarkGoldPolicy, validateGoldAction } from "./lib/gold-policy-validator-v1";
import { writeImmutableBenchmarkEnvelope, assertImmutableNotOverwritten } from "./lib/immutable-benchmark-storage-v1";

const V14_PATH = "data/oracle-action-eval-validation-v14.json";
const PRESERVED_HASH = "b530c4cdd78356070769e732644ab73beb8085d36cfa4580a3db98020cdd7bc3";
const OUT_DIR = "data/milestones/validation-v14-certification";

function goldKey(g: ExpectedPrimitiveAction): string {
  return `${g.actionType}|${g.evidenceContains.toLowerCase().trim()}|${g.cardFace ?? ""}`;
}

function filterPolicyValidGold(
  testCase: OracleActionEvalCaseV2,
  candidates: ExpectedPrimitiveAction[],
): ExpectedPrimitiveAction[] {
  const kept: ExpectedPrimitiveAction[] = [];
  const seen = new Set<string>();
  for (const gold of candidates) {
    if (gold.negative) continue;
    const key = goldKey(gold);
    if (seen.has(key)) continue;
    if (validateGoldAction(testCase, gold).length > 0) continue;
    seen.add(key);
    const semantic = enrichGoldAction(testCase, gold);
    kept.push({
      ...gold,
      semanticJustification: {
        clauseRole: semantic.clauseRole,
        abilityType: semantic.abilityType,
        executionContext: semantic.executionContext,
        semanticOwner: semantic.semanticOwner,
        cardNativeLayer2Eligible: semantic.cardNativeLayer2Eligible,
        evidenceSpan: semantic.evidenceSpan ?? undefined,
        optionalEffect: semantic.optionalEffect,
        optionalCost: semantic.optionalCost,
      },
    } as ExpectedPrimitiveAction);
  }
  return kept;
}

function main() {
  const PRESERVED_PATH = "data/milestones/validation-v14-certification/oracle-action-eval-validation-v14-pre-policy-sealed.json";
  const path = resolve(process.argv[2] === "--from-current" ? V14_PATH : existsSync(resolve(PRESERVED_PATH)) ? PRESERVED_PATH : V14_PATH);
  const envelope = JSON.parse(readFileSync(path, "utf8")) as EvalDatasetEnvelope & {
    cases: OracleActionEvalCaseV2[];
    contentHash: string;
  };

  if (envelope.contentHash !== PRESERVED_HASH) {
    throw new Error(`Expected preserved v14 hash ${PRESERVED_HASH}, got ${envelope.contentHash}`);
  }

  mkdirSync(resolve(OUT_DIR), { recursive: true });
  assertImmutableNotOverwritten(PRESERVED_PATH, PRESERVED_HASH);
  writeImmutableBenchmarkEnvelope({
    setVersion: "validation-v14",
    phase: "prepolicy",
    envelope: { ...envelope, contentHash: PRESERVED_HASH },
    outDir: OUT_DIR,
  });
  copyFileSync(path, resolve(OUT_DIR, "oracle-action-eval-validation-v14-pre-policy-sealed.json"));

  const correctedCases = envelope.cases.map((c) => {
    let derived = derivePrimitivesFromOracleText(c.oracleText) ?? [];
    derived = sanitizeGoldPrimitives(c.oracleText, derived);
    const merged = [...c.expectedPrimitiveActions.filter((g) => !g.negative), ...derived];
    const filtered = filterPolicyValidGold(c, merged);
    const scoped = attachCaseScopeV11({
      ...c,
      expectedPrimitiveActions: filtered,
      goldReviewVersion: "validation-v14-gold-policy-corrector-v1",
      goldReviewedAt: new Date().toISOString(),
      parserConsulted: false,
    } as OracleActionEvalCaseV2);
    return scoped;
  });

  const corrected: EvalDatasetEnvelope & { cases: OracleActionEvalCaseV2[] } = {
    ...envelope,
    cases: correctedCases,
    contentHash: "",
    prePolicyValidation: {
      preservedContentHash: PRESERVED_HASH,
      preservedArtifact: "data/milestones/validation-v14-certification/oracle-action-eval-validation-v14-pre-policy-sealed.json",
      status: "superseded_before_parser_contact",
      correctedAt: new Date().toISOString(),
      corrector: "validation-v14-gold-policy-corrector-v1",
    },
    goldPolicyCertification: {
      pending: true,
      note: "Re-run run-gold-policy-validator.ts after correction",
    },
  };
  corrected.contentHash = computeDatasetContentHash(correctedCases);

  writeFileSync(path, `${JSON.stringify(corrected, null, 2)}\n`);

  const validation = validateBenchmarkGoldPolicy({
    cases: correctedCases,
    benchmarkHash: corrected.contentHash,
    benchmarkPath: V14_PATH,
  });

  writeFileSync(
    resolve(OUT_DIR, "validation-v14-gold-policy-correction-report-v1.json"),
    `${JSON.stringify({ preservedHash: PRESERVED_HASH, newHash: corrected.contentHash, validation }, null, 2)}\n`,
  );

  console.log(
    JSON.stringify(
      {
        preservedHash: PRESERVED_HASH,
        newHash: corrected.contentHash,
        pass: validation.pass,
        violationCount: validation.violations.length,
        census: validation.census,
      },
      null,
      2,
    ),
  );

  if (!validation.pass) process.exit(1);
}

main();
