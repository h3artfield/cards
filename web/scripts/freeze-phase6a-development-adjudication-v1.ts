#!/usr/bin/env npx tsx
/**
 * Freeze Phase 6A development adjudication — merge independent labels into blinded packets.
 * Usage:
 *   npx tsx scripts/freeze-phase6a-development-adjudication-v1.ts [labels.json]
 *
 * labels.json: [{ "packetId": "...", "independentReviewLabel": "STRONG_FIT", "independentReviewNotes": "..." }]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { IndependentCandidateLabel } from "./lib/phase6a-calibration-v2-types";

const BLINDED_PATH = resolve("data/milestones/deck-synthesis/phase6a-human-calibration-v2-reviewer-blinded.json");
const OUT_PATH = resolve("data/milestones/deck-synthesis/phase6a-development-adjudication-frozen-v1.json");
const POST_HOC_PATH = resolve("data/milestones/deck-synthesis/phase6a-human-calibration-v2-post-hoc-scores.json");

type LabelEntry = {
  packetId: string;
  independentReviewLabel: IndependentCandidateLabel;
  independentReviewNotes?: string | null;
};

function main() {
  const labelsPath = process.argv[2] ? resolve(process.argv[2]) : null;
  const postHocRaw = JSON.parse(readFileSync(POST_HOC_PATH, "utf8")) as {
    records?: Array<{ packetId: string }>;
    scoresByPacketId?: Record<string, { packetId: string }>;
  };
  const postHocIds = new Set(
    postHocRaw.records?.map((r) => r.packetId) ?? Object.keys(postHocRaw.scoresByPacketId ?? {}),
  );

  let merged: Array<Record<string, unknown>>;
  let labeledCount: number;
  let sourceArtifacts: string[];

  if (labelsPath) {
    const source = JSON.parse(readFileSync(labelsPath, "utf8")) as {
      version?: string;
      reviewStatus?: string;
      packetCount?: number;
      packets: Array<Record<string, unknown>>;
    };
    const authoritative =
      source.reviewStatus === "INDEPENDENT_MTG_ADJUDICATION_COMPLETE" ||
      (source.packets?.length === 271 && source.packets.every((p) => p.independentReviewLabel));
    if (authoritative) {
      merged = source.packets.map((p) => ({
        ...p,
        reviewStatus: "FROZEN_DEVELOPMENT_ADJUDICATION",
      }));
      labeledCount = merged.filter((p) => p.independentReviewLabel != null).length;
      sourceArtifacts = [labelsPath, "phase6a-human-calibration-v2-post-hoc-scores.json"];
    } else {
      const blinded = JSON.parse(readFileSync(BLINDED_PATH, "utf8")) as { packets: Array<Record<string, unknown>> };
      const labelByPacket = new Map<string, LabelEntry>();
      const list = Array.isArray(source) ? source : source.packets;
      for (const entry of list as LabelEntry[]) {
        labelByPacket.set(entry.packetId, entry);
      }
      merged = blinded.packets.map((p) => {
        const id = p.packetId as string;
        const label = labelByPacket.get(id);
        return {
          ...p,
          independentReviewLabel: label?.independentReviewLabel ?? p.independentReviewLabel ?? null,
          independentReviewNotes: label?.independentReviewNotes ?? p.independentReviewNotes ?? null,
          reviewStatus: label?.independentReviewLabel ? "FROZEN_DEVELOPMENT_ADJUDICATION" : p.reviewStatus,
        };
      });
      labeledCount = merged.filter((p) => p.independentReviewLabel != null).length;
      sourceArtifacts = [
        "phase6a-human-calibration-v2-reviewer-blinded.json",
        labelsPath,
        "phase6a-human-calibration-v2-post-hoc-scores.json",
      ];
    }
  } else {
    const blinded = JSON.parse(readFileSync(BLINDED_PATH, "utf8")) as { packets: Array<Record<string, unknown>> };
    merged = blinded.packets.map((p) => {
      const label = p.independentReviewLabel as IndependentCandidateLabel | null;
      return {
        ...p,
        reviewStatus: label ? "FROZEN_DEVELOPMENT_ADJUDICATION" : p.reviewStatus,
      };
    });
    labeledCount = merged.filter((p) => p.independentReviewLabel != null).length;
    sourceArtifacts = ["phase6a-human-calibration-v2-reviewer-blinded.json", "phase6a-human-calibration-v2-post-hoc-scores.json"];
  }

  if (labeledCount !== merged.length) {
    console.error(`WARN: only ${labeledCount}/${merged.length} packets have independentReviewLabel.`);
    console.error(`Provide labels file: npx tsx scripts/freeze-phase6a-development-adjudication-v1.ts path/to/labels.json`);
  }

  const packetIds = new Set(merged.map((p) => p.packetId as string));
  const missingPostHoc = [...packetIds].filter((id) => !postHocIds.has(id));

  const artifact = {
    version: "phase6a-development-adjudication-frozen-v1",
    frozenAt: new Date().toISOString(),
    sourceArtifacts,
    labeledPacketCount: labeledCount,
    totalPacketCount: merged.length,
    postHocMergeComplete: missingPostHoc.length === 0,
    missingPostHocPacketIds: missingPostHoc,
    packets: merged,
  };

  writeFileSync(OUT_PATH, JSON.stringify(artifact, null, 2));
  console.log(`Wrote ${OUT_PATH} (${labeledCount}/${merged.length} labeled)`);
}

main();
