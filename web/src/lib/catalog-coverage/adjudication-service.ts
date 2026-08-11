import calibrationBlindPack from "./calibration-blind-pack-v1.json";
import { COLLECTIONS } from "@/lib/firebase/collections";
import { forFirestore } from "@/lib/firebase/for-firestore";
import {
  CALIBRATION_ADJUDICATOR_QUORUM,
  CALIBRATION_BATCH_SIZE,
  CATALOG_COVERAGE_ANNOTATION_PROTOCOL_VERSION,
  CATALOG_COVERAGE_CALIBRATION_BATCH_HASH,
  CATALOG_COVERAGE_POPULATION_HASH,
  CATALOG_COVERAGE_SAMPLE_IDENTITY_HASH,
} from "./adjudication-config";
import type {
  AdjudicationPhase,
  AdjudicationSessionInfo,
  BlindPackCard,
  EnrichedAdjudicationCard,
  UiAdjudicationDraft,
} from "./adjudication-types";
import type { CatalogCoverageSemanticGoldCase } from "./semantic-gold-schema";
import { getActiveRulingsByOracleId } from "@/lib/deck-builder/golden-catalog/rulings-versions";

export const ADJUDICATION_COLLECTION = COLLECTIONS.catalogCoverageAdjudications;
export const ADJUDICATION_SESSION_COLLECTION = COLLECTIONS.catalogCoverageAdjudicationSessions;

type BlindPackFile = {
  cards: BlindPackCard[];
  batchIdentityHash?: string;
  sampleIdentityHash?: string;
  populationHash?: string;
};

type AdjudicationDoc = {
  adjudicatorId: string;
  oracleId: string;
  phase: AdjudicationPhase;
  samplePosition: number;
  sampleIdentityHash: string;
  populationHash: string;
  calibrationBatchHash: string;
  annotationProtocolVersion: string;
  cardStructureHash: string;
  oracleTextHash: string;
  status: "draft" | "submitted";
  uiDraft: UiAdjudicationDraft;
  semanticGold?: CatalogCoverageSemanticGoldCase;
  humanExplanation?: string;
  officialRulingsConsulted: boolean;
  startedAt: string;
  updatedAt: string;
  submittedAt?: string;
};

type SessionDoc = {
  adjudicatorId: string;
  displayName: string;
  phase: AdjudicationPhase;
  cardsTotal: number;
  cardsSubmitted: number;
  allSubmitted: boolean;
  sampleIdentityHash: string;
  populationHash: string;
  calibrationBatchHash: string;
  annotationProtocolVersion: string;
  createdAt: string;
  updatedAt: string;
};

function loadCalibrationPack(): BlindPackFile {
  const pack = calibrationBlindPack as BlindPackFile;
  if (pack.batchIdentityHash !== CATALOG_COVERAGE_CALIBRATION_BATCH_HASH) {
    throw new Error(
      `Calibration pack hash mismatch: expected ${CATALOG_COVERAGE_CALIBRATION_BATCH_HASH}, got ${pack.batchIdentityHash ?? "missing"}`,
    );
  }
  if (pack.cards.length !== CALIBRATION_BATCH_SIZE) {
    throw new Error(`Calibration pack must contain exactly ${CALIBRATION_BATCH_SIZE} cards`);
  }
  return pack;
}

export function slugifyAdjudicatorId(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!slug || slug.length < 2) {
    throw new Error("Adjudicator name must be at least 2 characters");
  }
  return slug.slice(0, 48);
}

async function getDb() {
  const { ensureFirebaseAdmin, requireFirestore, isAdminConfigured } = await import(
    "@/lib/firebase/admin"
  );
  if (!ensureFirebaseAdmin().initialized || !isAdminConfigured()) {
    throw new Error("Firestore is required for catalog coverage adjudication");
  }
  return requireFirestore();
}

function adjudicationDocId(adjudicatorId: string, oracleId: string): string {
  return `${adjudicatorId}__${oracleId}`;
}

export function getCalibrationCards(): BlindPackCard[] {
  const pack = loadCalibrationPack();
  return [...pack.cards].sort((a, b) => a.oracleId.localeCompare(b.oracleId));
}

async function readProtocolFrozen(): Promise<boolean> {
  return false;
}

async function enrichCard(card: BlindPackCard, samplePosition: number): Promise<EnrichedAdjudicationCard> {
  const db = await getDb();
  let manaCost: string | undefined;
  let imageUrl: string | undefined;

  const oracleSnap = await db.collection(COLLECTIONS.catalogOracleCards).doc(card.oracleId).get();
  if (oracleSnap.exists) {
    const oracle = oracleSnap.data() as { manaCost?: string; cardFaces?: Array<{ manaCost?: string }> };
    manaCost = oracle.manaCost ?? oracle.cardFaces?.[0]?.manaCost;
  }

  const printingSnap = await db
    .collection(COLLECTIONS.catalogCards)
    .where("oracleId", "==", card.oracleId)
    .limit(5)
    .get();

  for (const doc of printingSnap.docs) {
    const printing = doc.data() as { images?: { normal?: string } };
    if (printing.images?.normal) {
      imageUrl = printing.images.normal;
      break;
    }
  }

  if (!imageUrl && card.canonicalName) {
    imageUrl = `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(card.canonicalName)}&format=image&version=normal`;
  }

  let rulingsAvailable = false;
  try {
    const rulings = await getActiveRulingsByOracleId(db, card.oracleId, 1);
    rulingsAvailable = rulings.length > 0;
  } catch {
    rulingsAvailable = false;
  }

  return {
    ...card,
    samplePosition,
    manaCost: manaCost ?? card.canonicalStructure.faces[0]?.manaCost,
    imageUrl,
    rulingsAvailable,
  };
}

export async function getSessionInfo(adjudicatorId: string): Promise<AdjudicationSessionInfo | null> {
  const db = await getDb();
  const snap = await db.collection(ADJUDICATION_SESSION_COLLECTION).doc(adjudicatorId).get();
  if (!snap.exists) return null;
  const session = snap.data() as SessionDoc;
  const protocolFrozen = await readProtocolFrozen();
  const quorumReached = await calibrationQuorumReached();

  return {
    phase: session.phase,
    adjudicatorId: session.adjudicatorId,
    cardsTotal: session.cardsTotal,
    cardsSubmitted: session.cardsSubmitted,
    allSubmitted: session.allSubmitted,
    cardOracleIds: getCalibrationCards().map((c) => c.oracleId),
    sampleIdentityHash: session.sampleIdentityHash,
    populationHash: session.populationHash,
    calibrationBatchHash: session.calibrationBatchHash,
    annotationProtocolVersion: session.annotationProtocolVersion,
    protocolFrozen,
    quorumReached,
  };
}

export async function startSession(input: {
  displayName: string;
  adjudicatorId?: string;
}): Promise<AdjudicationSessionInfo> {
  const adjudicatorId = input.adjudicatorId ?? slugifyAdjudicatorId(input.displayName);
  const cards = getCalibrationCards();
  const now = new Date().toISOString();
  const session: SessionDoc = {
    adjudicatorId,
    displayName: input.displayName.trim(),
    phase: "calibration",
    cardsTotal: cards.length,
    cardsSubmitted: 0,
    allSubmitted: false,
    sampleIdentityHash: CATALOG_COVERAGE_SAMPLE_IDENTITY_HASH,
    populationHash: CATALOG_COVERAGE_POPULATION_HASH,
    calibrationBatchHash: CATALOG_COVERAGE_CALIBRATION_BATCH_HASH,
    annotationProtocolVersion: CATALOG_COVERAGE_ANNOTATION_PROTOCOL_VERSION,
    createdAt: now,
    updatedAt: now,
  };

  const db = await getDb();
  await db
    .collection(ADJUDICATION_SESSION_COLLECTION)
    .doc(adjudicatorId)
    .set(forFirestore(session), { merge: true });

  const protocolFrozen = await readProtocolFrozen();
  const quorumReached = await calibrationQuorumReached();

  return {
    phase: session.phase,
    adjudicatorId,
    cardsTotal: session.cardsTotal,
    cardsSubmitted: session.cardsSubmitted,
    allSubmitted: session.allSubmitted,
    cardOracleIds: cards.map((c) => c.oracleId),
    sampleIdentityHash: session.sampleIdentityHash,
    populationHash: session.populationHash,
    calibrationBatchHash: session.calibrationBatchHash,
    annotationProtocolVersion: session.annotationProtocolVersion,
    protocolFrozen,
    quorumReached,
  };
}

export async function getEnrichedCalibrationCard(
  oracleId: string,
): Promise<EnrichedAdjudicationCard | null> {
  const cards = getCalibrationCards();
  const idx = cards.findIndex((c) => c.oracleId === oracleId);
  if (idx < 0) return null;
  return enrichCard(cards[idx]!, idx + 1);
}

export async function loadAdjudicationDraft(
  adjudicatorId: string,
  oracleId: string,
): Promise<AdjudicationDoc | null> {
  const db = await getDb();
  const snap = await db
    .collection(ADJUDICATION_COLLECTION)
    .doc(adjudicationDocId(adjudicatorId, oracleId))
    .get();
  if (!snap.exists) return null;
  return snap.data() as AdjudicationDoc;
}

export async function saveAdjudicationDraft(input: {
  adjudicatorId: string;
  oracleId: string;
  samplePosition: number;
  card: BlindPackCard;
  uiDraft: UiAdjudicationDraft;
  semanticGold?: CatalogCoverageSemanticGoldCase;
  status: "draft" | "submitted";
}): Promise<void> {
  const db = await getDb();
  const now = new Date().toISOString();
  const existing = await loadAdjudicationDraft(input.adjudicatorId, input.oracleId);
  const doc: AdjudicationDoc = {
    adjudicatorId: input.adjudicatorId,
    oracleId: input.oracleId,
    phase: "calibration",
    samplePosition: input.samplePosition,
    sampleIdentityHash: CATALOG_COVERAGE_SAMPLE_IDENTITY_HASH,
    populationHash: CATALOG_COVERAGE_POPULATION_HASH,
    calibrationBatchHash: CATALOG_COVERAGE_CALIBRATION_BATCH_HASH,
    annotationProtocolVersion: CATALOG_COVERAGE_ANNOTATION_PROTOCOL_VERSION,
    cardStructureHash: input.card.cardStructureHash,
    oracleTextHash: input.card.oracleTextHash,
    status: input.status,
    uiDraft: input.uiDraft,
    semanticGold: input.semanticGold,
    humanExplanation: input.uiDraft.humanExplanation,
    officialRulingsConsulted: input.uiDraft.officialRulingsConsulted,
    startedAt: existing?.startedAt ?? now,
    updatedAt: now,
    submittedAt: input.status === "submitted" ? now : existing?.submittedAt,
  };

  await db
    .collection(ADJUDICATION_COLLECTION)
    .doc(adjudicationDocId(input.adjudicatorId, input.oracleId))
    .set(forFirestore(doc), { merge: true });

  if (input.status === "submitted") {
    await refreshSessionCounts(input.adjudicatorId);
  }
}

async function refreshSessionCounts(adjudicatorId: string): Promise<void> {
  const db = await getDb();
  const cards = getCalibrationCards();
  const submittedSnap = await db
    .collection(ADJUDICATION_COLLECTION)
    .where("adjudicatorId", "==", adjudicatorId)
    .where("phase", "==", "calibration")
    .where("status", "==", "submitted")
    .get();

  const submittedOracleIds = new Set(
    submittedSnap.docs.map((d) => (d.data() as AdjudicationDoc).oracleId),
  );
  const cardsSubmitted = cards.filter((c) => submittedOracleIds.has(c.oracleId)).length;
  const allSubmitted = cardsSubmitted >= cards.length;

  await db.collection(ADJUDICATION_SESSION_COLLECTION).doc(adjudicatorId).set(
    forFirestore({
      cardsSubmitted,
      allSubmitted,
      updatedAt: new Date().toISOString(),
    }),
    { merge: true },
  );
}

export async function calibrationQuorumReached(): Promise<boolean> {
  const db = await getDb();
  const snap = await db
    .collection(ADJUDICATION_SESSION_COLLECTION)
    .where("phase", "==", "calibration")
    .where("allSubmitted", "==", true)
    .get();
  return snap.size >= CALIBRATION_ADJUDICATOR_QUORUM;
}

export async function listSubmittedAdjudicators(): Promise<string[]> {
  const db = await getDb();
  const snap = await db
    .collection(ADJUDICATION_SESSION_COLLECTION)
    .where("phase", "==", "calibration")
    .where("allSubmitted", "==", true)
    .get();
  return snap.docs.map((d) => (d.data() as SessionDoc).adjudicatorId).sort();
}

export async function getCardRulings(oracleId: string): Promise<
  Array<{ id: string; publishedAt: string; rulingText: string }>
> {
  const db = await getDb();
  const rulings = await getActiveRulingsByOracleId(db, oracleId, 20);
  return rulings.map((r) => ({
    id: r.id,
    publishedAt: r.publishedAt,
    rulingText: r.rulingText,
  }));
}

export async function loadAllSubmittedForCalibration(): Promise<
  Array<{ adjudicatorId: string; oracleId: string; semanticGold: CatalogCoverageSemanticGoldCase; uiDraft: UiAdjudicationDraft }>
> {
  const db = await getDb();
  const snap = await db
    .collection(ADJUDICATION_COLLECTION)
    .where("phase", "==", "calibration")
    .where("status", "==", "submitted")
    .get();

  return snap.docs
    .map((doc) => {
      const row = doc.data() as AdjudicationDoc;
      if (!row.semanticGold) return null;
      return {
        adjudicatorId: row.adjudicatorId,
        oracleId: row.oracleId,
        semanticGold: row.semanticGold,
        uiDraft: row.uiDraft,
      };
    })
    .filter(Boolean) as Array<{
    adjudicatorId: string;
    oracleId: string;
    semanticGold: CatalogCoverageSemanticGoldCase;
    uiDraft: UiAdjudicationDraft;
  }>;
}

export function compareSemanticGold(
  a: CatalogCoverageSemanticGoldCase,
  b: CatalogCoverageSemanticGoldCase,
): { disagrees: boolean; disagreementType?: string; summary: string } {
  if (a.oracleRulesTextEmpty !== b.oracleRulesTextEmpty) {
    return {
      disagrees: true,
      disagreementType: "blank_text_treatment",
      summary: "Blank-text treatment differs",
    };
  }

  const aPrimitives = a.expectedCardNativeL2Actions.map((x) => `${x.primitive}:${x.evidenceSpan.text}`);
  const bPrimitives = b.expectedCardNativeL2Actions.map((x) => `${x.primitive}:${x.evidenceSpan.text}`);
  aPrimitives.sort();
  bPrimitives.sort();
  if (JSON.stringify(aPrimitives) !== JSON.stringify(bPrimitives)) {
    return {
      disagrees: true,
      disagreementType: "primitive",
      summary: "Layer-2 primitive set differs",
    };
  }

  const aOwners = a.expectedCardNativeL2Actions.map((x) => x.semanticOwner).sort();
  const bOwners = b.expectedCardNativeL2Actions.map((x) => x.semanticOwner).sort();
  if (JSON.stringify(aOwners) !== JSON.stringify(bOwners)) {
    return {
      disagrees: true,
      disagreementType: "ownership",
      summary: "Semantic ownership differs",
    };
  }

  if (a.abilities.length !== b.abilities.length) {
    return {
      disagrees: true,
      disagreementType: "ability_boundary",
      summary: "Ability count differs",
    };
  }

  return { disagrees: false, summary: "Agreement" };
}

export async function buildDisagreementReport(): Promise<
  Array<{
    oracleId: string;
    canonicalName: string;
    adjudicatorA: string;
    adjudicatorB: string;
    disagreementType?: string;
    summary: string;
    semanticGoldA: CatalogCoverageSemanticGoldCase;
    semanticGoldB: CatalogCoverageSemanticGoldCase;
    humanExplanationA?: string;
    humanExplanationB?: string;
  }>
> {
  const adjudicators = await listSubmittedAdjudicators();
  if (adjudicators.length < 2) return [];

  const [adjA, adjB] = adjudicators;
  const rows = await loadAllSubmittedForCalibration();
  const byAdj = new Map<string, Map<string, (typeof rows)[number]>>();
  for (const row of rows) {
    const bucket = byAdj.get(row.adjudicatorId) ?? new Map();
    bucket.set(row.oracleId, row);
    byAdj.set(row.adjudicatorId, bucket);
  }

  const aMap = byAdj.get(adjA!)!;
  const bMap = byAdj.get(adjB!)!;
  const cards = getCalibrationCards();
  const report: Array<{
    oracleId: string;
    canonicalName: string;
    adjudicatorA: string;
    adjudicatorB: string;
    disagreementType?: string;
    summary: string;
    semanticGoldA: CatalogCoverageSemanticGoldCase;
    semanticGoldB: CatalogCoverageSemanticGoldCase;
    humanExplanationA?: string;
    humanExplanationB?: string;
  }> = [];

  for (const card of cards) {
    const rowA = aMap.get(card.oracleId);
    const rowB = bMap.get(card.oracleId);
    if (!rowA?.semanticGold || !rowB?.semanticGold) continue;
    const cmp = compareSemanticGold(rowA.semanticGold, rowB.semanticGold);
    if (!cmp.disagrees) continue;
    report.push({
      oracleId: card.oracleId,
      canonicalName: card.canonicalName,
      adjudicatorA: adjA!,
      adjudicatorB: adjB!,
      disagreementType: cmp.disagreementType,
      summary: cmp.summary,
      semanticGoldA: rowA.semanticGold,
      semanticGoldB: rowB.semanticGold,
      humanExplanationA: rowA.uiDraft.humanExplanation,
      humanExplanationB: rowB.uiDraft.humanExplanation,
    });
  }

  return report;
}

export async function getProgressForAdjudicator(adjudicatorId: string): Promise<
  Record<string, "pending" | "draft" | "submitted">
> {
  const db = await getDb();
  const snap = await db
    .collection(ADJUDICATION_COLLECTION)
    .where("adjudicatorId", "==", adjudicatorId)
    .where("phase", "==", "calibration")
    .get();

  const progress: Record<string, "pending" | "draft" | "submitted"> = {};
  for (const card of getCalibrationCards()) {
    progress[card.oracleId] = "pending";
  }
  for (const doc of snap.docs) {
    const row = doc.data() as AdjudicationDoc;
    progress[row.oracleId] = row.status;
  }
  return progress;
}

export { CALIBRATION_BATCH_SIZE };
