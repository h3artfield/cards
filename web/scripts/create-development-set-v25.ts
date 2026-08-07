/**
 * v25 precision-pass gold corrections on development_set_v24.
 * Run: npx tsx scripts/create-development-set-v25.ts
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

const V24_HASH = "25ec563250fa18adfa3bcd500953aa37c12a8cdbfa00af4d8014dd91ff365d08";

type GoldPatch = {
  replace?: CatalogEvalCase["expectedPrimitiveActions"];
  merge?: CatalogEvalCase["expectedPrimitiveActions"];
};

const GOLD_PATCHES: Record<string, GoldPatch> = {
  "dev-opt-010": {
    replace: [
      { actionType: "surveil", evidenceContains: "Surveil 2" },
      {
        actionType: "discard",
        evidenceContains: "discard a card",
        targetMinimum: 0,
        quantityMayBeZero: true,
        optionalEffect: false,
      },
      {
        actionType: "return_to_battlefield",
        evidenceContains: "from your graveyard to the battlefield",
      },
    ],
  },
  "dev-v9-004": {
    replace: [
      {
        actionType: "put_onto_battlefield",
        evidenceContains: "put it onto the battlefield",
        optionalEffect: false,
        sourceZone: "library",
        destinationZone: "battlefield",
        affectedObject: "land_card",
      },
      { actionType: "search_library", evidenceContains: "Search your library for a land card" },
      { actionType: "shuffle_library", evidenceContains: "then shuffle" },
    ],
  },
  "dev-v9-024": {
    merge: [{ actionType: "destroy", evidenceContains: "Destroy target enchantment" }],
  },
  "eval-0026": {
    merge: [{ actionType: "lose_life", evidenceContains: "lose 2 life" }],
  },
  "eval-0043": {
    merge: [{ actionType: "destroy", evidenceContains: "Destroy target planeswalker" }],
  },
  "eval-0057": {
    replace: [
      { actionType: "exile", evidenceContains: "exiles all creature cards from their graveyard" },
      { actionType: "sacrifice", evidenceContains: "sacrifices all creatures they control" },
      {
        actionType: "put_onto_battlefield",
        evidenceContains: "puts all cards they exiled this way onto the battlefield",
      },
    ],
  },
  "eval-0096": {
    replace: [
      {
        actionType: "return_to_hand",
        evidenceContains: "return target creature to its owner's hand",
        optionalEffect: true,
      },
    ],
  },
  "eval-0139": {
    merge: [{ actionType: "deal_damage", evidenceContains: "deals 2 damage" }],
  },
  "eval-0258": {
    replace: [
      {
        actionType: "shuffle_into_library",
        evidenceContains: "shuffles their hand and graveyard into their library",
        cardFace: "back",
      },
      {
        actionType: "draw",
        evidenceContains: "draws seven cards",
        cardFace: "back",
      },
    ],
  },
  "eval-0259": {
    merge: [
      {
        actionType: "return_to_hand",
        evidenceContains: "returns a nonland permanent",
        cardFace: "back",
      },
      { actionType: "discard", evidenceContains: "discards a card", cardFace: "back" },
    ],
  },
  "eval-0261": {
    replace: [
      {
        actionType: "return_to_hand",
        evidenceContains: "Return target card that has an Adventure from your graveyard to your hand",
      },
      {
        actionType: "sacrifice",
        evidenceContains: "Sacrifice this land: Return target card that has an Adventure from your graveyard to your hand",
      },
    ],
  },
  "eval-0277": {
    replace: [
      {
        actionType: "destroy",
        evidenceContains: "Destroy",
        cardFace: "front",
      },
    ],
  },
  "eval-0049": {
    replace: [
      { actionType: "sacrifice", evidenceContains: "sacrifices" },
      { actionType: "discard", evidenceContains: "discards" },
      {
        actionType: "return_to_battlefield",
        evidenceContains: "from a graveyard onto the battlefield",
        sourceZone: "graveyard",
        destinationZone: "battlefield",
      },
    ],
  },
};

function applyPatch(c: CatalogEvalCase): CatalogEvalCase | null {
  const patch = GOLD_PATCHES[c.id];
  if (!patch) return null;

  let expectedPrimitiveActions = patch.replace
    ? [...patch.replace]
    : [...c.expectedPrimitiveActions.filter((g) => !g.negative)];

  if (patch.merge) {
    for (const add of patch.merge) {
      const exists = expectedPrimitiveActions.some(
        (g) => g.actionType === add.actionType && g.evidenceContains === add.evidenceContains,
      );
      if (!exists) expectedPrimitiveActions.push(add);
    }
  }

  const primitives = expectedPrimitiveActions.map((p) => p.actionType as PrimitiveActionType);

  return {
    ...c,
    expectedPrimitiveActions,
    expectedRoles: inferDerivedRoles(primitives).map((role) => ({
      role,
      fromPrimitiveActions: [...new Set(primitives)],
    })),
    evaluationSetVersion: "development-v25-precision-pass-gold",
    taxonomyVersion: "three-layer-v1.3",
    goldReviewedAt: "2026-08-07T14:00:00.000Z",
    goldReviewer: "precision-pass-v25",
    goldCompleter: "precision-pass-v25",
    goldCompletedAt: "2026-08-07T14:00:00.000Z",
    goldReviewStatus: "reviewed" as const,
    goldCompletenessStatus: "complete" as const,
    layer2GoldAuditNote: "v1.19 precision-pass gold corrections — no parser-driven label changes.",
  };
}

async function main() {
  const v24Path = resolve(process.cwd(), "data/oracle-action-eval-development-v24.json");
  const v24 = JSON.parse(readFileSync(v24Path, "utf8")) as EvalDatasetEnvelope & {
    cases: CatalogEvalCase[];
    contentHash: string;
  };

  if (v24.contentHash !== V24_HASH) {
    throw new Error(`Expected v24 hash ${V24_HASH}, got ${v24.contentHash}`);
  }

  const changedCaseIds: string[] = [];
  const cases = v24.cases.map((c) => {
    const updated = applyPatch(c);
    if (updated) {
      changedCaseIds.push(c.id);
      return updated;
    }
    return c;
  });

  const envelope: EvalDatasetEnvelope & { cases: CatalogEvalCase[] } = {
    ...v24,
    cases,
    evaluationSetVersion: "development-v25-precision-pass-gold",
    taxonomyVersion: "three-layer-v1.3",
    parentContentHash: V24_HASH,
    parentClassification: "development_set_v24",
    contentHash: computeDatasetContentHash(cases),
    generatedAt: new Date().toISOString(),
    goldPatchNote:
      "v25 corrects gold defects and completes partial labels identified in v1.19 FP audit — not parser tuning.",
  };

  const outPath = resolve(process.cwd(), "data/oracle-action-eval-development-v25.json");
  writeFileSync(outPath, `${JSON.stringify(envelope, null, 2)}\n`, "utf8");

  console.log(`Wrote ${outPath}`);
  console.log(`Changed ${changedCaseIds.length} cases:`, changedCaseIds.join(", "));
  console.log(`contentHash: ${envelope.contentHash}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
