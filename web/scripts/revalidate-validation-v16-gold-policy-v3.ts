/**
 * Revalidate v16 with gold-policy-validator v1.6 (create-with-quote token definition).
 * Preserves v1.5 certified artifact; corrects gold parser-blind if violations found.
 *
 * Run: cd web && npx tsx scripts/revalidate-validation-v16-gold-policy-v3.ts
 */
import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ExpectedPrimitiveAction, OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";
import { computeDatasetContentHash, type EvalDatasetEnvelope } from "./lib/eval-provenance-guard";
import { enrichGoldAction } from "./lib/gold-semantic-enrichment-v1";
import {
  GOLD_POLICY_VALIDATOR_VERSION,
  GOLD_POLICY_VERSION,
  validateBenchmarkGoldPolicy,
  validateGoldAction,
  validatorSourceHash,
} from "./lib/gold-policy-validator-v1";
import { computeGoldPolicyStackHashes, type GoldPolicyCertificateV2 } from "./lib/gold-policy-stack-v1";
import {
  immutableBenchmarkFilename,
  writeImmutableBenchmarkCopy,
  writeImmutableBenchmarkEnvelope,
} from "./lib/immutable-benchmark-storage-v1";
import { attachCaseScopeV11 } from "./lib/case-scope-v11";

const V16_PATH = "data/oracle-action-eval-validation-v16.json";
const OUT_DIR = "data/milestones/validation-v16-certification";
const PRESERVED_HASH = "a72cb634ad9e7d8a5feb8705485b533cccdae67e1be17602829807c6848ea5fe";
const SET_VERSION = "validation-v16";

function goldKey(g: ExpectedPrimitiveAction): string {
  return `${g.actionType}|${(g.evidenceContains ?? "").toLowerCase().trim()}|${g.cardFace ?? ""}`;
}

function filterPolicyValidGold(
  testCase: OracleActionEvalCaseV2,
  golds: ExpectedPrimitiveAction[],
): ExpectedPrimitiveAction[] {
  const kept: ExpectedPrimitiveAction[] = [];
  const seen = new Set<string>();
  for (const gold of golds) {
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

function countLayer2Gold(cases: OracleActionEvalCaseV2[]): number {
  return cases.reduce((n, c) => n + c.expectedPrimitiveActions.filter((g) => !g.negative).length, 0);
}

function main() {
  mkdirSync(resolve(OUT_DIR), { recursive: true });
  const envelope = JSON.parse(readFileSync(V16_PATH, "utf8")) as EvalDatasetEnvelope & {
    cases: OracleActionEvalCaseV2[];
    contentHash: string;
    parserExecutionCount?: number;
  };

  if (envelope.parserExecutionCount !== 0) {
    throw new Error("v16 parserExecutionCount must remain 0");
  }
  if (envelope.contentHash !== PRESERVED_HASH) {
    throw new Error(`Expected preserved v16 hash ${PRESERVED_HASH}, got ${envelope.contentHash}`);
  }

  const preValidation = validateBenchmarkGoldPolicy({
    cases: envelope.cases,
    benchmarkHash: PRESERVED_HASH,
    benchmarkPath: V16_PATH,
  });

  copyFileSync(
    resolve(V16_PATH),
    resolve(OUT_DIR, `oracle-action-eval-validation-v16-certified-v1.5-${PRESERVED_HASH.slice(0, 16)}.json`),
  );

  const removedViolations: Array<Record<string, unknown>> = [];
  const correctedCases = envelope.cases.map((c) => {
    const filtered = filterPolicyValidGold(
      c,
      c.expectedPrimitiveActions.filter((g) => !g.negative),
    );
    for (const g of c.expectedPrimitiveActions.filter((x) => !x.negative)) {
      const v = validateGoldAction(c, g);
      if (v.length > 0) {
        removedViolations.push({
          caseId: c.id,
          cardName: c.cardName,
          actionType: g.actionType,
          evidenceContains: g.evidenceContains,
          violations: v.map((x) => ({ code: x.code, policyFamily: x.policyFamily, reason: x.policyReason })),
        });
      }
    }
    return attachCaseScopeV11({
      ...c,
      expectedPrimitiveActions: filtered,
      goldReviewVersion: "validation-v16-gold-policy-corrector-v3",
      goldReviewedAt: new Date().toISOString(),
      parserConsulted: false,
      prePolicyValidation: {
        preservedContentHash: PRESERVED_HASH,
        priorCertificate: "validation-v16-gold-policy-certificate-v2.json",
        status: "superseded_before_parser_contact",
        correctedAt: new Date().toISOString(),
        corrector: "validation-v16-gold-policy-corrector-v3",
        policyStackUpgrade: "semantic-gold-policy-v1.6",
      },
    } as OracleActionEvalCaseV2);
  });

  const correctedEnvelope: EvalDatasetEnvelope & { cases: OracleActionEvalCaseV2[] } = {
    ...envelope,
    cases: correctedCases,
    contentHash: "",
    benchmarkStatus: "policy_corrected_pending_certification",
    goldCertification: {
      ...(envelope as { goldCertification?: Record<string, unknown> }).goldCertification,
      layer2GoldPrimitiveCount: countLayer2Gold(correctedCases),
      priorCertifiedHash: PRESERVED_HASH,
      priorCertificate: "validation-v16-gold-policy-certificate-v2.json",
    },
  };
  correctedEnvelope.contentHash = computeDatasetContentHash(correctedCases);

  const benchmarkBytesUnchanged = correctedEnvelope.contentHash === PRESERVED_HASH;

  if (!benchmarkBytesUnchanged) {
    writeFileSync(V16_PATH, `${JSON.stringify(correctedEnvelope, null, 2)}\n`);
  }

  const postValidation = validateBenchmarkGoldPolicy({
    cases: benchmarkBytesUnchanged ? envelope.cases : correctedCases,
    benchmarkHash: benchmarkBytesUnchanged ? PRESERVED_HASH : correctedEnvelope.contentHash,
    benchmarkPath: V16_PATH,
  });

  if (!postValidation.pass) {
    writeFileSync(
      resolve(OUT_DIR, "validation-v16-gold-policy-validation-failure-v3.json"),
      `${JSON.stringify({ preValidation, postValidation, removedViolations, benchmarkBytesUnchanged }, null, 2)}\n`,
    );
    throw new Error(`v16 post-correction validation failed: ${postValidation.violations.length} violations`);
  }

  const policyStack = computeGoldPolicyStackHashes();
  const cert: GoldPolicyCertificateV2 = {
    certificateVersion: "gold-policy-validation-certificate-v3",
    certifiedAt: new Date().toISOString(),
    benchmarkPath: V16_PATH,
    benchmarkHash: benchmarkBytesUnchanged ? PRESERVED_HASH : correctedEnvelope.contentHash,
    benchmarkStatus: "sealed_policy_certified",
    policyVersion: GOLD_POLICY_VERSION,
    validatorVersion: GOLD_POLICY_VALIDATOR_VERSION,
    validatorHash: validatorSourceHash(),
    policyRegistryHash: policyStack.policyRegistryHash,
    policyStack,
    parserExecutionCount: 0,
    violations: 0,
    census: postValidation.census,
    perPolicyFamily: postValidation.perPolicyFamily,
    note: benchmarkBytesUnchanged
      ? "v1.6 stack — benchmark bytes unchanged from v2; new certificate against upgraded policy stack only."
      : "v1.6 stack — supersedes certificate-v2; gold corrected parser-blind.",
    supersedes: {
      certificateFile: "validation-v16-gold-policy-certificate-v2.json",
      benchmarkHash: PRESERVED_HASH,
    },
  };

  writeFileSync(resolve(OUT_DIR, "validation-v16-gold-policy-certificate-v3.json"), `${JSON.stringify(cert, null, 2)}\n`);
  writeFileSync(
    resolve(OUT_DIR, "validation-v16-gold-policy-validation-report-v3.json"),
    `${JSON.stringify({ preValidation, postValidation, policyStack, removedViolations, benchmarkBytesUnchanged }, null, 2)}\n`,
  );

  if (!benchmarkBytesUnchanged) {
    writeFileSync(
      resolve(OUT_DIR, "validation-v16-gold-policy-correction-report-v3.json"),
      `${JSON.stringify(
        {
          preservedHash: PRESERVED_HASH,
          newHash: correctedEnvelope.contentHash,
          removedGoldCount: removedViolations.length,
          removedViolations,
          layer2GoldBefore: countLayer2Gold(envelope.cases),
          layer2GoldAfter: countLayer2Gold(correctedCases),
        },
        null,
        2,
      )}\n`,
    );
    writeImmutableBenchmarkEnvelope({
      setVersion: SET_VERSION,
      phase: "certified",
      envelope: correctedEnvelope,
      outDir: OUT_DIR,
    });
  }

  writeFileSync(
    resolve(OUT_DIR, "validation-v16-gold-policy-stack-pin-v3.json"),
    `${JSON.stringify(
      {
        pinnedAt: cert.certifiedAt,
        policyStack,
        certificateFile: "validation-v16-gold-policy-certificate-v3.json",
        supersedes: "validation-v16-gold-policy-stack-pin-v2.json",
        benchmarkBytesUnchanged,
        immutableCertName: immutableBenchmarkFilename(
          SET_VERSION,
          "certified",
          cert.benchmarkHash,
        ),
      },
      null,
      2,
    )}\n`,
  );

  console.log(
    JSON.stringify(
      {
        preservedHash: PRESERVED_HASH,
        benchmarkHash: cert.benchmarkHash,
        benchmarkBytesUnchanged,
        preViolationCount: preValidation.violations.length,
        postViolationCount: postValidation.violations.length,
        removedGoldCount: removedViolations.length,
        layer2GoldAfter: countLayer2Gold(benchmarkBytesUnchanged ? envelope.cases : correctedCases),
        stackCompositeHash: policyStack.stackCompositeHash,
        certificate: "validation-v16-gold-policy-certificate-v3.json",
      },
      null,
      2,
    ),
  );
}

main();
