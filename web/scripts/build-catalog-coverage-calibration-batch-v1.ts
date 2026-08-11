/**
 * Select protocol-calibration batch from sealed sample v2 (no redraw).
 *
 * Run: cd web && npx tsx scripts/build-catalog-coverage-calibration-batch-v1.ts
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvLocal } from "./lib/script-env";
import { loadGoldenCatalogIndex, combinedGoldenOracleText } from "./lib/load-golden-catalog-index";
import { extractCatalogComplexityFeatures } from "./lib/catalog-complexity-bucket-v1";
import { MULTI_FACE_LAYOUTS } from "./lib/catalog-population-classifier-v1";

loadEnvLocal();

const OUT_DIR = "data/milestones/catalog-shadow";
const DEFAULT_SAMPLE_PATH = `${OUT_DIR}/catalog-coverage-sample-v2.json`;
const DEFAULT_OUT_PATH = `${OUT_DIR}/catalog-coverage-calibration-batch-v1.json`;
const DEFAULT_CALIBRATION_SEED = "catalog-coverage-calibration-batch-seed-v1";
const TARGET_SIZE = 35;

function argValue(prefix: string): string | undefined {
  return process.argv.find((a) => a.startsWith(`${prefix}=`))?.split("=").slice(1).join("=");
}

type SampleCard = {
  oracleId: string;
  oracleTextHash: string;
  cardStructureHash: string;
  canonicalName: string;
  layout?: string;
  populationCategory: string;
  complexityBucket: string;
};

type CalibrationTag =
  | "blank_text"
  | "simple"
  | "normal"
  | "complex"
  | "pathological"
  | "multi_face"
  | "granted"
  | "replacement"
  | "modal"
  | "saga_planeswalker";

const TAG_QUOTAS: Partial<Record<CalibrationTag, number>> = {
  blank_text: 4,
  simple: 4,
  normal: 4,
  complex: 4,
  pathological: 3,
  multi_face: 4,
  granted: 3,
  replacement: 3,
  modal: 3,
  saga_planeswalker: 3,
};

function seededRank(seed: string, oracleId: string): number {
  const digest = createHash("sha256").update(`${seed}:${oracleId}`).digest();
  return digest.readUInt32BE(0);
}

function tagCard(
  card: SampleCard,
  oracleText: string,
  faceCount: number,
): CalibrationTag[] {
  const tags: CalibrationTag[] = [];
  const features = extractCatalogComplexityFeatures({ oracleText, layout: card.layout });

  if (card.populationCategory === "C") tags.push("blank_text");
  tags.push(card.complexityBucket as CalibrationTag);

  const multiFace =
    (card.layout && MULTI_FACE_LAYOUTS.has(card.layout)) ||
    features.multiFaceLayout ||
    oracleText.includes("//") ||
    faceCount > 1;
  if (multiFace) tags.push("multi_face");

  if (features.grantedAbilityWording || /(?:have|has|gain|gains|gets?) "[^"]+"/i.test(oracleText)) {
    tags.push("granted");
  }
  if (features.replacementWording) tags.push("replacement");
  if (features.modalSyntax) tags.push("modal");
  if (features.sagaOrPlaneswalker || card.layout === "saga") tags.push("saga_planeswalker");

  return [...new Set(tags)];
}

async function main() {
  const samplePath = argValue("--sample") ?? DEFAULT_SAMPLE_PATH;
  const outPath = resolve(argValue("--out") ?? DEFAULT_OUT_PATH);
  const calibrationSeed = argValue("--seed") ?? DEFAULT_CALIBRATION_SEED;
  const sampleVersion = samplePath.includes("sample-v3") ? "catalog-coverage-calibration-batch-v2" : "catalog-coverage-calibration-batch-v1";

  const sample = JSON.parse(readFileSync(resolve(samplePath), "utf8")) as {
    sampleIdentityHash: string;
    populationHash: string;
    cards: SampleCard[];
  };

  const index = await loadGoldenCatalogIndex();
  const enriched = sample.cards.map((card) => {
    const catalog = index.byOracleId.get(card.oracleId);
    if (!catalog) throw new Error(`Missing catalog record: ${card.oracleId}`);
    const oracleText = combinedGoldenOracleText(catalog);
    return {
      ...card,
      oracleText,
      typeLine: catalog.typeLine,
      cardFaces: catalog.cardFaces,
      tags: tagCard(card, oracleText, catalog.cardFaces?.length ?? 0),
    };
  });

  const selected = new Map<string, (typeof enriched)[number] & { selectionTags: CalibrationTag[] }>();

  // Prefer cards that satisfy multiple calibration tags; fill mandatory semantic families first.
  const mandatoryTags: CalibrationTag[] = [
    "blank_text",
    "granted",
    "replacement",
    "modal",
    "saga_planeswalker",
    "multi_face",
    "pathological",
  ];
  for (const tag of mandatoryTags) {
    const quota = TAG_QUOTAS[tag] ?? 0;
    if (quota <= 0) continue;
    const pool = enriched
      .filter((c) => c.tags.includes(tag) && !selected.has(c.oracleId))
      .sort((a, b) => seededRank(calibrationSeed, a.oracleId) - seededRank(calibrationSeed, b.oracleId));
    for (const card of pool.slice(0, quota)) {
      const existing = selected.get(card.oracleId);
      if (existing) existing.selectionTags.push(tag);
      else selected.set(card.oracleId, { ...card, selectionTags: [tag] });
    }
  }

  for (const [tag, quota] of Object.entries(TAG_QUOTAS) as Array<[CalibrationTag, number]>) {
    if (mandatoryTags.includes(tag)) continue;
    const pool = enriched
      .filter((c) => c.tags.includes(tag) && !selected.has(c.oracleId))
      .sort((a, b) => seededRank(calibrationSeed, a.oracleId) - seededRank(calibrationSeed, b.oracleId));
    for (const card of pool.slice(0, quota)) {
      selected.set(card.oracleId, { ...card, selectionTags: [tag] });
    }
  }

  // Fill to TARGET_SIZE from remaining sample cards if tag quotas under-fill.
  if (selected.size < TARGET_SIZE) {
    const remainder = enriched
      .filter((c) => !selected.has(c.oracleId))
      .sort((a, b) => seededRank(`${calibrationSeed}:fill`, a.oracleId) - seededRank(`${calibrationSeed}:fill`, b.oracleId));
    for (const card of remainder) {
      if (selected.size >= TARGET_SIZE) break;
      selected.set(card.oracleId, { ...card, selectionTags: card.tags.slice(0, 2) });
    }
  }

  const batch = [...selected.values()]
    .map((c) => ({
      oracleId: c.oracleId,
      canonicalName: c.canonicalName,
      oracleTextHash: c.oracleTextHash,
      cardStructureHash: c.cardStructureHash,
      layout: c.layout,
      typeLine: c.typeLine,
      populationCategory: c.populationCategory,
      complexityBucket: c.complexityBucket,
      selectionTags: c.selectionTags,
      allMatchingTags: c.tags,
      cardFaces: c.cardFaces,
      oracleText: c.oracleText,
      officialRulingsConsulted: false,
      adjudicationSlots: {
        primaryA: { status: "pending", adjudicatorId: null },
        primaryB: { status: "pending", adjudicatorId: null },
      },
    }))
    .sort((a, b) => a.oracleId.localeCompare(b.oracleId));

  const batchIdentityHash = createHash("sha256")
    .update(batch.map((c) => `${c.oracleId}|${c.cardStructureHash}`).join("\n"))
    .digest("hex");

  const tagCoverage = Object.fromEntries(
    Object.keys(TAG_QUOTAS).map((tag) => [
      tag,
      batch.filter((c) => c.allMatchingTags.includes(tag as CalibrationTag)).length,
    ]),
  );

  const artifact = {
    artifactType: "CatalogCoverageCalibrationBatch",
    version: sampleVersion,
    status: samplePath.includes("sample-v3") ? "SEALED_FROM_SAMPLE_V3" : "SEALED_FROM_SAMPLE_V2",
    purpose: "Protocol calibration only — do not redraw or replace cards.",
    sealedAt: new Date().toISOString(),
    calibrationSeed,
    samplePath: samplePath.replace(/\\/g, "/"),
    sampleIdentityHash: sample.sampleIdentityHash,
    populationHash: sample.populationHash,
    batchSize: batch.length,
    batchIdentityHash,
    tagQuotas: TAG_QUOTAS,
    tagCoverage,
    cards: batch,
    disagreementResolutionRequired: true,
    versionsToFreezeAfterCalibration: {
      annotationProtocolVersion: "catalog-coverage-annotation-protocol-v1",
      wholeCardRubricVersion: "catalog-coverage-whole-card-rubric-v1",
      semanticGoldSchemaVersion: "catalog-coverage-semantic-gold-schema-v1",
    },
  };

  mkdirSync(resolve(OUT_DIR), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(artifact, null, 2)}\n`);

  console.log(
    JSON.stringify(
      {
        outPath,
        batchSize: batch.length,
        batchIdentityHash,
        tagCoverage,
        categoryCInBatch: batch.filter((c) => c.populationCategory === "C").length,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
