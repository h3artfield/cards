/**
 * Deck resolution catalog — raw Firestore identity index + paper population frame.
 *
 * Raw catalog (~38k) is for identity resolution only.
 * Paper semantic universe (34,862) is the operational Commander card frame.
 */
import { existsSync, readFileSync, createReadStream } from "node:fs";
import { resolve } from "node:path";
import readline from "node:readline";
import { isPlayableInCommanderFormat } from "../../src/lib/deck-builder/commander-format-legality-snapshot-v1";
import { loadGoldenCatalogIndex, type GoldenCatalogIndex } from "./load-golden-catalog-index";
import { CATALOG_COVERAGE_POPULATION_HASH } from "../../src/lib/catalog-coverage/adjudication-config";
import type {
  DeckResolutionSupplement,
  OfficialNameAliasRow,
} from "./deck-resolution-supplement-v1";

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

export type PaperIdentityMeta = {
  paperEligible: boolean;
  paperPopulationFrame: "PAPER" | "DIGITAL_ONLY" | "NON_CARD" | "MALFORMED" | "UNKNOWN";
  hasPaperPrinting: boolean;
  populationCategory?: string;
};

export type DeckResolutionCatalog = GoldenCatalogIndex & {
  paperByOracleId: Map<string, PaperIdentityMeta>;
  officialAliasByNormalizedName: Map<string, OfficialNameAliasRow>;
  competitiveDeckOracleIds: Set<string>;
  nonCompetitiveOracleReasons: Map<string, string>;
  resolutionSupplement?: DeckResolutionSupplement;
  catalogUniverse: {
    rawCatalogIdentitiesLoaded: number;
    paperIdentitiesAvailable: number;
    digitalOnlyIdentities: number;
    nonCardIdentities: number;
    paperPopulationHash: string;
    resolutionSupplementVersion?: string;
    officialAliasCount?: number;
    competitiveDeckOracleCount?: number;
  };
};

async function loadPaperIdentityMap(failClosed = false): Promise<Map<string, PaperIdentityMeta>> {
  const map = new Map<string, PaperIdentityMeta>();
  if (!existsSync(PAPER_IDENTITIES_PATH)) {
    if (failClosed) throw new Error(`FAIL_CLOSED: missing paper eligibility ledger ${PAPER_IDENTITIES_PATH}`);
    return map;
  }

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
    const frame = (row.paperPopulationFrame ?? "UNKNOWN") as PaperIdentityMeta["paperPopulationFrame"];
    map.set(row.oracleId, {
      paperEligible: row.paperEligible ?? false,
      paperPopulationFrame: frame,
      hasPaperPrinting: row.hasPaperPrinting ?? false,
      populationCategory: row.populationCategory,
    });
  }
  return map;
}

function loadResolutionSupplement(failClosed = false): DeckResolutionSupplement | null {
  if (!existsSync(SUPPLEMENT_PATH)) {
    if (failClosed) throw new Error(`FAIL_CLOSED: missing deck-resolution supplement ${SUPPLEMENT_PATH}`);
    return null;
  }
  return JSON.parse(readFileSync(SUPPLEMENT_PATH, "utf8")) as DeckResolutionSupplement;
}

export async function loadDeckResolutionCatalog(options?: { failClosed?: boolean }): Promise<DeckResolutionCatalog> {
  const failClosed = options?.failClosed ?? false;
  const [index, paperByOracleId, supplement] = await Promise.all([
    loadGoldenCatalogIndex(),
    loadPaperIdentityMap(failClosed),
    Promise.resolve(loadResolutionSupplement(failClosed)),
  ]);

  if (failClosed && paperByOracleId.size === 0) {
    throw new Error("FAIL_CLOSED: paper eligibility ledger loaded zero identities");
  }
  if (failClosed && !supplement) {
    throw new Error("FAIL_CLOSED: deck-resolution supplement required but absent");
  }

  const officialAliasByNormalizedName = new Map<string, OfficialNameAliasRow>();
  const competitiveDeckOracleIds = new Set<string>(supplement?.competitiveDeckOracleIds ?? []);
  const nonCompetitiveOracleReasons = new Map<string, string>();

  for (const row of supplement?.officialNameAliases ?? []) {
    officialAliasByNormalizedName.set(row.normalizedAlias, row);
  }
  for (const row of supplement?.nonCompetitiveOracleReasons ?? []) {
    nonCompetitiveOracleReasons.set(row.oracleId, row.reason);
  }

  let paperIdentitiesAvailable = 0;
  let digitalOnlyIdentities = 0;
  let nonCardIdentities = 0;

  for (const oracleId of index.byOracleId.keys()) {
    const paper = paperByOracleId.get(oracleId);
    if (paper?.paperEligible) paperIdentitiesAvailable += 1;
    else if (paper?.paperPopulationFrame === "DIGITAL_ONLY") digitalOnlyIdentities += 1;
    else if (paper?.paperPopulationFrame === "NON_CARD" || paper?.paperPopulationFrame === "MALFORMED") {
      nonCardIdentities += 1;
    }
  }

  return {
    ...index,
    paperByOracleId,
    officialAliasByNormalizedName,
    competitiveDeckOracleIds,
    nonCompetitiveOracleReasons,
    resolutionSupplement: supplement ?? undefined,
    catalogUniverse: {
      rawCatalogIdentitiesLoaded: index.cardCount,
      paperIdentitiesAvailable,
      digitalOnlyIdentities,
      nonCardIdentities,
      paperPopulationHash: CATALOG_COVERAGE_POPULATION_HASH,
      resolutionSupplementVersion: supplement?.version,
      officialAliasCount: officialAliasByNormalizedName.size,
      competitiveDeckOracleCount: competitiveDeckOracleIds.size,
    },
  };
}

export function paperMetaForOracle(
  catalog: DeckResolutionCatalog,
  oracleId: string,
): PaperIdentityMeta {
  return (
    catalog.paperByOracleId.get(oracleId) ?? {
      paperEligible: false,
      paperPopulationFrame: "UNKNOWN",
      hasPaperPrinting: false,
    }
  );
}

export function isCompetitiveDeckOracle(catalog: DeckResolutionCatalog, oracleId: string): boolean {
  if (catalog.competitiveDeckOracleIds.size === 0) return true;
  return catalog.competitiveDeckOracleIds.has(oracleId);
}

export function isCurrentlyCommanderLegal(
  card: {
    oracleId?: string;
    canonicalName?: string;
    name?: string;
    typeLine?: string;
    oracleText?: string;
    colorIdentity?: string[];
    legalities?: { commander?: string };
    releaseInformation?: { setCode?: string; setName?: string; releasedAt?: string };
    commanderEligibility?: {
      canBeSoleCommander?: boolean;
      canBePartner?: boolean;
      canBeBackground?: boolean;
    };
    updatedAt?: string;
    evidence?: { bulkUpdatedAt?: string };
  },
): boolean {
  if (card.oracleId && card.typeLine) {
    return isPlayableInCommanderFormat({
      oracleId: card.oracleId,
      canonicalName: card.canonicalName ?? card.name ?? "",
      typeLine: card.typeLine,
      oracleText: card.oracleText,
      colorIdentity: card.colorIdentity ?? [],
      legalities: card.legalities,
      releaseInformation: card.releaseInformation,
      updatedAt: card.updatedAt,
      evidence: card.evidence,
    });
  }

  const cmd = card.legalities?.commander;
  return cmd === "legal" || cmd === "restricted";
}
