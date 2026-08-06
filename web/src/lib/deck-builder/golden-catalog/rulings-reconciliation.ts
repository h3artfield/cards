import type { Firestore } from "firebase-admin/firestore";
import { parseRulingFromBulk } from "./parse-ruling";
import { streamJsonlFile, countJsonlLines } from "./stream-bulk-jsonl";
import { countCollection } from "./firestore-batch-writer";
import { COLLECTIONS } from "../../firebase/collections";

export interface MutuallyExclusiveBreakdown {
  sourceRows: number;
  exactDuplicateRows: number;
  whitespaceEmptyExclusions: number;
  invalidRecords: number;
  orphanedOracleIds: number;
  otherIntentionalExclusions: number;
  writeFailures: number;
  persistedUniqueDocuments: number;
}

export interface BalancedRulingsReconciliationResult {
  generatedAt: string;
  mutuallyExclusiveBreakdown: MutuallyExclusiveBreakdown;
  balanceCheck: {
    sum: number;
    expected: number;
    balances: boolean;
  };
  idSetEquality: {
    normalizedSourceUniqueHashes: number;
    firestoreDocumentIds: number;
    missingFromFirestore: string[];
    extraInFirestore: string[];
    idsMatchExactly: boolean;
  };
  distinctOracleIds: {
    normalizedSource: number;
    firestore: number;
    matches: boolean;
    onlyOnDuplicateRows: number;
  };
  whitespaceOnlyDetails: Array<{ lineNumber: number; oracleId: string; publishedAt: string }>;
  auditClosed: boolean;
}

export async function runBalancedRulingsReconciliation(input: {
  db: Firestore;
  cachePath: string;
  bulkUpdatedAt: string;
  bulkContentHash: string;
  collectionPath?: string;
  versionId?: string;
  importRunId?: string;
  expectedDocIds?: Set<string>;
}): Promise<BalancedRulingsReconciliationResult> {
  const generatedAt = new Date().toISOString();
  const sourceRows = await countJsonlLines(input.cachePath);

  let exactDuplicateRows = 0;
  let whitespaceEmptyExclusions = 0;
  let invalidRecords = 0;
  let otherIntentionalExclusions = 0;
  let persistedUniqueDocuments = 0;

  const seenContentHash = new Set<string>();
  const normalizedSourceDocIds = new Set<string>();
  const sourceOracleAll = new Set<string>();
  const sourceOracleUnique = new Set<string>();
  const whitespaceOnlyDetails: BalancedRulingsReconciliationResult["whitespaceOnlyDetails"] = [];

  await streamJsonlFile({
    cachePath: input.cachePath,
    onLine: async (raw, lineNumber) => {
      const oracleId = String(raw.oracle_id ?? "").trim();
      const publishedAt = String(raw.published_at ?? "").trim();
      const rulingText = String(raw.comment ?? raw.text ?? "").trim();

      if (oracleId) sourceOracleAll.add(oracleId);

      if (!oracleId && !publishedAt) {
        invalidRecords += 1;
        return;
      }
      if (!oracleId || !publishedAt || Number.isNaN(Date.parse(publishedAt))) {
        invalidRecords += 1;
        return;
      }
      if (!rulingText) {
        whitespaceEmptyExclusions += 1;
        whitespaceOnlyDetails.push({ lineNumber, oracleId, publishedAt });
        return;
      }

      const parsed = parseRulingFromBulk(raw, input.bulkUpdatedAt, generatedAt);
      if (!parsed.ruling) {
        otherIntentionalExclusions += 1;
        return;
      }

      if (seenContentHash.has(parsed.ruling.contentHash)) {
        exactDuplicateRows += 1;
        return;
      }

      seenContentHash.add(parsed.ruling.contentHash);
      normalizedSourceDocIds.add(parsed.ruling.id);
      sourceOracleUnique.add(parsed.ruling.oracleId);
      persistedUniqueDocuments += 1;
    },
  });

  const collectionPath = input.collectionPath ?? COLLECTIONS.catalogRulings;
  const firestoreDocIds = new Set<string>();
  const firestoreOracleIds = new Set<string>();

  async function collectFromQuery(
    query: FirebaseFirestore.Query,
  ): Promise<void> {
    const snap = await query.select("oracleId").get();
    for (const doc of snap.docs) {
      firestoreDocIds.add(doc.id);
      const oid = (doc.data() as { oracleId?: string }).oracleId;
      if (oid) firestoreOracleIds.add(oid);
    }
  }

  if (input.versionId) {
    let query = input.db
      .collection(COLLECTIONS.catalogRulingsVersions)
      .doc(input.versionId)
      .collection("rulings");
    if (input.importRunId) {
      query = query.where("importRunId", "==", input.importRunId);
    }
    await collectFromQuery(query);
  } else if (input.importRunId) {
    await collectFromQuery(
      input.db.collection(collectionPath).where("importRunId", "==", input.importRunId),
    );
  } else {
    await collectFromQuery(input.db.collection(collectionPath));
  }

  const expectedIds = input.expectedDocIds ?? normalizedSourceDocIds;
  const missingFromFirestore = [...expectedIds].filter((id) => !firestoreDocIds.has(id));
  const extraInFirestore = [...firestoreDocIds].filter((id) => !expectedIds.has(id));
  const writeFailures = Math.max(0, persistedUniqueDocuments - firestoreDocIds.size);

  const breakdown: MutuallyExclusiveBreakdown = {
    sourceRows,
    exactDuplicateRows,
    whitespaceEmptyExclusions,
    invalidRecords,
    orphanedOracleIds: 0,
    otherIntentionalExclusions,
    writeFailures,
    persistedUniqueDocuments: firestoreDocIds.size || persistedUniqueDocuments,
  };

  const sum =
    breakdown.persistedUniqueDocuments +
    breakdown.exactDuplicateRows +
    breakdown.whitespaceEmptyExclusions +
    breakdown.invalidRecords +
    breakdown.orphanedOracleIds +
    breakdown.otherIntentionalExclusions;

  const idsMatchExactly =
    missingFromFirestore.length === 0 &&
    extraInFirestore.length === 0 &&
    normalizedSourceDocIds.size === firestoreDocIds.size;

  const auditClosed =
    sum === sourceRows &&
    writeFailures === 0 &&
    idsMatchExactly &&
    sourceOracleUnique.size === firestoreOracleIds.size;

  return {
    generatedAt,
    mutuallyExclusiveBreakdown: breakdown,
    balanceCheck: { sum, expected: sourceRows, balances: sum === sourceRows },
    idSetEquality: {
      normalizedSourceUniqueHashes: normalizedSourceDocIds.size,
      firestoreDocumentIds: firestoreDocIds.size,
      missingFromFirestore: missingFromFirestore.slice(0, 20),
      extraInFirestore: extraInFirestore.slice(0, 20),
      idsMatchExactly,
    },
    distinctOracleIds: {
      normalizedSource: sourceOracleUnique.size,
      firestore: firestoreOracleIds.size,
      matches: sourceOracleUnique.size === firestoreOracleIds.size,
      onlyOnDuplicateRows: sourceOracleAll.size - sourceOracleUnique.size,
    },
    whitespaceOnlyDetails,
    auditClosed,
  };
}
