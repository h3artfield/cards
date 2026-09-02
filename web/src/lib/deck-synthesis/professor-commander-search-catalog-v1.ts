/**
 * Lightweight commander-search catalog — commanders + paper frame only (not full 38k catalog).
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { COLLECTIONS } from "@/lib/firebase/collections";
import type { GoldenCatalogOracleCard } from "@/lib/deck-builder/golden-catalog/schemas";
import { normalizeOracleName } from "@/lib/deck-builder/golden-catalog/normalize-name";
import { deriveCommanderClassification } from "@/lib/deck-builder/commander-classification";
import type {
  DeckResolutionCatalog,
  DeckResolutionSupplement,
  OfficialNameAliasRow,
  PaperIdentityMeta,
} from "../../../scripts/lib/load-deck-resolution-catalog";
import { paperMetaForOracle } from "../../../scripts/lib/load-deck-resolution-catalog";
import { auditProfessorBrewCommanderEligibility } from "./professor-brew-commander-resolver-v4-4-v1";
import { buildPaperEligibleSoleCommanderNameSet } from "./professor-commander-search-v4-v1";

export const PROFESSOR_COMMANDER_SEARCH_CATALOG_V1_VERSION = "professor-commander-search-catalog-v1";

function resolveMilestoneDataPath(filename: string): string {
  const candidates = [
    resolve(process.cwd(), "data/milestones/catalog-shadow", filename),
    resolve(process.cwd(), "web/data/milestones/catalog-shadow", filename),
    resolve(__dirname, "../../data/milestones/catalog-shadow", filename),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return candidates[0]!;
}

const PAPER_IDENTITIES_PATH = resolveMilestoneDataPath("catalog-paper-eligibility-identities-v1.jsonl");
const SUPPLEMENT_PATH = resolveMilestoneDataPath("catalog-deck-resolution-supplement-v1.json");

export type CommanderSearchCatalogV1 = Pick<
  DeckResolutionCatalog,
  "byOracleId" | "byNormalizedName" | "paperByOracleId" | "officialAliasByNormalizedName"
> & {
  paperEligibleSoleCommanderNames: Set<string>;
  catalogVersion: string;
  loadedAt: string;
  commanderCount: number;
};

let catalogPromise: Promise<CommanderSearchCatalogV1> | null = null;

async function loadPaperIdentityMap(): Promise<Map<string, PaperIdentityMeta>> {
  const map = new Map<string, PaperIdentityMeta>();
  if (!existsSync(PAPER_IDENTITIES_PATH)) return map;

  const { createReadStream } = await import("node:fs");
  const readline = await import("node:readline");
  const stream = createReadStream(PAPER_IDENTITIES_PATH);
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.trim()) continue;
    const row = JSON.parse(line) as {
      oracleId: string;
      paperEligible?: boolean;
      paperPopulationFrame?: string;
      hasPaperPrinting?: boolean;
      populationCategory?: string;
    };
    if (!row.oracleId) continue;
    map.set(row.oracleId, {
      paperEligible: row.paperEligible ?? false,
      paperPopulationFrame: (row.paperPopulationFrame ?? "UNKNOWN") as PaperIdentityMeta["paperPopulationFrame"],
      hasPaperPrinting: row.hasPaperPrinting ?? false,
      populationCategory: row.populationCategory,
    });
  }
  return map;
}

function loadResolutionSupplement(): DeckResolutionSupplement | null {
  if (!existsSync(SUPPLEMENT_PATH)) return null;
  return JSON.parse(readFileSync(SUPPLEMENT_PATH, "utf8")) as DeckResolutionSupplement;
}

function isSoleCommanderCandidate(card: GoldenCatalogOracleCard): boolean {
  if (card.commanderEligibility?.eligible === false) return false;
  const classification = deriveCommanderClassification(card);
  return classification.canBeSoleCommander && classification.commanderFormatStatus === "legal";
}

async function loadCommanderOracleCards(): Promise<{
  byOracleId: Map<string, GoldenCatalogOracleCard>;
  byNormalizedName: Map<string, GoldenCatalogOracleCard[]>;
  catalogVersion: string;
}> {
  const { ensureFirebaseAdmin, requireFirestore, isAdminConfigured } = await import("@/lib/firebase/admin");
  if (!ensureFirebaseAdmin().initialized || !isAdminConfigured()) {
    throw new Error("Firestore required. Run npm run firestore:health.");
  }

  const { withFirestoreScriptTimeout } = await import("../../../scripts/lib/firestore-fail-fast");
  const db = await requireFirestore();

  const byOracleId = new Map<string, GoldenCatalogOracleCard>();
  const byNormalizedName = new Map<string, GoldenCatalogOracleCard[]>();
  let catalogVersion = "unknown";

  const indexCard = (card: GoldenCatalogOracleCard) => {
    if (!card.oracleId || !isSoleCommanderCandidate(card)) return;
    byOracleId.set(card.oracleId, card);
    const norm = normalizeOracleName(card.canonicalName);
    const bucket = byNormalizedName.get(norm) ?? [];
    bucket.push(card);
    byNormalizedName.set(norm, bucket);
    if (card.sourceVersion) catalogVersion = card.sourceVersion;
  };

  try {
    const snap = await withFirestoreScriptTimeout(
      "commander-eligible catalogOracleCards query",
      () => db.collection(COLLECTIONS.catalogOracleCards).where("commanderEligibility.eligible", "==", true).get(),
      120_000,
    );
    for (const doc of snap.docs) {
      indexCard(doc.data() as GoldenCatalogOracleCard);
    }
  } catch {
    const snap = await withFirestoreScriptTimeout(
      "catalogOracleCards commander scan",
      () => db.collection(COLLECTIONS.catalogOracleCards).get(),
      120_000,
    );
    for (const doc of snap.docs) {
      indexCard(doc.data() as GoldenCatalogOracleCard);
    }
  }

  return { byOracleId, byNormalizedName, catalogVersion };
}

export async function loadCommanderSearchCatalogV1(): Promise<CommanderSearchCatalogV1> {
  const [commanderIndex, paperByOracleId, supplement] = await Promise.all([
    loadCommanderOracleCards(),
    loadPaperIdentityMap(),
    Promise.resolve(loadResolutionSupplement()),
  ]);

  const officialAliasByNormalizedName = new Map<string, OfficialNameAliasRow>();
  for (const row of supplement?.officialNameAliases ?? []) {
    officialAliasByNormalizedName.set(row.normalizedAlias, row);
  }

  const partialCatalog = {
    ...commanderIndex,
    paperByOracleId,
    officialAliasByNormalizedName,
    competitiveDeckOracleIds: new Set(supplement?.competitiveDeckOracleIds ?? []),
    nonCompetitiveOracleReasons: new Map<string, string>(),
    catalogUniverse: {
      rawCatalogIdentitiesLoaded: commanderIndex.byOracleId.size,
      paperIdentitiesAvailable: paperByOracleId.size,
      digitalOnlyIdentities: 0,
      nonCardIdentities: 0,
      paperPopulationHash: "",
    },
  } as DeckResolutionCatalog;

  const paperEligibleSoleCommanderNames = buildPaperEligibleSoleCommanderNameSet(partialCatalog);

  return {
    byOracleId: commanderIndex.byOracleId,
    byNormalizedName: commanderIndex.byNormalizedName,
    paperByOracleId,
    officialAliasByNormalizedName,
    paperEligibleSoleCommanderNames,
    catalogVersion: commanderIndex.catalogVersion,
    loadedAt: new Date().toISOString(),
    commanderCount: commanderIndex.byOracleId.size,
  };
}

export function getCommanderSearchCatalogRuntime(): Promise<CommanderSearchCatalogV1> {
  if (!catalogPromise) {
    catalogPromise = loadCommanderSearchCatalogV1();
  }
  return catalogPromise;
}

export function isPaperEligibleCommanderNameFast(
  catalog: CommanderSearchCatalogV1,
  commanderName: string,
): boolean {
  return catalog.paperEligibleSoleCommanderNames.has(normalizeOracleName(commanderName));
}

/** Test helper */
export function clearCommanderSearchCatalogCacheForTest(): void {
  catalogPromise = null;
}

export function auditCommanderSearchCard(
  catalog: CommanderSearchCatalogV1,
  oracleId: string,
): { ok: true } | { ok: false; message: string } {
  const card = catalog.byOracleId.get(oracleId);
  if (!card) return { ok: false, message: "Not found in commander catalog." };
  const partial = {
    ...catalog,
    byOracleTextHash: new Map(),
    cardCount: catalog.byOracleId.size,
  } as DeckResolutionCatalog;
  return auditProfessorBrewCommanderEligibility(partial, card);
}

export { paperMetaForOracle };
