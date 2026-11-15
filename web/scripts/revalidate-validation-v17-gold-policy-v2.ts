/**
 * Revalidate v17 under gold-policy-validator v1.7 (trigger condition reference fix).
 * Preserves certificate v1 + certified artifact; issues v2 if stack upgraded.
 *
 * Run: cd web && npx tsx scripts/revalidate-validation-v17-gold-policy-v2.ts
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
import { writeImmutableBenchmarkEnvelope } from "./lib/immutable-benchmark-storage-v1";
import { attachCaseScopeV11 } from "./lib/case-scope-v11";

const V17_PATH = "data/oracle-action-eval-validation-v17.json";
const OUT_DIR = "data/milestones/validation-v17-certification";
const PRESERVED_HASH = "25b020fcefd8653f9383bac50fde869cb2fa8f09ed8d6403df867f92a9f4c2a4";
const PRESERVED_CERT = `${OUT_DIR}/validation-v17-gold-policy-certificate-v1.json`;
const SET_VERSION = "validation-v17";

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
  const envelope = JSON.parse(readFileSync(V17_PATH, "utf8")) as EvalDatasetEnvelope & {
    cases: OracleActionEvalCaseV2[];
    contentHash: string;
    parserExecutionCount?: number;
  };

  if (envelope.parserExecutionCount !== 0) throw new Error("v17 parserExecutionCount must remain 0");
  if (envelope.contentHash !== PRESERVED_HASH) {
    throw new Error(`Expected preserved v17 hash ${PRESERVED_HASH}, got ${envelope.contentHash}`);
  }

  copyFileSync(
    resolve(PRESERVED_CERT),
    resolve(OUT_DIR, "validation-v17-gold-policy-certificate-v1-preserved-pre-v1.7.json"),
  );
  copyFileSync(
    resolve(OUT_DIR, "validation-v17-certified-25b020fcefd8653f.json"),
    resolve(OUT_DIR, "oracle-action-eval-validation-v17-certified-v1.7-preserved-25b020fcefd8653f.json"),
  );

  const preValidation = validateBenchmarkGoldPolicy({
    cases: envelope.cases,
    benchmarkHash: PRESERVED_HASH,
    benchmarkPath: V17_PATH,
  });

  const removedViolations: Array<Record<string, unknown>> = [];
  const correctedCases = envelope.cases.map((c) => {
    const filtered = filterPolicyValidGold(c, c.expectedPrimitiveActions.filter((g) => !g.negative));
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
      goldReviewVersion: "validation-v17-gold-policy-corrector-v2",
      goldReviewedAt: new Date().toISOString(),
      parserConsulted: false,
      prePolicyValidation: {
        preservedContentHash: PRESERVED_HASH,
        priorCertificate: "validation-v17-gold-policy-certificate-v1.json",
        status: "superseded_before_parser_contact",
        correctedAt: new Date().toISOString(),
        corrector: "validation-v17-gold-policy-corrector-v2",
        policyStackUpgrade: "semantic-gold-policy-v1.7",
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
      priorCertificate: "validation-v17-gold-policy-certificate-v1.json",
    },
  };
  correctedEnvelope.contentHash = computeDatasetContentHash(correctedCases);
  const benchmarkBytesUnchanged = correctedEnvelope.contentHash === PRESERVED_HASH;

  if (!benchmarkBytesUnchanged) {
    writeFileSync(V17_PATH, `${JSON.stringify(correctedEnvelope, null, 2)}\n`);
    writeImmutableBenchmarkEnvelope({
      setVersion: SET_VERSION,
      phase: "certified",
      envelope: correctedEnvelope,
      outDir: OUT_DIR,
    });
  }

  const postValidation = validateBenchmarkGoldPolicy({
    cases: benchmarkBytesUnchanged ? envelope.cases : correctedCases,
    benchmarkHash: benchmarkBytesUnchanged ? PRESERVED_HASH : correctedEnvelope.contentHash,
    benchmarkPath: V17_PATH,
  });
  if (!postValidation.pass) throw new Error(`v17 post-correction validation failed: ${postValidation.violations.length}`);

  const policyStack = computeGoldPolicyStackHashes();
  const cert: GoldPolicyCertificateV2 & { certificateSequence: number; priorCertificatePreserved: string } = {
    certificateVersion: "gold-policy-validation-certificate-v2",
    certificateSequence: 2,
    certifiedAt: new Date().toISOString(),
    benchmarkPath: V17_PATH,
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
    priorCertificatePreserved: "validation-v17-gold-policy-certificate-v1-preserved-pre-v1.7.json",
    note: benchmarkBytesUnchanged
      ? "v1.7 stack — benchmark bytes unchanged; trigger condition reference rule added."
      : "v1.7 stack — gold corrected parser-blind for trigger condition reference violations.",
    supersedes: {
      certificateFile: "validation-v17-gold-policy-certificate-v1.json",
      benchmarkHash: PRESERVED_HASH,
    },
  };

  writeFileSync(resolve(OUT_DIR, "validation-v17-gold-policy-certificate-v2.json"), `${JSON.stringify(cert, null, 2)}\n`);
  writeFileSync(
    resolve(OUT_DIR, "validation-v17-gold-policy-stack-pin-v2.json"),
    `${JSON.stringify(
      {
        pinnedAt: cert.certifiedAt,
        policyStack,
        certificateFile: "validation-v17-gold-policy-certificate-v2.json",
        supersedes: "validation-v17-gold-policy-stack-pin-v1.json",
        benchmarkBytesUnchanged,
        benchmarkContentHash: cert.benchmarkHash,
        layer2Denominator: countLayer2Gold(benchmarkBytesUnchanged ? envelope.cases : correctedCases),
      },
      null,
      2,
    )}\n`,
  );
  writeFileSync(
    resolve(OUT_DIR, "validation-v17-gold-policy-correction-report-v2.json"),
    `${JSON.stringify(
      {
        preservedHash: PRESERVED_HASH,
        newHash: cert.benchmarkHash,
        benchmarkBytesUnchanged,
        removedGoldCount: removedViolations.length,
        removedViolations,
        layer2GoldBefore: countLayer2Gold(envelope.cases),
        layer2GoldAfter: countLayer2Gold(benchmarkBytesUnchanged ? envelope.cases : correctedCases),
        preValidation,
        postValidation,
      },
      null,
      2,
    )}\n`,
  );

  console.log(
    JSON.stringify(
      {
        benchmarkBytesUnchanged,
        preservedHash: PRESERVED_HASH,
        certifiedHash: cert.benchmarkHash,
        layer2Denominator: countLayer2Gold(benchmarkBytesUnchanged ? envelope.cases : correctedCases),
        removedGoldCount: removedViolations.length,
        policyStackCompositeHash: policyStack.stackCompositeHash,
        certificate: "validation-v17-gold-policy-certificate-v2.json",
        parserExecutionCount: 0,
      },
      null,
      2,
    ),
  );
}

main();
