import { v4 as uuidv4 } from "uuid";
import type {
  CardPriceSnapshot,
  CardPriceSnapshotCategory,
  PriceChartingImportRun,
  PriceChartingProductCurrent,
} from "./types";
import {
  buildIdentityKey,
  inferIdentityFromPriceChartingRow,
  inferIdentityFromPriceChartingRowLegacy,
  snapshotDocId,
  type IdentityInferenceContext,
  type InferredIdentity,
} from "./identity-key";
import {
  normalizedRowToProductFields,
  parseCsvText,
  rowToNormalizedRecord,
} from "./pricecharting-csv-parser";
import { assessMtgPriceChartingProductIdentity } from "../card-flow-v2/market/mtg-pricecharting-match";
import { buildSuspectSearchPlan } from "../card-flow-v2/market/search-plan-builder";
import type { CardSuspect } from "../card-flow-v2/types";

export type PriceChartingCsvImportOptions = {
  fileText: string;
  fileName?: string;
  capturedDate: string;
  dryRun?: boolean;
  limit?: number;
  category?: CardPriceSnapshotCategory | "all";
  identityContext?: IdentityInferenceContext;
  /** Use legacy hardcoded MTG resolver (tests only). */
  useLegacyMtgInference?: boolean;
};

export type PriceChartingCsvImportResult = {
  run: PriceChartingImportRun;
  products: PriceChartingProductCurrent[];
  snapshots: CardPriceSnapshot[];
};

function categoryFilter(
  rowCategory: CardPriceSnapshotCategory,
  filter?: CardPriceSnapshotCategory | "all",
): boolean {
  if (!filter || filter === "all") return true;
  return rowCategory === filter;
}

function validateMtgRow(
  identity: InferredIdentity,
  productName: string,
): { ok: boolean; reason?: string } {
  if (identity.category !== "mtg" || !identity.setCode || !identity.collectorNumber) {
    return { ok: false, reason: identity.rejectedReason ?? "mtg_identity_incomplete" };
  }

  if (identity.printingSet === "PLST" || identity.setCode === "PLST") {
    return { ok: true };
  }

  const suspect: CardSuspect = {
    suspectId: `pc-import:${identity.setCode}-${identity.collectorNumber}`,
    category: "mtg",
    label: productName,
    catalogSource: "pricecharting",
    canonicalName: identity.cardName ?? productName,
    setCode: identity.setCode,
    setName: identity.setName,
    collectorNumber: identity.collectorNumber,
    finish: identity.finish ?? "nonfoil",
    variantTags: [identity.finish ?? "nonfoil"],
    expectedEvidence: [],
  };

  const plan = buildSuspectSearchPlan(suspect);
  const result = assessMtgPriceChartingProductIdentity(plan, productName);
  if (!result.accepted) {
    return {
      ok: false,
      reason: result.details.reason,
    };
  }
  return { ok: true };
}

function inferRow(
  input: { productName: string; consoleName?: string; genre?: string },
  options: PriceChartingCsvImportOptions,
): InferredIdentity {
  if (options.useLegacyMtgInference) {
    return inferIdentityFromPriceChartingRowLegacy(input);
  }
  return inferIdentityFromPriceChartingRow(input, options.identityContext);
}

function buildCatalogProduct(
  fields: NonNullable<ReturnType<typeof normalizedRowToProductFields>>,
  rawRow: Record<string, unknown>,
  inferred: InferredIdentity,
  identityKey: string | null,
  runId: string,
  capturedAt: string,
  exactIdentityMatch: boolean,
  rejectedReason?: string,
): PriceChartingProductCurrent {
  return {
    ...fields,
    importedAt: capturedAt,
    importRunId: runId,
    rawRow,
    category: inferred.category,
    exactIdentityMatch,
    identityKey: identityKey ?? undefined,
    rejectedReason,
    identityMatchReason: inferred.identityMatchReason,
    setCode: inferred.setCode,
    setName: inferred.setName,
    collectorNumber: inferred.collectorNumber,
    finish: inferred.finish,
    treatment: inferred.treatment,
    cardName: inferred.cardName,
    printingSet: inferred.printingSet,
    originSet: inferred.originSet,
    originCollectorNumber: inferred.originCollectorNumber,
  };
}

export function importPriceChartingCsv(
  options: PriceChartingCsvImportOptions,
): PriceChartingCsvImportResult {
  const runId = uuidv4();
  const startedAt = new Date().toISOString();
  const run: PriceChartingImportRun = {
    id: runId,
    source: "pricecharting_csv",
    startedAt,
    status: "running",
    fileName: options.fileName,
    capturedDate: options.capturedDate,
    rowsRead: 0,
    rowsImported: 0,
    rowsCataloged: 0,
    rowsSkipped: 0,
    rowsRejected: 0,
    identityRiskCount: 0,
    errors: [],
  };

  const products: PriceChartingProductCurrent[] = [];
  const snapshots: CardPriceSnapshot[] = [];
  const seenSnapshotIds = new Set<string>();

  const rows = parseCsvText(options.fileText);
  run.rowsRead = rows.length;

  const max = options.limit ?? rows.length;

  for (let i = 0; i < Math.min(rows.length, max); i++) {
    const rawRow = rowToNormalizedRecord(rows[i]!);
    const fields = normalizedRowToProductFields(rawRow);
    if (!fields) {
      run.rowsSkipped++;
      continue;
    }

    const inferred = inferRow(
      {
        productName: fields.productName,
        consoleName: fields.consoleName,
        genre: fields.genre,
      },
      options,
    );

    if (!categoryFilter(inferred.category, options.category)) {
      run.rowsSkipped++;
      continue;
    }

    let exactIdentityMatch = inferred.exactIdentityMatch;
    let rejectedReason = inferred.rejectedReason;
    let identityMatchReason = inferred.identityMatchReason;

    if (inferred.category === "mtg" && exactIdentityMatch) {
      const mtgCheck = validateMtgRow(inferred, fields.productName);
      if (!mtgCheck.ok) {
        exactIdentityMatch = false;
        rejectedReason = mtgCheck.reason;
      }
    }

    const identityKey = buildIdentityKey(inferred);
    const capturedAt = new Date().toISOString();

    products.push(
      buildCatalogProduct(
        fields,
        rawRow,
        inferred,
        identityKey,
        runId,
        capturedAt,
        exactIdentityMatch,
        rejectedReason,
      ),
    );
    run.rowsCataloged = (run.rowsCataloged ?? 0) + 1;

    if (!identityKey || !exactIdentityMatch) {
      run.rowsRejected++;
      if (!exactIdentityMatch) run.identityRiskCount++;
      continue;
    }

    const snapshotId = snapshotDocId({
      source: "pricecharting",
      identityKey,
      capturedDate: options.capturedDate,
      priceChartingProductId: fields.priceChartingProductId,
    });

    if (seenSnapshotIds.has(snapshotId)) {
      run.rowsSkipped++;
      continue;
    }
    seenSnapshotIds.add(snapshotId);

    snapshots.push({
      id: snapshotId,
      source: "pricecharting",
      capturedDate: options.capturedDate,
      capturedAt,
      importRunId: runId,
      identityKey,
      sourceIdentityKey: identityKey,
      category: inferred.category,
      priceChartingProductId: fields.priceChartingProductId,
      productName: fields.productName,
      consoleName: fields.consoleName,
      genre: fields.genre,
      cardName: inferred.cardName,
      setName: inferred.setName,
      setCode: inferred.setCode,
      collectorNumber: inferred.collectorNumber,
      finish: inferred.finish,
      treatment: inferred.treatment,
      printingSet: inferred.printingSet,
      originSet: inferred.originSet,
      originCollectorNumber: inferred.originCollectorNumber,
      rawUngraded: fields.loosePrice,
      grade8: fields.newPrice,
      grade9: fields.gradedPrice,
      grade95: fields.boxOnlyPrice,
      psa10: fields.manualOnlyPrice,
      bgs10: fields.bgs10Price,
      cgc10: fields.cgc10Price,
      sgc10: fields.sgc10Price,
      retailBuy: fields.retailLooseBuy,
      retailSell: fields.retailLooseSell,
      salesVolume: fields.salesVolume,
      currency: "USD",
      exactIdentityMatch: true,
      identityMatchReason,
      rawSourceRow: rawRow,
    });

    run.rowsImported++;
  }

  run.status = "success";
  run.finishedAt = new Date().toISOString();
  return { run, products, snapshots };
}

/** Sample CSV rows for tests — MAR #93 vs REX #18. */
export function sampleMar93CsvRow(): string {
  return [
    "id,product-name,console-name,genre,loose-price,sales-volume",
    'mar93,"Ravenous Tyrannosaurus [Marvel Universe] #93","Magic Marvel Universe",Magic,790,12',
    'rex18,"Ravenous Tyrannosaurus [Jurassic World Collection] #18","Magic Jurassic World Collection",Magic,4754,8',
  ].join("\n");
}
