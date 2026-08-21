/**
 * Extract the existing RC8 117-d Oracle semantic space into a local snapshot.
 * Does not call OpenAI. Does not write Firestore. Does not replace the embedding model.
 *
 * Run: cd web && npx tsx scripts/mechanical-space/extract-semantic-oracle-snapshot-v1.ts
 */
import { createHash } from "node:crypto";
import { createReadStream, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import readline from "node:readline";
import { createGunzip } from "node:zlib";
import type { CatalogShadowParseRecord } from "../lib/catalog-shadow-parse-record-v1";
import { FEATURE_NAMES } from "../../src/lib/semantic-visualization/feature-spec-v1";
import { DERIVED_ROLE_NAMES } from "../../src/lib/semantic-visualization/derived-features-v1";
import { buildCardFeatureBundle } from "../../src/lib/semantic-visualization/feature-vector-v1";
import { loadSemanticMapManifest, loadSemanticMapPoints } from "../../src/lib/semantic-visualization/artifact-loader";
import { SEMANTIC_MAP_ARTIFACTS, semanticMapArtifactPath } from "../../src/lib/semantic-visualization/artifact-paths";
import { assertFiniteVector, checksumOracleVectors, sha256Hex } from "../../src/lib/mechanical-space/checksum";
import { mechanicalSpacePath } from "../../src/lib/mechanical-space/artifact-paths";
import { goldenCardFromSemanticPoint } from "../../src/lib/mechanical-space/snapshot-card";
import { assertMechanicalSpaceReadOnly } from "../../src/lib/mechanical-space/safety";
import type { SemanticOracleSnapshotManifest } from "../../src/lib/mechanical-space/types";

assertMechanicalSpaceReadOnly("extract-semantic-oracle-snapshot-v1");

const OUT_DIR = mechanicalSpacePath("semantic-oracle-snapshot-v1");
const DIMENSIONS = FEATURE_NAMES.length + DERIVED_ROLE_NAMES.length;

async function loadShadowByOracleId(): Promise<Map<string, CatalogShadowParseRecord>> {
  const manifest = JSON.parse(readFileSync(semanticMapArtifactPath("shadowManifest"), "utf8")) as {
    artifactPath: string;
    contentHash?: string;
  };
  const artifactPath = resolve(manifest.artifactPath);
  const input = createReadStream(artifactPath).pipe(createGunzip());
  const rl = readline.createInterface({ input, crlfDelay: Infinity });
  const map = new Map<string, CatalogShadowParseRecord>();
  for await (const line of rl) {
    if (!line.trim()) continue;
    const row = JSON.parse(line) as CatalogShadowParseRecord;
    map.set(row.oracleId, row);
  }
  return map;
}

function oracleTextFromShadow(shadow: CatalogShadowParseRecord): string | undefined {
  const texts = shadow.semantic.abilities
    .map((a) => a.abilitySpan?.text)
    .filter((t): t is string => Boolean(t && t.trim()));
  return texts.length ? texts.join("\n") : undefined;
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const vizManifest = loadSemanticMapManifest();
  const points = loadSemanticMapPoints();
  const shadows = await loadShadowByOracleId();

  const matched: Array<{ oracleId: string; name: string; typeLine: string; oracleText?: string; vector: number[] }> = [];
  const missingEmbeddings: string[] = [];
  const invalidDimensions: string[] = [];
  const nonFinite: string[] = [];
  const zeroVectors: string[] = [];
  const duplicateOracleIds: string[] = [];
  const seen = new Set<string>();

  for (const point of points) {
    if (seen.has(point.oracleId)) {
      duplicateOracleIds.push(point.oracleId);
      continue;
    }
    seen.add(point.oracleId);
    const shadow = shadows.get(point.oracleId);
    if (!shadow) {
      missingEmbeddings.push(point.oracleId);
      continue;
    }
    const bundle = buildCardFeatureBundle({
      shadow,
      card: goldenCardFromSemanticPoint(point),
    });
    const vector = bundle.combinedVector;
    if (vector.length !== DIMENSIONS) {
      invalidDimensions.push(point.oracleId);
      continue;
    }
    const finite = assertFiniteVector(vector, point.oracleId);
    if (!finite.ok) {
      if (finite.reason.startsWith("zero")) zeroVectors.push(point.oracleId);
      else nonFinite.push(point.oracleId);
      continue;
    }
    matched.push({
      oracleId: point.oracleId,
      name: point.name,
      typeLine: point.typeLine,
      oracleText: oracleTextFromShadow(shadow),
      vector,
    });
  }

  matched.sort((a, b) => a.oracleId.localeCompare(b.oracleId));

  const vectors = new Float32Array(matched.length * DIMENSIONS);
  const indexLines: string[] = [];
  for (let i = 0; i < matched.length; i++) {
    const row = matched[i];
    vectors.set(row.vector, i * DIMENSIONS);
    indexLines.push(
      JSON.stringify({
        i,
        oracleId: row.oracleId,
        name: row.name,
        typeLine: row.typeLine,
        oracleText: row.oracleText,
      }),
    );
  }

  const vectorsPath = resolve(OUT_DIR, "vectors.f32");
  const indexPath = resolve(OUT_DIR, "index.jsonl");
  const validationPath = resolve(OUT_DIR, "validation.json");
  const manifestPath = resolve(OUT_DIR, "manifest.json");

  writeFileSync(vectorsPath, Buffer.from(vectors.buffer, vectors.byteOffset, vectors.byteLength));
  writeFileSync(indexPath, `${indexLines.join("\n")}\n`);

  const checksum = checksumOracleVectors(matched);
  const shadowHash =
    vizManifest.shadowParseContentHash ??
    sha256Hex(readFileSync(semanticMapArtifactPath("shadowManifest")));

  const validation = {
    version: "semantic-oracle-snapshot-v1",
    oracleRecords: points.length,
    shadowRecords: shadows.size,
    vectorCount: matched.length,
    matchedByOracleId: matched.length,
    missingEmbeddings: missingEmbeddings.length,
    duplicateOracleIds: duplicateOracleIds.length,
    invalidVectorDimensions: invalidDimensions.length,
    nonFinite: nonFinite.length,
    zeroVectors: zeroVectors.length,
    dimensions: DIMENSIONS,
    literalDimensions: FEATURE_NAMES.length,
    derivedDimensions: DERIVED_ROLE_NAMES.length,
    model: vizManifest.embeddingVersion,
    expectedPopulation: vizManifest.populationCount,
    examples: {
      missingEmbeddings: missingEmbeddings.slice(0, 8),
      duplicateOracleIds: duplicateOracleIds.slice(0, 8),
      invalidDimensions: invalidDimensions.slice(0, 8),
      nonFinite: nonFinite.slice(0, 8),
      zeroVectors: zeroVectors.slice(0, 8),
    },
    checksum,
  };
  writeFileSync(validationPath, `${JSON.stringify(validation, null, 2)}\n`);

  const manifest: SemanticOracleSnapshotManifest = {
    artifactType: "SemanticOracleSnapshot",
    version: "semantic-oracle-snapshot-v1",
    createdAt: new Date().toISOString(),
    cardCount: points.length,
    vectorCount: matched.length,
    dimensions: DIMENSIONS,
    model: vizManifest.embeddingVersion,
    embeddingVersion: vizManifest.embeddingVersion,
    parserVersion: vizManifest.parserVersion,
    shadowParseContentHash: shadowHash,
    visualizationManifestHash: sha256Hex(readFileSync(semanticMapArtifactPath("manifest"))),
    checksum,
    vectorsPath,
    indexPath,
    validationPath,
    notes: [
      "Vectors are the existing RC8 combined feature space (literal + derived), not a new neural embedding.",
      "Recomputed deterministically from frozen shadow parse + frozen visualization point metadata.",
      `Source visualization: ${SEMANTIC_MAP_ARTIFACTS.manifest}`,
      "No OpenAI calls. No Firestore writes.",
    ],
  };
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  const vectorsHash = createHash("sha256").update(Buffer.from(vectors.buffer, vectors.byteOffset, vectors.byteLength)).digest("hex");
  console.log(JSON.stringify({ manifest, validation, vectorsSha256: vectorsHash }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
