import type {
  CardCrosswalk,
  CatalogCard,
  CatalogOracleCard,
  CatalogSyncState,
  EdhrecCommanderMeta,
  EdhrecSyncRun,
  StoreDeck,
} from "./types";
import { COLLECTIONS } from "../firebase/collections";
import {
  isAdminConfigured,
  requireFirestore,
} from "../firebase/admin";
import { isCloudDeployment } from "../cloud-env";
import { forFirestore } from "../firebase/for-firestore";
import {
  mutateDevMemory,
  readDevMemoryState,
  type DevMemoryState,
} from "../storage/dev-file-store";

function dbOrMemory() {
  if (isAdminConfigured()) return requireFirestore();
  if (isCloudDeployment()) throw new Error("Firestore required");
  return null;
}

export interface DeckBuilderMemory {
  catalogCards: CatalogCard[];
  catalogOracleCards: CatalogOracleCard[];
  catalogSyncState?: CatalogSyncState;
  edhrecCommanderMeta: EdhrecCommanderMeta[];
  cardCrosswalk: CardCrosswalk[];
  storeDecks: StoreDeck[];
  edhrecSyncRuns: EdhrecSyncRun[];
}

function deckBuilderFromState(state: DevMemoryState): DeckBuilderMemory {
  const s = state as DevMemoryState & Partial<DeckBuilderMemory>;
  return {
    catalogCards: s.catalogCards ?? [],
    catalogOracleCards: s.catalogOracleCards ?? [],
    catalogSyncState: s.catalogSyncState,
    edhrecCommanderMeta: s.edhrecCommanderMeta ?? [],
    cardCrosswalk: s.cardCrosswalk ?? [],
    storeDecks: s.storeDecks ?? [],
    edhrecSyncRuns: s.edhrecSyncRuns ?? [],
  };
}

export const deckBuilderStore = {
  async saveCatalogCard(card: CatalogCard): Promise<void> {
    const db = dbOrMemory();
    if (db) {
      await db
        .collection(COLLECTIONS.catalogCards)
        .doc(card.id)
        .set(forFirestore(card), { merge: true });
      return;
    }
    await mutateDevMemory((state) => {
      const dbState = state as DevMemoryState & Partial<DeckBuilderMemory>;
      if (!dbState.catalogCards) dbState.catalogCards = [];
      const idx = dbState.catalogCards.findIndex((c) => c.id === card.id);
      if (idx >= 0) dbState.catalogCards[idx] = card;
      else dbState.catalogCards.push(card);
    });
  },

  async getCatalogCard(id: string): Promise<CatalogCard | null> {
    const db = dbOrMemory();
    if (db) {
      const snap = await db.collection(COLLECTIONS.catalogCards).doc(id).get();
      return snap.exists ? (snap.data() as CatalogCard) : null;
    }
    const state = await readDevMemoryState();
    return deckBuilderFromState(state).catalogCards.find((c) => c.id === id) ?? null;
  },

  async getCatalogCards(ids: string[]): Promise<CatalogCard[]> {
    const unique = [...new Set(ids)];
    const cards = await Promise.all(
      unique.map((id) => this.getCatalogCard(id)),
    );
    return cards.filter(Boolean) as CatalogCard[];
  },

  async listCatalogCards(limit = 500): Promise<CatalogCard[]> {
    const capped = Math.min(2000, Math.max(1, limit));
    const db = dbOrMemory();
    if (db) {
      const snap = await db.collection(COLLECTIONS.catalogCards).limit(capped).get();
      return snap.docs.map((d) => d.data() as CatalogCard);
    }
    const state = await readDevMemoryState();
    return deckBuilderFromState(state).catalogCards.slice(0, capped);
  },

  async saveCatalogOracleCard(card: CatalogOracleCard): Promise<void> {
    const db = dbOrMemory();
    if (db) {
      await db
        .collection(COLLECTIONS.catalogOracleCards)
        .doc(card.id)
        .set(forFirestore(card), { merge: true });
      return;
    }
    await mutateDevMemory((state) => {
      const dbState = state as DevMemoryState & Partial<DeckBuilderMemory>;
      if (!dbState.catalogOracleCards) dbState.catalogOracleCards = [];
      const idx = dbState.catalogOracleCards.findIndex((c) => c.id === card.id);
      if (idx >= 0) dbState.catalogOracleCards[idx] = card;
      else dbState.catalogOracleCards.push(card);
    });
  },

  async getCatalogOracleCard(id: string): Promise<CatalogOracleCard | null> {
    const db = dbOrMemory();
    if (db) {
      const snap = await db.collection(COLLECTIONS.catalogOracleCards).doc(id).get();
      return snap.exists ? (snap.data() as CatalogOracleCard) : null;
    }
    const state = await readDevMemoryState();
    return (
      deckBuilderFromState(state).catalogOracleCards.find((c) => c.id === id) ??
      null
    );
  },

  async getCatalogOracleCards(ids: string[]): Promise<CatalogOracleCard[]> {
    const unique = [...new Set(ids.filter(Boolean))];
    const cards = await Promise.all(
      unique.map((id) => this.getCatalogOracleCard(id)),
    );
    return cards.filter(Boolean) as CatalogOracleCard[];
  },

  async countCatalogOracleCards(): Promise<number> {
    const db = dbOrMemory();
    if (db) {
      const snap = await db.collection(COLLECTIONS.catalogOracleCards).count().get();
      return snap.data().count;
    }
    const state = await readDevMemoryState();
    return deckBuilderFromState(state).catalogOracleCards.length;
  },

  async getCatalogSyncState(): Promise<CatalogSyncState | null> {
    const db = dbOrMemory();
    if (db) {
      const snap = await db.collection(COLLECTIONS.catalogSyncState).doc("global").get();
      return snap.exists ? (snap.data() as CatalogSyncState) : null;
    }
    const state = await readDevMemoryState();
    return deckBuilderFromState(state).catalogSyncState ?? null;
  },

  async saveCatalogSyncState(state: CatalogSyncState): Promise<void> {
    const db = dbOrMemory();
    if (db) {
      await db
        .collection(COLLECTIONS.catalogSyncState)
        .doc("global")
        .set(forFirestore(state), { merge: true });
      return;
    }
    await mutateDevMemory((mem) => {
      const dbState = mem as DevMemoryState & Partial<DeckBuilderMemory>;
      dbState.catalogSyncState = state;
    });
  },

  async searchCatalogCards(query: string, limit = 20): Promise<CatalogCard[]> {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const db = dbOrMemory();
    if (db) {
      const snap = await db
        .collection(COLLECTIONS.catalogCards)
        .where("isCommander", "==", true)
        .limit(200)
        .get();
      return snap.docs
        .map((d) => d.data() as CatalogCard)
        .filter((c) => c.name.toLowerCase().includes(q))
        .slice(0, limit);
    }
    const state = await readDevMemoryState();
    return deckBuilderFromState(state)
      .catalogCards.filter(
        (c) => c.isCommander && c.name.toLowerCase().includes(q),
      )
      .slice(0, limit);
  },

  async saveEdhrecMeta(meta: EdhrecCommanderMeta): Promise<void> {
    const db = dbOrMemory();
    if (db) {
      await db
        .collection(COLLECTIONS.edhrecCommanderMeta)
        .doc(meta.id)
        .set(forFirestore(meta), { merge: true });
      return;
    }
    await mutateDevMemory((state) => {
      const dbState = state as DevMemoryState & Partial<DeckBuilderMemory>;
      if (!dbState.edhrecCommanderMeta) dbState.edhrecCommanderMeta = [];
      const idx = dbState.edhrecCommanderMeta.findIndex((m) => m.id === meta.id);
      if (idx >= 0) dbState.edhrecCommanderMeta[idx] = meta;
      else dbState.edhrecCommanderMeta.push(meta);
    });
  },

  async getEdhrecMeta(id: string): Promise<EdhrecCommanderMeta | null> {
    const db = dbOrMemory();
    if (db) {
      const snap = await db
        .collection(COLLECTIONS.edhrecCommanderMeta)
        .doc(id)
        .get();
      return snap.exists ? (snap.data() as EdhrecCommanderMeta) : null;
    }
    const state = await readDevMemoryState();
    return (
      deckBuilderFromState(state).edhrecCommanderMeta.find((m) => m.id === id) ??
      null
    );
  },

  async listEdhrecCommanders(limit = 100): Promise<EdhrecCommanderMeta[]> {
    const db = dbOrMemory();
    if (db) {
      const snap = await db.collection(COLLECTIONS.edhrecCommanderMeta).get();
      return snap.docs
        .map((d) => d.data() as EdhrecCommanderMeta)
        .filter((m) => !m.themeSlug)
        .sort((a, b) => (a.rank ?? 9999) - (b.rank ?? 9999))
        .slice(0, limit);
    }
    const state = await readDevMemoryState();
    return deckBuilderFromState(state)
      .edhrecCommanderMeta.filter((m) => !m.themeSlug)
      .sort((a, b) => (a.rank ?? 9999) - (b.rank ?? 9999))
      .slice(0, limit);
  },

  async saveCrosswalk(cw: CardCrosswalk): Promise<void> {
    const db = dbOrMemory();
    const docId = `${cw.storeId}_${cw.inventoryItemId}`;
    if (db) {
      await db
        .collection(COLLECTIONS.cardCrosswalk)
        .doc(docId)
        .set(forFirestore({ ...cw, id: docId }), { merge: true });
      return;
    }
    await mutateDevMemory((state) => {
      const dbState = state as DevMemoryState & Partial<DeckBuilderMemory>;
      if (!dbState.cardCrosswalk) dbState.cardCrosswalk = [];
      const idx = dbState.cardCrosswalk.findIndex(
        (c) => c.inventoryItemId === cw.inventoryItemId,
      );
      if (idx >= 0) dbState.cardCrosswalk[idx] = cw;
      else dbState.cardCrosswalk.push(cw);
    });
  },

  async listCrosswalks(storeId: string): Promise<CardCrosswalk[]> {
    const db = dbOrMemory();
    if (db) {
      const snap = await db
        .collection(COLLECTIONS.cardCrosswalk)
        .where("storeId", "==", storeId)
        .get();
      return snap.docs.map((d) => d.data() as CardCrosswalk);
    }
    const state = await readDevMemoryState();
    return deckBuilderFromState(state).cardCrosswalk.filter(
      (c) => c.storeId === storeId,
    );
  },

  async saveStoreDeck(deck: StoreDeck): Promise<void> {
    const db = dbOrMemory();
    if (db) {
      await db
        .collection(COLLECTIONS.storeDecks)
        .doc(deck.id)
        .set(forFirestore(deck), { merge: true });
      return;
    }
    await mutateDevMemory((state) => {
      const dbState = state as DevMemoryState & Partial<DeckBuilderMemory>;
      if (!dbState.storeDecks) dbState.storeDecks = [];
      const idx = dbState.storeDecks.findIndex((d) => d.id === deck.id);
      if (idx >= 0) dbState.storeDecks[idx] = deck;
      else dbState.storeDecks.push(deck);
    });
  },

  async getStoreDeck(id: string): Promise<StoreDeck | null> {
    const db = dbOrMemory();
    if (db) {
      const snap = await db.collection(COLLECTIONS.storeDecks).doc(id).get();
      return snap.exists ? (snap.data() as StoreDeck) : null;
    }
    const state = await readDevMemoryState();
    return deckBuilderFromState(state).storeDecks.find((d) => d.id === id) ?? null;
  },

  async getStoreDeckByShareToken(token: string): Promise<StoreDeck | null> {
    const db = dbOrMemory();
    if (db) {
      const snap = await db
        .collection(COLLECTIONS.storeDecks)
        .where("shareToken", "==", token)
        .limit(1)
        .get();
      return snap.docs[0]?.data() as StoreDeck | undefined ?? null;
    }
    const state = await readDevMemoryState();
    return (
      deckBuilderFromState(state).storeDecks.find(
        (d) => d.shareToken === token,
      ) ?? null
    );
  },

  async listStoreDecksForCustomer(
    storeId: string,
    customerId: string,
  ): Promise<StoreDeck[]> {
    const db = dbOrMemory();
    if (db) {
      const snap = await db
        .collection(COLLECTIONS.storeDecks)
        .where("storeId", "==", storeId)
        .where("customerId", "==", customerId)
        .get();
      return snap.docs.map((d) => d.data() as StoreDeck);
    }
    const state = await readDevMemoryState();
    return deckBuilderFromState(state).storeDecks.filter(
      (d) => d.storeId === storeId && d.customerId === customerId,
    );
  },

  async saveSyncRun(run: EdhrecSyncRun): Promise<void> {
    const db = dbOrMemory();
    if (db) {
      await db
        .collection(COLLECTIONS.edhrecSyncRuns)
        .doc(run.id)
        .set(forFirestore(run), { merge: true });
      return;
    }
    await mutateDevMemory((state) => {
      const dbState = state as DevMemoryState & Partial<DeckBuilderMemory>;
      if (!dbState.edhrecSyncRuns) dbState.edhrecSyncRuns = [];
      const idx = dbState.edhrecSyncRuns.findIndex((r) => r.id === run.id);
      if (idx >= 0) dbState.edhrecSyncRuns[idx] = run;
      else dbState.edhrecSyncRuns.push(run);
    });
  },

  async countCatalogCards(): Promise<number> {
    const db = dbOrMemory();
    if (db) {
      const snap = await db.collection(COLLECTIONS.catalogCards).count().get();
      return snap.data().count;
    }
    const state = await readDevMemoryState();
    return deckBuilderFromState(state).catalogCards.length;
  },

  async findCatalogOracleByCanonicalName(
    name: string,
  ): Promise<CatalogOracleCard | null> {
    const target = name.trim().toLowerCase();
    if (!target) return null;

    const db = dbOrMemory();
    if (db) {
      const snap = await db
        .collection(COLLECTIONS.catalogOracleCards)
        .where("canonicalName", "==", name.trim())
        .limit(1)
        .get();
      const doc = snap.docs[0]?.data() as CatalogOracleCard | undefined;
      if (doc) return doc;
    }

    const state = await readDevMemoryState();
    return (
      deckBuilderFromState(state).catalogOracleCards.find(
        (c) => c.canonicalName.trim().toLowerCase() === target,
      ) ?? null
    );
  },

  async findCatalogOracleByNormalizedName(
    name: string,
  ): Promise<CatalogOracleCard | null> {
    const exact = await deckBuilderStore.findCatalogOracleByCanonicalName(name);
    if (exact) return exact;

    const normalized = name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
    if (!normalized) return null;

    const db = dbOrMemory();
    if (db) {
      const snap = await db.collection(COLLECTIONS.catalogOracleCards).limit(500).get();
      for (const doc of snap.docs) {
        const oracle = doc.data() as CatalogOracleCard;
        const oracleNorm = oracle.canonicalName
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9]/g, "");
        if (oracleNorm === normalized) return oracle;
      }
      return null;
    }

    const state = await readDevMemoryState();
    return (
      deckBuilderFromState(state).catalogOracleCards.find(
        (c) =>
          c.canonicalName.trim().toLowerCase().replace(/[^a-z0-9]/g, "") ===
          normalized,
      ) ?? null
    );
  },

  async findCatalogPrintingByExactName(
    name: string,
  ): Promise<CatalogCard | null> {
    const target = name.trim().toLowerCase();
    if (!target) return null;

    const db = dbOrMemory();
    if (db) {
      const snap = await db
        .collection(COLLECTIONS.catalogCards)
        .where("name", "==", name.trim())
        .limit(1)
        .get();
      const doc = snap.docs[0]?.data() as CatalogCard | undefined;
      if (doc) return doc;
    }

    const state = await readDevMemoryState();
    return (
      deckBuilderFromState(state).catalogCards.find(
        (c) => c.name.trim().toLowerCase() === target,
      ) ?? null
    );
  },
};
