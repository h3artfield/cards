import { COLLECTIONS } from "../firebase/collections";
import { getAdminFirestore } from "../firebase/admin";
import type {
  SolDirectedBuildJobRecordV111,
  SolDirectedBuildResultV111,
} from "../deck-synthesis/professor-sol-directed-build-types-v1-1-1";

export type CustomerSavedDeck = {
  id: string;
  customerId: string;
  storeId: string;
  storeSlug: string;
  buildId: string;
  deckName: string;
  commanderName: string;
  grade: string | null;
  classification: string | null;
  bracket: number;
  playstyle: string;
  createdAt: string;
  updatedAt: string;
};

const memoryDecks = new Map<string, CustomerSavedDeck>();

function deckNameFromJob(job: SolDirectedBuildJobRecordV111): string {
  return `${job.commanderName} — ${job.playstyle}`;
}

export async function saveCustomerDeckFromBuildJob(args: {
  job: SolDirectedBuildJobRecordV111;
  result: SolDirectedBuildResultV111;
}): Promise<CustomerSavedDeck | null> {
  const customerId = args.job.userId?.trim();
  if (!customerId || args.result.status !== "COMPLETE") return null;

  const now = new Date().toISOString();
  const id = `${customerId}_${args.job.buildId}`;
  const record: CustomerSavedDeck = {
    id,
    customerId,
    storeId: args.job.storeId,
    storeSlug: args.job.storeSlug,
    buildId: args.job.buildId,
    deckName: deckNameFromJob(args.job),
    commanderName: args.job.commanderName,
    grade: args.result.headProfessor?.grade ?? args.job.finalGrade ?? null,
    classification:
      args.result.headProfessor?.classification ?? args.job.finalClassification ?? null,
    bracket: args.job.bracket,
    playstyle: args.job.playstyle,
    createdAt: now,
    updatedAt: now,
  };

  memoryDecks.set(id, record);
  const db = getAdminFirestore();
  if (db) {
    await db.collection(COLLECTIONS.customerSavedDecks).doc(id).set(record, { merge: true });
  }
  return record;
}

export async function listCustomerSavedDecks(args: {
  customerId: string;
  storeSlug?: string;
  limit?: number;
}): Promise<CustomerSavedDeck[]> {
  const limit = args.limit ?? 50;
  const db = getAdminFirestore();
  if (db) {
    const snap = await db
      .collection(COLLECTIONS.customerSavedDecks)
      .where("customerId", "==", args.customerId)
      .orderBy("updatedAt", "desc")
      .limit(limit * 2)
      .get();
    let rows = snap.docs.map((doc) => doc.data() as CustomerSavedDeck);
    if (args.storeSlug) {
      rows = rows.filter((d) => d.storeSlug === args.storeSlug);
    }
    return rows.slice(0, limit);
  }

  let rows = [...memoryDecks.values()].filter((d) => d.customerId === args.customerId);
  if (args.storeSlug) {
    rows = rows.filter((d) => d.storeSlug === args.storeSlug);
  }
  return rows
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, limit);
}
