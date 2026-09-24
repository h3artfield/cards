/**
 * Load catalogOracleCards from Firestore into lookup indexes for eval identity audit.
 */
import { createHash } from "node:crypto";
import { COLLECTIONS } from "../../src/lib/firebase/collections";
import type { CardFace, GoldenCatalogOracleCard } from "../../src/lib/deck-builder/golden-catalog/schemas";
import { normalizeOracleName } from "../../src/lib/deck-builder/golden-catalog/normalize-name";
import { registerCatalogNameAliases } from "../../src/lib/commander-strategy/resolve-catalog-card-by-name";
import { requireLocalFirestore, withFirestoreScriptTimeout } from "./firestore-fail-fast";

export function normalizeOracleTextForCompare(text: string | undefined): string {
  return (text ?? "").replace(/\r\n/g, "\n").trim();
}

export function goldenOracleTextHash(text: string | undefined): string {
  return createHash("sha256").update(normalizeOracleTextForCompare(text)).digest("hex");
}

export interface GoldenCatalogIndex {
  byOracleId: Map<string, GoldenCatalogOracleCard>;
  byNormalizedName: Map<string, GoldenCatalogOracleCard[]>;
  byOracleTextHash: Map<string, GoldenCatalogOracleCard[]>;
  catalogVersion: string;
  loadedAt: string;
  cardCount: number;
}

function indexOracleText(card: GoldenCatalogOracleCard, byOracleTextHash: Map<string, GoldenCatalogOracleCard[]>): void {
  const hash = goldenOracleTextHash(card.oracleText);
  const bucket = byOracleTextHash.get(hash) ?? [];
  bucket.push(card);
  byOracleTextHash.set(hash, bucket);
}

export async function loadGoldenCatalogIndex(): Promise<GoldenCatalogIndex> {
  const { ensureFirebaseAdmin, requireFirestore, isAdminConfigured } =
    await import("../../src/lib/firebase/admin");

  if (!ensureFirebaseAdmin().initialized || !isAdminConfigured()) {
    throw new Error("Firestore required. Run npm run firestore:health.");
  }

  const db = await requireLocalFirestore("catalogOracleCards load", () =>
    Promise.resolve(requireFirestore()),
  );

  const snap = await withFirestoreScriptTimeout(
    "catalogOracleCards get",
    () => db.collection(COLLECTIONS.catalogOracleCards).get(),
    120_000,
  );

  const byOracleId = new Map<string, GoldenCatalogOracleCard>();
  const byNormalizedName = new Map<string, GoldenCatalogOracleCard[]>();
  const byOracleTextHash = new Map<string, GoldenCatalogOracleCard[]>();
  let catalogVersion = "unknown";

  for (const doc of snap.docs) {
    const card = doc.data() as GoldenCatalogOracleCard;
    if (!card.oracleId) continue;
    byOracleId.set(card.oracleId, card);

    registerCatalogNameAliases(card, byNormalizedName);

    const hash = goldenOracleTextHash(card.oracleText);
    const textBucket = byOracleTextHash.get(hash) ?? [];
    textBucket.push(card);
    byOracleTextHash.set(hash, textBucket);

    if (card.sourceVersion && catalogVersion === "unknown") {
      catalogVersion = card.sourceVersion;
    }
  }

  return {
    byOracleId,
    byNormalizedName,
    byOracleTextHash,
    catalogVersion,
    loadedAt: new Date().toISOString(),
    cardCount: byOracleId.size,
  };
}

export function lookupGoldenByName(
  index: GoldenCatalogIndex,
  name: string,
): GoldenCatalogOracleCard | null {
  const matches = index.byNormalizedName.get(normalizeOracleName(name));
  if (!matches?.length) return null;
  if (matches.length === 1) return matches[0];
  const exact = matches.find((c) => c.canonicalName === name);
  return exact ?? matches[0];
}

export function goldenFaceRecords(card: GoldenCatalogOracleCard): Array<{
  faceId: string;
  faceName: string;
  faceIndex: number;
  oracleText?: string;
}> {
  if (!card.cardFaces?.length) {
    return [{ faceId: "front", faceName: card.canonicalName, faceIndex: 0, oracleText: card.oracleText }];
  }
  return card.cardFaces.map((face, faceIndex) => ({
    faceId: faceIndex === 0 ? "front" : faceIndex === 1 ? "back" : `face-${faceIndex}`,
    faceName: face.name ?? card.canonicalName,
    faceIndex,
    oracleText: face.oracleText,
  }));
}

export function combinedGoldenOracleText(card: GoldenCatalogOracleCard): string {
  if (!card.cardFaces?.length) return normalizeOracleTextForCompare(card.oracleText);
  const parts = card.cardFaces
    .map((f) => normalizeOracleTextForCompare(f.oracleText))
    .filter(Boolean);
  return parts.join("\n//\n");
}

export function goldenColorIdentity(card: GoldenCatalogOracleCard): string[] {
  return [...(card.colorIdentity ?? [])].sort();
}

export function findCardsWithOracleText(
  index: GoldenCatalogIndex,
  text: string,
): GoldenCatalogOracleCard[] {
  const hash = goldenOracleTextHash(text);
  return index.byOracleTextHash.get(hash) ?? [];
}

export function faceOracleTextForSide(card: GoldenCatalogOracleCard, face?: string): string | undefined {
  const faces = goldenFaceRecords(card);
  if (!face || face === "front") return faces[0]?.oracleText;
  if (face === "back") return faces[1]?.oracleText ?? faces[faces.length - 1]?.oracleText;
  const idx = Number.parseInt(face.replace(/^face-/, ""), 10);
  if (!Number.isNaN(idx)) return faces[idx]?.oracleText;
  return undefined;
}

export type { CardFace, GoldenCatalogOracleCard };
