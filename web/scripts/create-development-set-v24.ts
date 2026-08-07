/**
 * Apply v24 shuffle_library gold for tutor generic shuffles → development_set_v24.
 * Run: npx tsx scripts/create-development-set-v24.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  computeDatasetContentHash,
  type CatalogEvalCase,
  type EvalDatasetEnvelope,
} from "./lib/eval-provenance-guard";
import { inferDerivedRoles } from "../src/lib/deck-builder/golden-catalog/oracle-action-taxonomy";
import type { PrimitiveActionType } from "../src/lib/deck-builder/golden-catalog/oracle-action-taxonomy";

const V23_HASH = "a98707aa31e70c196e1b37e574c27bfe9a0da18d5bf0759b89be45bbb50b61e9";

function hasGenericLibraryShuffle(oracleText: string): boolean {
  if (/\bshuffles? [\w ]+ into [\w']+ library\b/i.test(oracleText)) return false;
  if (/\bsearch (?:your |their )?library for\b[\s\S]*\bthen shuffle\b/i.test(oracleText)) return true;
  if (/\bsearch your library for a card, then shuffle and put\b/i.test(oracleText)) return true;
  return false;
}

function shuffleEvidence(oracleText: string): string {
  if (/\bthen shuffle and put\b/i.test(oracleText)) return "shuffle and put that card on top";
  if (/\bthen shuffle\b/i.test(oracleText)) return "then shuffle";
  return "Then shuffle";
}

function applyShuffleGold(c: CatalogEvalCase): CatalogEvalCase | null {
  if (!hasGenericLibraryShuffle(c.oracleText)) return null;
  const gold = c.expectedPrimitiveActions.filter((g) => !g.negative);
  if (gold.some((g) => g.actionType === "shuffle_library")) return null;

  const expectedPrimitiveActions = [
    ...gold,
    {
      actionType: "shuffle_library" as PrimitiveActionType,
      evidenceContains: shuffleEvidence(c.oracleText),
    },
  ];
  const primitives = expectedPrimitiveActions.map((p) => p.actionType);

  return {
    ...c,
    expectedPrimitiveActions,
    expectedRoles: inferDerivedRoles(primitives).map((role) => ({
      role,
      fromPrimitiveActions: [...new Set(primitives)],
    })),
    evaluationSetVersion: "development-v24-shuffle-library-policy",
    taxonomyVersion: "three-layer-v1.3",
    goldReviewedAt: "2026-08-07T13:00:00.000Z",
    goldReviewer: "shuffle-library-policy-v24",
    goldCompleter: "shuffle-library-policy-v24",
    goldCompletedAt: "2026-08-07T13:00:00.000Z",
    goldReviewStatus: "reviewed" as const,
    goldCompletenessStatus: "complete" as const,
    layer2GoldAuditNote:
      "Generic tutor shuffle is shuffle_library (three-layer-v1.3), distinct from shuffle_into_library zone moves.",
  };
}

async function main() {
  const v23Path = resolve(process.cwd(), "data/oracle-action-eval-development-v23.json");
  const v23 = JSON.parse(readFileSync(v23Path, "utf8")) as EvalDatasetEnvelope & {
    cases: CatalogEvalCase[];
    contentHash: string;
  };

  if (v23.contentHash !== V23_HASH) {
    throw new Error(`Expected v23 hash ${V23_HASH}, got ${v23.contentHash}`);
  }

  const changedCaseIds: string[] = [];
  const cases = v23.cases.map((c) => {
    const updated = applyShuffleGold(c);
    if (updated) {
      changedCaseIds.push(c.id);
      return updated;
    }
    return { ...c, taxonomyVersion: "three-layer-v1.3" as const };
  });

  const envelope: EvalDatasetEnvelope & { cases: CatalogEvalCase[] } = {
    ...v23,
    version: "development_set_v24",
    contentHash: "",
    cases,
    goldShuffleLibraryV24Audit: {
      correctedAt: "2026-08-07T13:00:00.000Z",
      corrector: "shuffle-library-policy-v24",
      correctionCount: changedCaseIds.length,
      changedCaseIds,
      policy: "shuffle_library = generic library randomization after search; shuffle_into_library = zone-to-library shuffle.",
    },
  };
  envelope.contentHash = computeDatasetContentHash(envelope.cases);

  const outPath = resolve(process.cwd(), "data/oracle-action-eval-development-v24.json");
  writeFileSync(outPath, JSON.stringify(envelope, null, 2));
  console.log(
    JSON.stringify(
      {
        outPath,
        parentHash: V23_HASH,
        contentHash: envelope.contentHash,
        changedCaseCount: changedCaseIds.length,
        changedCaseIds,
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
