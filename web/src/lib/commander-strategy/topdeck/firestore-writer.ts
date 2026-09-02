import { COLLECTIONS } from "@/lib/firebase/collections";
import type {
  DeckSemanticProfile,
  DeckStrategyAssignment,
  NormalizedDeckInstance,
  TopdeckImportRun,
  TopdeckPodGame,
} from "../types";

export async function getCommanderStrategyFirestore() {
  const { ensureFirebaseAdmin, requireFirestore, isAdminConfigured } = await import(
    "@/lib/firebase/admin"
  );
  if (!ensureFirebaseAdmin().initialized || !isAdminConfigured()) {
    throw new Error("Firestore required for TopDeck normalization writes.");
  }
  return requireFirestore();
}

export async function writeTopdeckImportRun(run: TopdeckImportRun): Promise<void> {
  const db = await getCommanderStrategyFirestore();
  await db.collection(COLLECTIONS.topdeckImportRuns).doc(run.runId).set(run, { merge: true });
}

export async function writeTopdeckTournament(tid: string, data: Record<string, unknown>): Promise<void> {
  const db = await getCommanderStrategyFirestore();
  await db.collection(COLLECTIONS.topdeckTournaments).doc(tid).set(data, { merge: true });
}

export async function batchWriteNormalizedData(input: {
  deckInstances: NormalizedDeckInstance[];
  podGames: TopdeckPodGame[];
  writeFirestore?: boolean;
}): Promise<{ decksWritten: number; podsWritten: number }> {
  if (!input.writeFirestore) return { decksWritten: 0, podsWritten: 0 };
  const db = await getCommanderStrategyFirestore();
  let decksWritten = 0;
  let podsWritten = 0;

  for (let i = 0; i < input.deckInstances.length; i += 400) {
    const batch = db.batch();
    for (const deck of input.deckInstances.slice(i, i + 400)) {
      batch.set(db.collection(COLLECTIONS.topdeckDeckInstances).doc(deck.deckInstanceId), deck, {
        merge: true,
      });
      decksWritten += 1;
    }
    await batch.commit();
  }

  for (let i = 0; i < input.podGames.length; i += 400) {
    const batch = db.batch();
    for (const pod of input.podGames.slice(i, i + 400)) {
      batch.set(db.collection(COLLECTIONS.topdeckPodGames).doc(pod.podId), pod, { merge: true });
      podsWritten += 1;
    }
    await batch.commit();
  }

  return { decksWritten, podsWritten };
}

export async function writeDeckSemanticProfile(profile: DeckSemanticProfile): Promise<void> {
  const db = await getCommanderStrategyFirestore();
  await db
    .collection(COLLECTIONS.deckSemanticProfiles)
    .doc(profile.deckHash)
    .set(profile, { merge: true });
}

export async function writeDeckStrategyAssignment(assignment: DeckStrategyAssignment): Promise<void> {
  const db = await getCommanderStrategyFirestore();
  await db
    .collection(COLLECTIONS.deckStrategyAssignments)
    .doc(assignment.deckHash)
    .set(assignment, { merge: true });
}
