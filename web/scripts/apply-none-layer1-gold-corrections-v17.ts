/**
 * Apply none/Layer1 audit gold corrections → development_set_v17.
 * Run: npx tsx scripts/apply-none-layer1-gold-corrections-v17.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvLocal } from "./lib/script-env";
import {
  computeDatasetContentHash,
  type CatalogEvalCase,
  type EvalDatasetEnvelope,
} from "./lib/eval-provenance-guard";
import { evidenceMatchesOracle } from "./oracle-action-eval-shared";
import { TAXONOMY_VERSION } from "./oracle-action-eval-shared";
import { inferDerivedRoles } from "../src/lib/deck-builder/golden-catalog/oracle-action-taxonomy";

loadEnvLocal();

const CORRECTOR = "none-layer1-gold-audit-v1";

type GoldAddition = {
  actionType: string;
  evidenceContains: string;
  cardFace?: "front" | "back";
  optionalEffect?: boolean;
  optional?: boolean;
};

/** Manually verified Layer 2 gold additions from none/Layer1 FP audit. */
const GOLD_ADDITIONS: Record<string, GoldAddition[]> = {
  "dev-cond-001": [
    { actionType: "add_mana", evidenceContains: "Add {B}" },
    { actionType: "add_mana", evidenceContains: "Add {W}" },
  ],
  "dev-cond-007": [{ actionType: "draw", evidenceContains: "draw a card", optionalEffect: true }],
  "dev-opt-002": [{ actionType: "add_mana", evidenceContains: "Add {G}" }],
  "dev-opt-009": [{ actionType: "draw", evidenceContains: "Draw a card" }],
  "dev-opt-016": [{ actionType: "add_mana", evidenceContains: "Add {C}{C}" }],
  "dev-opt-017": [{ actionType: "exile", evidenceContains: "exile all graveyards" }],
  "dev-opt-039": [{ actionType: "draw", evidenceContains: "Draw a card" }],
  "dev-v9-001": [{ actionType: "add_mana", evidenceContains: "Add one mana of any color" }],
  "dev-v9-024": [{ actionType: "exile", evidenceContains: "Exile target card from a graveyard" }],
  "dev-v9-031": [{ actionType: "exile", evidenceContains: "exile all graveyards" }],
  "eval-0031": [{ actionType: "exile", evidenceContains: "exile all graveyards" }],
  "eval-0041": [{ actionType: "draw", evidenceContains: "Draw a card for each creature destroyed" }],
  "eval-0042": [{ actionType: "draw", evidenceContains: "draws two cards" }],
  "eval-0047": [{ actionType: "draw", evidenceContains: "you may draw a card", optionalEffect: true }],
  "eval-0052": [
    { actionType: "add_mana", evidenceContains: "Add {C}", cardFace: "front" },
    { actionType: "exile", evidenceContains: "exile a creature card from your graveyard", cardFace: "back", optionalEffect: true },
  ],
  "eval-0053": [{ actionType: "draw", evidenceContains: "Draw three cards" }],
  "eval-0055": [
    { actionType: "draw", evidenceContains: "Draw two cards" },
    { actionType: "create_token", evidenceContains: "Create a 3/3 green Elk creature token" },
    { actionType: "create_token", evidenceContains: "create a token that's a copy" },
  ],
  "eval-0059": [{ actionType: "draw", evidenceContains: "draw that many cards", optionalEffect: true }],
  "eval-0082": [
    { actionType: "add_mana", evidenceContains: "Add {C}" },
    { actionType: "add_mana", evidenceContains: "Add one mana of any of the exiled cards' colors" },
  ],
  "eval-0092": [{ actionType: "draw", evidenceContains: "draws two cards" }],
  "eval-0093": [{ actionType: "create_token", evidenceContains: "create a Gold token" }],
  "eval-0099": [{ actionType: "draw", evidenceContains: "draw a card", optionalEffect: true }],
  "eval-0112": [{ actionType: "exile", evidenceContains: "exile target creature", optionalEffect: true }],
  "eval-0113": [
    { actionType: "create_token", evidenceContains: "create two 2/2 red Human Knight creature tokens" },
    { actionType: "draw", evidenceContains: "draw a card" },
  ],
  "eval-0115": [{ actionType: "draw", evidenceContains: "Draw a card for each time Spell Contortion was kicked" }],
  "eval-0129": [{ actionType: "create_token", evidenceContains: "create a black Vampire creature token" }],
  "eval-0131": [{ actionType: "exile", evidenceContains: "Exile target card from a graveyard" }],
  "eval-0142": [{ actionType: "draw", evidenceContains: "Draw two cards" }],
  "eval-0145": [
    { actionType: "create_token", evidenceContains: "create a Food token" },
    { actionType: "draw", evidenceContains: "draw a card", optionalEffect: false },
  ],
  "eval-0149": [{ actionType: "add_mana", evidenceContains: "Add {R}" }],
  "eval-0157": [{ actionType: "draw", evidenceContains: "draw a card" }],
  "eval-0158": [{ actionType: "create_token", evidenceContains: "Create a 1/1 red Devil creature token" }],
  "eval-0163": [{ actionType: "draw", evidenceContains: "draw that many cards" }],
  "eval-0168": [
    { actionType: "add_mana", evidenceContains: "Add {G}", cardFace: "front" },
    { actionType: "add_mana", evidenceContains: "Add {C}{C}", cardFace: "back" },
  ],
  "eval-0188": [{ actionType: "add_mana", evidenceContains: "Add {B}" }],
  "eval-0191": [{ actionType: "add_mana", evidenceContains: "Add one mana of any color" }],
  "eval-0192": [{ actionType: "draw", evidenceContains: "draw a card" }],
  "eval-0194": [{ actionType: "create_token", evidenceContains: "Create a Clue token" }],
  "eval-0196": [
    { actionType: "exile", evidenceContains: "exile the top card of your library face down" },
    { actionType: "exile", evidenceContains: "exile all cards from your hand face down", optionalEffect: true },
  ],
  "eval-0197": [{ actionType: "create_token", evidenceContains: "create a black Vampire creature token" }],
  "eval-0203": [{ actionType: "add_mana", evidenceContains: "Add {U}" }],
  "eval-0204": [
    { actionType: "create_token", evidenceContains: "create a 1/1 blue and red Otter creature token" },
    { actionType: "create_token", evidenceContains: "Whenever you cast an instant or sorcery spell, create a 1/1 blue and red Otter creature token" },
  ],
  "eval-0265": [
    { actionType: "create_token", evidenceContains: "create two 2/2 green Wolf creature tokens", cardFace: "front" },
    { actionType: "create_token", evidenceContains: "create two 2/2 green Wolf creature tokens", cardFace: "back" },
  ],
  "eval-0269": [{ actionType: "create_token", evidenceContains: "Create four 1/1 white Bird creature tokens", cardFace: "back" }],
  "eval-0285": [{ actionType: "create_token", evidenceContains: "Create a Clue token" }],
};

function corpusForFace(oracleText: string, cardFace?: "front" | "back"): string {
  if (!cardFace || !oracleText.includes("\n//\n")) return oracleText;
  return oracleText.split("\n//\n")[cardFace === "back" ? 1 : 0];
}

function mergeGold(
  existing: CatalogEvalCase["expectedPrimitiveActions"],
  additions: GoldAddition[],
  oracleText: string,
): CatalogEvalCase["expectedPrimitiveActions"] {
  const merged = [...existing];
  for (const add of additions) {
    const corpus = corpusForFace(oracleText, add.cardFace);
    if (!evidenceMatchesOracle(corpus, add.evidenceContains)) {
      throw new Error(`Evidence not in oracle: ${add.evidenceContains}`);
    }
    const dup = merged.some(
      (g) =>
        g.actionType === add.actionType &&
        g.evidenceContains === add.evidenceContains &&
        (g.cardFace ?? "front") === (add.cardFace ?? "front"),
    );
    if (dup) continue;
    merged.push({
      actionType: add.actionType as CatalogEvalCase["expectedPrimitiveActions"][number]["actionType"],
      evidenceContains: add.evidenceContains,
      ...(add.cardFace ? { cardFace: add.cardFace } : {}),
      ...(add.optionalEffect !== undefined ? { optionalEffect: add.optionalEffect } : {}),
      ...(add.optional !== undefined ? { optional: add.optional } : {}),
    });
  }
  return merged;
}

async function main() {
  const v16Path = resolve(process.cwd(), "data/oracle-action-eval-development-v16.json");
  const v16 = JSON.parse(readFileSync(v16Path, "utf8")) as EvalDatasetEnvelope & {
    cases: CatalogEvalCase[];
    contentHash: string;
  };

  const reviewedAt = new Date().toISOString();
  const changedCaseIds: string[] = [];

  const v17Cases = v16.cases.map((c) => {
    const additions = GOLD_ADDITIONS[c.id];
    if (!additions?.length) return c;

    const expectedPrimitiveActions = mergeGold(c.expectedPrimitiveActions, additions, c.oracleText);
    const primitives = expectedPrimitiveActions.filter((p) => !p.negative).map((p) => p.actionType);
    const roles = inferDerivedRoles(primitives);

    changedCaseIds.push(c.id);
    return {
      ...c,
      expectedPrimitiveActions,
      expectedRoles: roles.map((role) => ({
        role,
        fromPrimitiveActions: [...new Set(primitives)],
      })),
      evaluationSetVersion: "development-v17-layer2-gold-audit",
      goldReviewedAt: reviewedAt,
      goldReviewer: CORRECTOR,
      goldCompleter: CORRECTOR,
      goldCompletedAt: reviewedAt,
      goldReviewStatus: "reviewed" as const,
      goldCompletenessStatus: "complete" as const,
      layer2GoldAuditNote:
        "Layer 1 structure and Layer 2 primitives are complementary — audit added missing legitimate primitives",
    };
  });

  const v17Hash = computeDatasetContentHash(v17Cases);
  if (v17Hash === v16.contentHash) {
    console.log(JSON.stringify({ unchanged: true, hash: v17Hash }, null, 2));
    return;
  }

  const v17 = {
    ...v16,
    setClassification: "development_set_v17",
    evaluationSetVersion: "development-v17-layer2-gold-audit",
    contentHash: v17Hash,
    parentClassification: "development_set_v16",
    parentContentHash: v16.contentHash,
    parentSetPath: "data/oracle-action-eval-development-v16.json",
    frozenAt: reviewedAt,
    reviewer: CORRECTOR,
    reviewTimestamp: reviewedAt,
    goldLabelingPolicy: {
      ...(v16 as Record<string, unknown>).goldLabelingPolicy,
      layer1Layer2Complementarity:
        "Layer 1 ability structure and Layer 2 primitive actions are complementary, not mutually exclusive",
      staticCastPermissions:
        "Static cast/play permissions (You may cast from graveyard) = Layer 1 permission structure only",
      replacementEffects:
        "Replacement effects retain Layer 2 exile/etc. primitives alongside abilityType replacement",
      reminderText:
        "Parenthetical reminder text must not produce Layer 2 primitives unless it is the card's own oracle action",
    },
    noneLayer1GoldAudit: {
      correctedAt: reviewedAt,
      corrector: CORRECTOR,
      changedCaseCount: changedCaseIds.length,
      changedCaseIds,
      additionsByCase: GOLD_ADDITIONS,
    },
    cases: v17Cases,
  };

  writeFileSync(resolve(process.cwd(), "data/oracle-action-eval-development-v17.json"), JSON.stringify(v17, null, 2), "utf8");
  writeFileSync(
    resolve(process.cwd(), "data/oracle-action-eval-development-v17-diff.json"),
    JSON.stringify(
      {
        generatedAt: reviewedAt,
        parentDataset: "development_set_v16",
        parentContentHash: v16.contentHash,
        newDataset: "development_set_v17",
        newContentHash: v17Hash,
        changedCaseIds,
        policy: "none/Layer1 FP audit — add missing legitimate Layer 2 primitives",
      },
      null,
      2,
    ),
    "utf8",
  );

  const manifest = JSON.parse(
    readFileSync(resolve(process.cwd(), "data/oracle-action-eval-sets-manifest.json"), "utf8"),
  ) as Record<string, unknown>;
  manifest.developmentSet = {
    path: "data/oracle-action-eval-development-v17.json",
    classification: "development_set_v17",
    contentHash: v17Hash,
    caseCount: v17Cases.length,
    taxonomyVersion: TAXONOMY_VERSION,
    purpose: "Canonical development set — none/Layer1 gold audit Layer 2 corrections",
    parentClassification: "development_set_v16",
    parentContentHash: v16.contentHash,
    benchmarkStatus: "catalog_clean",
    usableForParserEvaluation: true,
  };
  writeFileSync(
    resolve(process.cwd(), "data/oracle-action-eval-sets-manifest.json"),
    JSON.stringify(manifest, null, 2),
    "utf8",
  );

  console.log(JSON.stringify({ v17Hash, changedCaseCount: changedCaseIds.length, changedCaseIds }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
