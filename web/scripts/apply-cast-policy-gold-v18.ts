/**
 * Apply one-shot cast permission policy to eval-0150 on development_set_v18.
 * Policy: resolution-time "You may cast it without paying" → Layer 2 cast primitive.
 * Run: npx tsx scripts/apply-cast-policy-gold-v18.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  computeDatasetContentHash,
  type CatalogEvalCase,
  type EvalDatasetEnvelope,
} from "./lib/eval-provenance-guard";
import { evidenceMatchesOracle } from "./oracle-action-eval-shared";
import { inferDerivedRoles } from "../src/lib/deck-builder/golden-catalog/oracle-action-taxonomy";

const REVIEWER = "cast-permission-policy-v1";
const REVIEWED_AT = "2026-08-07T08:00:00.000Z";

async function main() {
  const path = resolve(process.cwd(), "data/oracle-action-eval-development-v18.json");
  const envelope = JSON.parse(readFileSync(path, "utf8")) as EvalDatasetEnvelope & {
    cases: CatalogEvalCase[];
    contentHash: string;
  };

  const cases = envelope.cases.map((c) => {
    if (c.id === "eval-0150") {
      const evidence = "You may cast it without paying its mana cost";
      if (!evidenceMatchesOracle(c.oracleText, evidence)) throw new Error("eval-0150 oracle mismatch");
      const expectedPrimitiveActions = [
        { actionType: "cast" as const, evidenceContains: evidence, optionalEffect: true },
      ];
      const primitives = expectedPrimitiveActions.map((p) => p.actionType);
      const forbiddenPrimitiveActions = (c.forbiddenPrimitiveActions ?? []).filter((p) => p !== "cast");
      return {
        ...c,
        expectedPrimitiveActions,
        forbiddenPrimitiveActions: forbiddenPrimitiveActions.length ? forbiddenPrimitiveActions : undefined,
        expectedRoles: inferDerivedRoles(primitives).map((role) => ({ role, fromPrimitiveActions: [...primitives] })),
        goldReviewedAt: REVIEWED_AT,
        goldReviewer: REVIEWER,
        castPermissionPolicyNote: "One-shot resolution cast permission → Layer 2 cast",
      };
    }
    if (c.id === "eval-0157" || c.id === "eval-0163") {
      const hasDrawGold = c.expectedPrimitiveActions.some((p) => p.actionType === "draw");
      const forbiddenPrimitiveActions = (c.forbiddenPrimitiveActions ?? []).filter(
        (p) => !(p === "draw" && hasDrawGold),
      );
      return {
        ...c,
        forbiddenPrimitiveActions: forbiddenPrimitiveActions.length ? forbiddenPrimitiveActions : undefined,
        goldReviewedAt: REVIEWED_AT,
        goldReviewer: REVIEWER,
        forbiddenDrawCleanupNote: "Removed contradictory forbidden draw where draw is in gold",
      };
    }
    return c;
  });

  const contentHash = computeDatasetContentHash(cases);
  const updated = {
    ...envelope,
    contentHash,
    castPermissionPolicy: {
      appliedAt: REVIEWED_AT,
      reviewer: REVIEWER,
      rule: "Resolution-time cast instruction → Layer 2; persistent zone permission → Layer 1 static_permission",
      changedCaseIds: ["eval-0150"],
    },
    cases,
  };

  writeFileSync(path, JSON.stringify(updated, null, 2), "utf8");
  const manifestPath = resolve(process.cwd(), "data/oracle-action-eval-sets-manifest.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Record<string, unknown>;
  if ((manifest.developmentSet as { classification?: string })?.classification === "development_set_v18") {
    (manifest.developmentSet as { contentHash: string }).contentHash = contentHash;
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
  }

  console.log(JSON.stringify({ contentHash, caseId: "eval-0150" }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
