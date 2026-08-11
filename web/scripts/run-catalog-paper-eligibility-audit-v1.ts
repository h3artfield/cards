/**
 * Paper vs digital-only population audit from complete Scryfall default_cards bulk.
 *
 * Rule: paperEligible = oracle identity has >=1 printing whose games[] contains "paper".
 *
 * Run: cd web && npx tsx scripts/run-catalog-paper-eligibility-audit-v1.ts
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvLocal } from "./lib/script-env";
import { COLLECTIONS } from "../src/lib/firebase/collections";
import { downloadBulkToCache, fetchBulkMetadata } from "../src/lib/deck-builder/golden-catalog/bulk-metadata";
import { streamJsonlFile } from "../src/lib/deck-builder/golden-catalog/stream-bulk-jsonl";
import type { CatalogPopulationSnapshotV2 } from "./lib/firestore-catalog-population-snapshot-v2";
import {
  classifyDigitalOnlySubtype,
  createOraclePrintingAggregate,
  extractOracleIdFromBulk,
  ingestPrintingAggregate,
  paperPopulationFrame,
  paperPopulationHash,
  type OraclePrintingAggregate,
  type PaperPopulationFrame,
} from "./lib/catalog-paper-eligibility-v1";

loadEnvLocal();

const OUT_DIR = "data/milestones/catalog-shadow";
const POPULATION_V2_PATH = `${OUT_DIR}/catalog-population-snapshot-firestore-v2.json`;
const SAMPLE_V2_PATH = `${OUT_DIR}/catalog-coverage-sample-v2.json`;
const CALIBRATION_PATH = `${OUT_DIR}/catalog-coverage-calibration-batch-v1.json`;

type CountMap = Record<string, number>;

function bump(map: CountMap, key: string, n = 1): void {
  map[key] = (map[key] ?? 0) + n;
}

function topEntries(map: CountMap, limit = 25): Array<{ key: string; count: number }> {
  return Object.entries(map)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([key, count]) => ({ key, count }));
}

async function loadSubmittedAdjudications(): Promise<
  Array<{
    adjudicatorId: string;
    oracleId: string;
    canonicalName?: string;
    status: string;
    submittedAt?: string;
  }>
> {
  const { ensureFirebaseAdmin, requireFirestore, isAdminConfigured } =
    await import("../src/lib/firebase/admin");
  if (!ensureFirebaseAdmin().initialized || !isAdminConfigured()) {
    return [];
  }
  const db = requireFirestore();
  const snap = await db
    .collection(COLLECTIONS.catalogCoverageAdjudications)
    .where("phase", "==", "calibration")
    .where("status", "==", "submitted")
    .get();
  return snap.docs.map((doc) => {
    const d = doc.data() as {
      adjudicatorId: string;
      oracleId: string;
      status: string;
      submittedAt?: string;
      uiDraft?: { cardName?: string };
    };
    return {
      adjudicatorId: d.adjudicatorId,
      oracleId: d.oracleId,
      canonicalName: d.uiDraft?.cardName,
      status: d.status,
      submittedAt: d.submittedAt,
    };
  });
}

async function main() {
  const started = Date.now();
  const populationV2 = JSON.parse(
    readFileSync(resolve(POPULATION_V2_PATH), "utf8"),
  ) as CatalogPopulationSnapshotV2;
  const sampleV2 = JSON.parse(readFileSync(resolve(SAMPLE_V2_PATH), "utf8")) as {
    sampleIdentityHash: string;
    sampleCount: number;
    cards: Array<{ oracleId: string; canonicalName: string }>;
  };
  const calibration = JSON.parse(readFileSync(resolve(CALIBRATION_PATH), "utf8")) as {
    batchIdentityHash: string;
    cards: Array<{ oracleId: string; canonicalName: string }>;
  };

  console.log("Downloading Scryfall default_cards bulk for printing games[] audit…");
  const defaultMeta = await fetchBulkMetadata("default_cards");
  if (!defaultMeta) throw new Error("default_cards bulk metadata unavailable");
  const { cachePath: defaultCache } = await downloadBulkToCache(defaultMeta);

  const byOracle = new Map<string, OraclePrintingAggregate>();

  await streamJsonlFile({
    cachePath: defaultCache,
    onLine: async (raw) => {
      const oracleId = extractOracleIdFromBulk(raw);
      if (!oracleId) return;
      let agg = byOracle.get(oracleId);
      if (!agg) {
        agg = createOraclePrintingAggregate(oracleId);
        byOracle.set(oracleId, agg);
      }
      ingestPrintingAggregate(agg, raw);
    },
  });

  const legitimate = populationV2.identities.filter((i) => i.studyPopulationEligible);
  const frameCounts: Record<PaperPopulationFrame, number> = {
    PAPER: 0,
    DIGITAL_ONLY: 0,
    NON_CARD: 0,
    MALFORMED: 0,
  };

  const digitalOnlyRows: Array<{
    oracleId: string;
    canonicalName: string;
    populationCategory: string;
    layout?: string;
    printingCount: number;
    paperPrintingCount: number;
    gamesUnion: string[];
    setCodes: string[];
    setTypes: string[];
    layouts: string[];
    digitalOnlySubtype: string;
    examplePrintings: OraclePrintingAggregate["examplePrintings"];
  }> = [];

  const bySet: CountMap = {};
  const byLayout: CountMap = {};
  const byGames: CountMap = {};
  const byDigitalFlag: CountMap = {};
  const bySubtype: CountMap = {};

  const identityPaperRows: Array<{
    oracleId: string;
    canonicalName: string;
    populationCategory: string;
    paperPopulationFrame: PaperPopulationFrame;
    hasPaperPrinting: boolean;
    printingCount: number;
    oracleTextHash: string;
    cardStructureHash: string;
    paperEligible: boolean;
  }> = [];

  for (const identity of populationV2.identities) {
    const agg = byOracle.get(identity.oracleId) ?? createOraclePrintingAggregate(identity.oracleId);
    const frame = paperPopulationFrame({
      populationCategory: identity.populationCategory,
      hasPaperPrinting: agg.hasPaperPrinting,
      printingCount: agg.printingCount,
    });
    frameCounts[frame] += 1;

    const paperEligible = frame === "PAPER";
    identityPaperRows.push({
      oracleId: identity.oracleId,
      canonicalName: identity.canonicalName,
      populationCategory: identity.populationCategory,
      paperPopulationFrame: frame,
      hasPaperPrinting: agg.hasPaperPrinting,
      printingCount: agg.printingCount,
      oracleTextHash: identity.oracleTextHash,
      cardStructureHash: identity.cardStructureHash,
      paperEligible,
    });

    if (frame !== "DIGITAL_ONLY") continue;

    const subtype = classifyDigitalOnlySubtype(agg);
    bump(bySubtype, subtype);
    for (const s of agg.setCodes) bump(bySet, s);
    for (const l of agg.layouts) bump(byLayout, l);
    for (const g of agg.gamesUnion) bump(byGames, g);
    for (const d of agg.digitalFlags) bump(byDigitalFlag, String(d));

    digitalOnlyRows.push({
      oracleId: identity.oracleId,
      canonicalName: identity.canonicalName,
      populationCategory: identity.populationCategory,
      layout: identity.layout,
      printingCount: agg.printingCount,
      paperPrintingCount: agg.paperPrintingCount,
      gamesUnion: agg.gamesUnion,
      setCodes: agg.setCodes,
      setTypes: agg.setTypes,
      layouts: agg.layouts,
      digitalOnlySubtype: subtype,
      examplePrintings: agg.examplePrintings,
    });
  }

  digitalOnlyRows.sort((a, b) => a.canonicalName.localeCompare(b.canonicalName));

  const legitimatePaper = legitimate.filter((i) => {
    const agg = byOracle.get(i.oracleId);
    return agg?.hasPaperPrinting ?? false;
  }).length;
  const legitimateDigitalOnly = legitimate.length - legitimatePaper;

  const paperEligibleHash = paperPopulationHash(
    identityPaperRows.map((r) => ({
      oracleId: r.oracleId,
      oracleTextHash: r.oracleTextHash,
      cardStructureHash: r.cardStructureHash,
      paperEligible: r.paperEligible,
    })),
  );

  const digitalOnlyOracleIds = new Set(
    identityPaperRows.filter((r) => r.paperPopulationFrame === "DIGITAL_ONLY").map((r) => r.oracleId),
  );

  const sampleDigitalOnly = sampleV2.cards.filter((c) => digitalOnlyOracleIds.has(c.oracleId));
  const calibrationDigitalOnly = calibration.cards.filter((c) => digitalOnlyOracleIds.has(c.oracleId));

  const submitted = await loadSubmittedAdjudications();
  const submittedDigitalOnly = submitted.filter((s) => digitalOnlyOracleIds.has(s.oracleId));

  const report = {
    artifactType: "CatalogPaperEligibilityAudit",
    version: "catalog-paper-eligibility-audit-v1",
    generatedAt: new Date().toISOString(),
    durationMs: Date.now() - started,
    authoritativeRule:
      "paperEligible = oracle identity has >=1 printing in Scryfall default_cards whose games[] contains 'paper'",
    dataSources: {
      populationSnapshot: POPULATION_V2_PATH,
      sampleV2: SAMPLE_V2_PATH,
      calibrationBatch: CALIBRATION_PATH,
      scryfallBulk: {
        type: "default_cards",
        updatedAt: defaultMeta.updatedAt,
        cachePath: defaultCache.replace(/\\/g, "/"),
      },
    },
    catalogModel: {
      rawScryfallCatalog: "Complete imported source — includes digital-only identities",
      paperSemanticCatalog: "Physical-card identities — hasPaperPrinting == true",
      storeInventory: "Printings physically sellable by The Game Lodge",
    },
    populationV2: {
      populationHash: populationV2.populationHash,
      totalCatalogOracleCards: populationV2.firestoreTotalCatalogOracleCards,
      legitimateIdentitiesABC: legitimate.length,
      paperEligibleIdentities: legitimatePaper,
      digitalOnlyIdentities: legitimateDigitalOnly,
      nonCardCategoryD: frameCounts.NON_CARD,
      malformedCategoryE: frameCounts.MALFORMED,
    },
    paperPopulationV3: {
      status: sampleDigitalOnly.length > 0 ? "REQUIRED" : "NOT_REQUIRED",
      paperEligiblePopulationHash: paperEligibleHash,
      paperEligibleCount: identityPaperRows.filter((r) => r.paperEligible).length,
      note:
        sampleDigitalOnly.length > 0
          ? "Sample v2 contains digital-only identities — supersede v2, freeze paper population v3, redraw sample v3 and calibration probabilistically."
          : "Sample v2 has no digital-only identities — paper correction may still adjust denominator counts.",
    },
    digitalOnlyBreakdown: {
      totalDigitalOnlyInLegitimateFrame: legitimateDigitalOnly,
      bySubtype: topEntries(bySubtype, 20),
      bySet: topEntries(bySet, 40),
      byLayout: topEntries(byLayout, 20),
      byGames: topEntries(byGames, 20),
      byDigitalFlag: topEntries(byDigitalFlag, 5),
    },
    examples: {
      warzoneDuplicator: digitalOnlyRows.find((r) => r.canonicalName === "Warzone Duplicator") ?? null,
      digitalOnlySample: digitalOnlyRows.slice(0, 30),
    },
    sampleV2: {
      sampleIdentityHash: sampleV2.sampleIdentityHash,
      sampleCount: sampleV2.sampleCount,
      digitalOnlyCount: sampleDigitalOnly.length,
      digitalOnlyCards: sampleDigitalOnly,
      status: sampleDigitalOnly.length > 0 ? "SUPERSEDED_PENDING_V3" : "VALID_PENDING_PAPER_AUDIT",
    },
    calibrationBatchV1: {
      batchIdentityHash: calibration.batchIdentityHash,
      cardCount: calibration.cards.length,
      digitalOnlyCount: calibrationDigitalOnly.length,
      digitalOnlyCards: calibrationDigitalOnly,
    },
    adjudication: {
      calibrationStatus: "SUSPENDED_PENDING_PAPER_POPULATION_CORRECTION",
      instruction:
        "Stop calibration after submitted cards. Preserve Cody's adjudications. Do not annotate remaining calibration cards until paper population v3 is sealed.",
      submittedCount: submitted.length,
      submittedDigitalOnlyCount: submittedDigitalOnly.length,
      submittedDigitalOnly,
      submittedCards: submitted,
    },
    parserPolicy: {
      rc8: "FROZEN — no changes",
      rc9: "NOT AUTHORIZED",
      blindBenchmark: "DO NOT TOUCH",
    },
  };

  mkdirSync(resolve(OUT_DIR), { recursive: true });
  const auditPath = resolve(OUT_DIR, "catalog-paper-eligibility-audit-v1.json");
  const detailPath = resolve(OUT_DIR, "catalog-paper-eligibility-identities-v1.jsonl");
  writeFileSync(auditPath, `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(
    detailPath,
    identityPaperRows.map((r) => JSON.stringify(r)).join("\n") + "\n",
  );

  console.log(JSON.stringify({ auditPath, detailPath, summary: report.populationV2, sampleV2: report.sampleV2, calibration: report.calibrationBatchV1, adjudication: report.adjudication }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
