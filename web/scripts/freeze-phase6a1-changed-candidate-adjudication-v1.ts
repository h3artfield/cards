#!/usr/bin/env npx tsx
/**
 * Freeze Phase 6A.1 changed/new candidate adjudication and merge sealed post-hoc scores.
 * Usage:
 *   npx tsx scripts/freeze-phase6a1-changed-candidate-adjudication-v1.ts [adjudication.json]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { IndependentCandidateLabel } from "./lib/phase6a-calibration-v2-types";

const SEALED_POST_HOC_PATH = resolve("data/milestones/deck-synthesis/phase6a1-changed-candidate-post-hoc-sealed-v1.json");
const FROZEN_PATH = resolve("data/milestones/deck-synthesis/phase6a1-changed-candidate-adjudication-frozen-v1.json");
const MERGED_PATH = resolve("data/milestones/deck-synthesis/phase6a1-changed-candidate-post-hoc-merged-v1.json");

type PostHocRecord = {
  packetId: string;
  compositeScore: number;
  rankOverall: number;
  commanderSemanticFit: number;
  directionFit: number;
  functionalRoleFit: number;
  structuralFit: number;
  sampleTier: string;
};

function main() {
  const adjudicationPath = resolve(process.argv[2] ?? "c:/Users/h3art/Downloads/phase6a1-changed-candidate-independent-review-gpt56sol-v1.json");
  const source = JSON.parse(readFileSync(adjudicationPath, "utf8")) as {
    reviewStatus?: string;
    packetCount?: number;
    packets: Array<Record<string, unknown>>;
  };
  const sealed = JSON.parse(readFileSync(SEALED_POST_HOC_PATH, "utf8")) as {
    scoresByPacketId: Record<string, PostHocRecord>;
    recordCount: number;
  };

  const packets = source.packets.map((p) => ({
    ...p,
    reviewStatus: "FROZEN_DEVELOPMENT_ADJUDICATION",
  }));

  const labeledCount = packets.filter((p) => p.independentReviewLabel != null).length;
  if (labeledCount !== packets.length) {
    console.error(`WARN: only ${labeledCount}/${packets.length} packets labeled`);
  }

  const postHocIds = new Set(Object.keys(sealed.scoresByPacketId));
  const missingPostHoc = packets.map((p) => p.packetId as string).filter((id) => !postHocIds.has(id));

  const mergedRecords = packets.map((p) => {
    const postHoc = sealed.scoresByPacketId[p.packetId as string];
    return {
      packetId: p.packetId,
      caseId: p.caseId,
      requirementId: p.requirementId,
      candidateOracleId: p.candidateOracleId,
      independentReviewLabel: p.independentReviewLabel as IndependentCandidateLabel,
      independentReviewNotes: p.independentReviewNotes ?? null,
      independentReviewSpecStatus: p.independentReviewSpecStatus ?? null,
      changeReason: p.changeReason ?? null,
      postHocRevealedAt: new Date().toISOString(),
      postHoc: postHoc ?? null,
    };
  });

  const labelTotals: Record<string, number> = {};
  for (const r of mergedRecords) {
    labelTotals[r.independentReviewLabel] = (labelTotals[r.independentReviewLabel] ?? 0) + 1;
  }

  writeFileSync(
    FROZEN_PATH,
    JSON.stringify(
      {
        version: "phase6a1-changed-candidate-adjudication-frozen-v1",
        frozenAt: new Date().toISOString(),
        sourceArtifacts: [adjudicationPath, SEALED_POST_HOC_PATH],
        labeledPacketCount: labeledCount,
        totalPacketCount: packets.length,
        postHocMergeComplete: missingPostHoc.length === 0,
        missingPostHocPacketIds: missingPostHoc,
        labelTotals,
        packets,
      },
      null,
      2,
    ),
  );

  writeFileSync(
    MERGED_PATH,
    JSON.stringify(
      {
        version: "phase6a1-changed-candidate-post-hoc-merged-v1",
        mergedAt: new Date().toISOString(),
        note: "Independent labels frozen first; post-hoc scores revealed only after adjudication complete.",
        recordCount: mergedRecords.length,
        labelTotals,
        records: mergedRecords,
      },
      null,
      2,
    ),
  );

  const sealedUpdated = JSON.parse(readFileSync(SEALED_POST_HOC_PATH, "utf8")) as Record<string, unknown>;
  sealedUpdated.reviewStatus = "REVEALED_MERGED_INTO_POST_HOC_MERGED_V1";
  sealedUpdated.revealedAt = new Date().toISOString();
  sealedUpdated.mergedArtifact = "phase6a1-changed-candidate-post-hoc-merged-v1.json";
  writeFileSync(SEALED_POST_HOC_PATH, JSON.stringify(sealedUpdated, null, 2));

  console.log(`Wrote ${FROZEN_PATH} (${labeledCount}/${packets.length} labeled)`);
  console.log(`Wrote ${MERGED_PATH} (${mergedRecords.length} merged records)`);
  console.log(`Label totals:`, labelTotals);
}

main();
