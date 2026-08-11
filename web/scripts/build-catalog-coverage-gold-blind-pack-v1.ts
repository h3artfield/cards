/**
 * Build parser-blind adjudication packs for catalog coverage gold.
 *
 * Run:
 *   cd web && npx tsx scripts/build-catalog-coverage-gold-blind-pack-v1.ts --batch=calibration
 *   cd web && npx tsx scripts/build-catalog-coverage-gold-blind-pack-v1.ts --batch=full
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvLocal } from "./lib/script-env";
import { goldenFaceRecords } from "./lib/load-golden-catalog-index";
import {
  CATALOG_COVERAGE_SEMANTIC_GOLD_SCHEMA_VERSION,
  CATALOG_COVERAGE_WHOLE_CARD_RUBRIC_VERSION,
} from "./lib/catalog-coverage-semantic-gold-schema-v1";

loadEnvLocal();

const OUT_DIR = "data/milestones/catalog-shadow";

type BlindCardInput = {
  oracleId: string;
  canonicalName: string;
  oracleTextHash: string;
  cardStructureHash: string;
  layout?: string;
  typeLine?: string;
  populationCategory: string;
  complexityBucket: string;
  oracleText: string;
  cardFaces?: Array<{
    name?: string;
    typeLine?: string;
    oracleText?: string;
    manaCost?: string;
    power?: string;
    toughness?: string;
    loyalty?: string;
  }>;
};

function argValue(prefix: string): string | undefined {
  return process.argv.find((a) => a.startsWith(`${prefix}=`))?.split("=").slice(1).join("=");
}

function buildBlindCard(card: BlindCardInput) {
  const faces =
    card.cardFaces?.length ?
      card.cardFaces.map((face, idx) => ({
        faceIndex: idx,
        faceId: idx === 0 ? "front" : idx === 1 ? "back" : `face-${idx}`,
        name: face.name ?? card.canonicalName,
        typeLine: face.typeLine ?? card.typeLine ?? "",
        oracleText: face.oracleText ?? "",
        manaCost: face.manaCost,
        power: face.power,
        toughness: face.toughness,
        loyalty: face.loyalty,
      }))
    : goldenFaceRecords({
        oracleId: card.oracleId,
        canonicalName: card.canonicalName,
        oracleText: card.oracleText,
        typeLine: card.typeLine ?? "",
      } as never).map((f) => ({
        faceIndex: f.faceIndex,
        faceId: f.faceId,
        name: f.faceName,
        typeLine: card.typeLine ?? "",
        oracleText: f.oracleText ?? "",
      }));

  const blankText = card.populationCategory === "C" || card.oracleText.trim().length === 0;

  return {
    oracleId: card.oracleId,
    canonicalName: card.canonicalName,
    cardStructureHash: card.cardStructureHash,
    oracleTextHash: card.oracleTextHash,
    layout: card.layout,
    typeLine: card.typeLine,
    populationCategory: card.populationCategory,
    complexityBucket: card.complexityBucket,
    parserBlind: true,
    forbiddenInputs: [
      "RC8 semantic AST",
      "accepted actions",
      "needs_review",
      "diagnostics",
      "structural-invalid status",
      "shadow outputs",
      "prior benchmark history",
    ],
    allowedInputs: [
      "card identity",
      "complete oracle/card-face structure",
      "taxonomy instructions",
      "official rulings when genuinely needed",
    ],
    canonicalStructure: {
      combinedOracleText: card.oracleText,
      faces,
    },
    blankTextGuidance: blankText
      ? {
          legitimateCard: true,
          oracleRulesTextEmpty: true,
          expectedCardNativeL2Actions: [],
          note: "Zero Layer-2 actions is the correct answer. Do NOT score as abstained/unknown/failed.",
        }
      : undefined,
    semanticGoldTemplate: {
      schemaVersion: CATALOG_COVERAGE_SEMANTIC_GOLD_SCHEMA_VERSION,
      legitimateCard: true,
      oracleRulesTextEmpty: blankText,
      expectedCardNativeL2Actions: [],
      abilities: [],
      officialRulingsConsulted: false,
      rulingReferences: [],
    },
    adjudication: {
      primary: { status: "pending", adjudicatorId: null, semanticGold: null },
      secondary: { status: "pending", adjudicatorId: null, semanticGold: null, required: false },
      disagreement: null,
      finalSemanticGold: null,
    },
  };
}

function main() {
  const batch = argValue("--batch") ?? "calibration";
  const batchPath =
    argValue("--batch-path") ??
    (batch === "calibration"
      ? `${OUT_DIR}/catalog-coverage-calibration-batch-v2.json`
      : undefined);
  let cards: BlindCardInput[] = [];
  let envelope: Record<string, unknown> = {};

  if (batch === "calibration") {
    const cal = JSON.parse(readFileSync(resolve(batchPath!), "utf8")) as { cards: BlindCardInput[]; batchIdentityHash: string; sampleIdentityHash: string; populationHash: string };
    cards = cal.cards;
    envelope = {
      artifactType: "CatalogCoverageGoldBlindPack",
      version: "catalog-coverage-gold-blind-pack-v1",
      packKind: "protocol_calibration",
      batchIdentityHash: cal.batchIdentityHash,
      sampleIdentityHash: cal.sampleIdentityHash,
      populationHash: cal.populationHash,
    };
  } else if (batch === "full") {
    const sample = JSON.parse(readFileSync(resolve(OUT_DIR, "catalog-coverage-sample-v2.json"), "utf8")) as {
      cards: BlindCardInput[];
      sampleIdentityHash: string;
      populationHash: string;
    };
    // Full pack requires oracle text enrichment — load from calibration artifact pattern or batch file
    throw new Error(
      "Full blind pack requires async catalog load. Run init-catalog-coverage-gold-workspace-v1.ts instead.",
    );
  } else {
    throw new Error(`Unknown batch: ${batch}`);
  }

  const pack = {
    ...envelope,
    semanticGoldSchemaVersion: CATALOG_COVERAGE_SEMANTIC_GOLD_SCHEMA_VERSION,
    wholeCardRubricVersion: CATALOG_COVERAGE_WHOLE_CARD_RUBRIC_VERSION,
    generatedAt: new Date().toISOString(),
    cardCount: cards.length,
    cards: cards.map(buildBlindCard),
  };

  mkdirSync(resolve(OUT_DIR), { recursive: true });
  const outPath = resolve(OUT_DIR, `catalog-coverage-gold-blind-pack-${batch}-v1.json`);
  writeFileSync(outPath, `${JSON.stringify(pack, null, 2)}\n`);

  const runtimeOut = argValue("--runtime-out");
  if (runtimeOut) {
    writeFileSync(resolve(runtimeOut), `${JSON.stringify(pack, null, 2)}\n`);
  }

  console.log(JSON.stringify({ outPath, runtimeOut, cardCount: cards.length, packKind: pack.packKind }, null, 2));
}

main();
