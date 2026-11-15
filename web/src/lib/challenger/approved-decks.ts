import { COLLECTIONS } from "../firebase/collections";
import { getAdminFirestore } from "../firebase/admin";

export type ChallengerDeckCard = { name: string; copies: number };

export type ChallengerApprovedDeck = {
  deckId: string;
  userId: string;
  displayName: string;
  bracket: number;
  commander: string;
  partner: string | null;
  cards: ChallengerDeckCard[];
  legalityReport: unknown;
  measuredBracket: number;
  approvedAt: string;
};

const memory = new Map<string, ChallengerApprovedDeck>();

/** The chosen deck is the only one the table offers, so its bracket is the queue. */
export async function saveApprovedChallengerDeck(
  deck: ChallengerApprovedDeck,
): Promise<void> {
  const db = getAdminFirestore();
  if (db) {
    const col = db.collection(COLLECTIONS.challengerApprovedDecks);
    const existing = await col.where("userId", "==", deck.userId).get();
    const batch = db.batch();
    for (const doc of existing.docs) {
      if (doc.id !== deck.deckId) batch.delete(doc.ref);
    }
    batch.set(col.doc(deck.deckId), deck);
    await batch.commit();
    return;
  }
  for (const [id, row] of memory) {
    if (row.userId === deck.userId && id !== deck.deckId) memory.delete(id);
  }
  memory.set(deck.deckId, deck);
}

export async function listApprovedChallengerDecks(
  userId: string,
): Promise<ChallengerApprovedDeck[]> {
  const db = getAdminFirestore();
  let rows: ChallengerApprovedDeck[];
  if (db) {
    const snap = await db
      .collection(COLLECTIONS.challengerApprovedDecks)
      .where("userId", "==", userId)
      .get();
    rows = snap.docs.map((doc) => doc.data() as ChallengerApprovedDeck);
  } else {
    rows = [...memory.values()].filter((row) => row.userId === userId);
  }
  return rows.sort((a, b) => b.approvedAt.localeCompare(a.approvedAt));
}
