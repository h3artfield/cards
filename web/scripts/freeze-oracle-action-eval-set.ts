/**
 * Freeze development evaluation set after manual review of auto-relabels.
 * Run: npx tsx scripts/freeze-oracle-action-eval-set.ts
 *
 * Parser development MUST read oracle-action-eval-development-frozen.json — not v2.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";
import {
  REVIEWER_ID,
  TAXONOMY_VERSION,
  EVALUATION_VERSION,
  applyGoldCorrections,
  buildCardNameLookup,
  cardNameForCase,
  computeContentHash,
  loadLegacyCases,
  type FrozenEvalManifest,
  type ManualReviewRecord,
  type RelabelAuditEntry,
  validateRelabelDecision,
} from "./oracle-action-eval-shared";

function main() {
  const v2Path = resolve(process.cwd(), "data", "oracle-action-eval-cases-v2.json");
  const auditPath = resolve(process.cwd(), "reports", "oracle-action-eval-audit.json");
  const legacyCases = loadLegacyCases();
  const legacyById = new Map(legacyCases.map((c) => [c.id, c]));
  const cardLookup = buildCardNameLookup();

  const v2 = JSON.parse(readFileSync(v2Path, "utf8")) as {
    cases: OracleActionEvalCaseV2[];
  };
  const audit = JSON.parse(readFileSync(auditPath, "utf8")) as {
    audits: RelabelAuditEntry[];
  };

  const caseById = new Map(v2.cases.map((c) => [c.id, c]));
  const reviewTimestamp = new Date().toISOString();
  const reviewRecords: ManualReviewRecord[] = [];
  let confirmed = 0;
  let changed = 0;
  let reverted = 0;

  for (const entry of audit.audits) {
    const testCase = caseById.get(entry.caseId);
    if (!testCase) continue;

    const legacy = legacyById.get(entry.caseId);
    const originalFromLegacy = legacy?.expectedActions.find(
      (e) =>
        e.actionType === entry.originalLabel.split(":")[0] ||
        `${e.actionType}:${e.evidenceContains}` === entry.originalLabel ||
        e.actionType === entry.originalLabel,
    );

    const validation = validateRelabelDecision(entry, testCase);
    if (validation.decision === "confirmed") confirmed += 1;
    else if (validation.decision === "changed") changed += 1;
    else reverted += 1;

    reviewRecords.push({
      caseId: entry.caseId,
      cardName: cardNameForCase(testCase, cardLookup),
      oracleId: testCase.oracleId,
      cardFace: testCase.cardFace,
      originalExpectation: originalFromLegacy
        ? `${originalFromLegacy.actionType}:${originalFromLegacy.evidenceContains}`
        : entry.originalLabel,
      correctedExpectation: entry.newLabel,
      reason: entry.reason,
      reviewer: REVIEWER_ID,
      reviewTimestamp,
      decision: validation.decision,
      reviewNotes: validation.notes,
    });
  }

  const { cases: correctedCases, corrections: goldCorrections } = applyGoldCorrections(v2.cases);
  const contentHash = computeContentHash(correctedCases);
  const distinctReviewed = new Set(audit.audits.map((a) => a.caseId)).size;

  const frozenPayload = {
    evaluationVersion: EVALUATION_VERSION,
    contentHash,
    taxonomyVersion: TAXONOMY_VERSION,
    reviewerCount: 1,
    reviewedCaseCount: distinctReviewed,
    relabeledExpectationCount: audit.audits.length,
    confirmedRelabelCount: confirmed,
    changedRelabelCount: changed + goldCorrections.length,
    revertedRelabelCount: reverted,
    frozenAt: reviewTimestamp,
    rewritePolicy: "frozen — parser development must not silently modify expected labels",
    goldCorrectionsApplied: goldCorrections,
    cases: correctedCases,
  };

  const manifest: FrozenEvalManifest = {
    evaluationVersion: EVALUATION_VERSION,
    contentHash,
    taxonomyVersion: TAXONOMY_VERSION,
    reviewerCount: 1,
    reviewedCaseCount: distinctReviewed,
    relabeledExpectationCount: audit.audits.length,
    confirmedRelabelCount: confirmed,
    changedRelabelCount: changed + goldCorrections.length,
    revertedRelabelCount: reverted,
    frozenAt: reviewTimestamp,
    developmentSetPath: "data/oracle-action-eval-development-frozen.json",
    heldOutSetPath: "data/oracle-action-eval-held-out.json",
    rewritePolicy: "frozen — parser development must not silently modify expected labels",
  };

  const devPath = resolve(process.cwd(), "data", "oracle-action-eval-development-frozen.json");
  const manifestPath = resolve(process.cwd(), "data", "oracle-action-eval-frozen-manifest.json");
  const reviewLogPath = resolve(process.cwd(), "reports", "oracle-action-eval-manual-review.json");

  mkdirSync(resolve(devPath, ".."), { recursive: true });
  writeFileSync(devPath, JSON.stringify(frozenPayload, null, 2), "utf8");
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
  writeFileSync(
    reviewLogPath,
    JSON.stringify(
      {
        generatedAt: reviewTimestamp,
        reviewer: REVIEWER_ID,
        relabeledExpectationCount: audit.audits.length,
        distinctCasesRelabeled: distinctReviewed,
        summary: { confirmed, changed, reverted, goldCorrections: goldCorrections.length },
        goldCorrections,
        reviews: reviewRecords,
      },
      null,
      2,
    ),
    "utf8",
  );

  console.log(`Frozen ${correctedCases.length} development cases`);
  console.log(`  contentHash: ${contentHash}`);
  console.log(`  relabels: ${confirmed} confirmed, ${changed} changed, ${reverted} reverted`);
  console.log(`  gold corrections: ${goldCorrections.length}`);
  console.log(`  → ${devPath}`);
  console.log(`  → ${manifestPath}`);
  console.log(`  → ${reviewLogPath}`);
}

main();
