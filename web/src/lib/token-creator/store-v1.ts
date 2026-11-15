import type { Firestore } from "firebase-admin/firestore";
import { loadCustomer } from "../auth/customer-auth";
import { getAdminFirestore } from "../firebase/admin";
import { tokenCreatorConfigV1 } from "./config-v1";
import {
  TOKEN_DESIGNS_COLLECTION,
  TOKEN_GALLERY_COLLECTION,
  TOKEN_GENERATIONS_COLLECTION,
  TOKEN_ORDERS_COLLECTION,
  TOKEN_SNAPSHOTS_COLLECTION,
  TOKEN_USAGE_COLLECTION,
  TOKEN_VERSIONS_COLLECTION,
  type TokenDesignV1,
  type TokenGalleryEntryV1,
  type TokenGalleryStatusV1,
  type TokenGenerationV1,
  type TokenPrintOrderV1,
  type TokenPrintSnapshotV1,
  type TokenVersionV1,
} from "./types-v1";

function db(): Firestore {
  const firestore = getAdminFirestore();
  if (!firestore) throw new Error("Token Creator needs Firestore, which is not configured.");
  return firestore;
}

async function getDoc<T>(collection: string, id: string): Promise<T | null> {
  if (!id) return null;
  const snap = await db().collection(collection).doc(id).get();
  return snap.exists ? (snap.data() as T) : null;
}

async function getMany<T>(collection: string, ids: readonly string[]): Promise<T[]> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return [];
  const col = db().collection(collection);
  const snaps = await db().getAll(...unique.map((id) => col.doc(id)));
  return snaps.filter((s) => s.exists).map((s) => s.data() as T);
}

// --- designs -----------------------------------------------------------------

export const getTokenDesignV1 = (id: string) => getDoc<TokenDesignV1>(TOKEN_DESIGNS_COLLECTION, id);

export async function saveTokenDesignV1(design: TokenDesignV1): Promise<void> {
  await db().collection(TOKEN_DESIGNS_COLLECTION).doc(design.designId).set(design);
}

export async function deleteTokenDesignV1(designId: string): Promise<void> {
  await db().collection(TOKEN_DESIGNS_COLLECTION).doc(designId).delete();
}

export async function listTokenDesignsV1(customerId: string, storeId: string): Promise<TokenDesignV1[]> {
  const snap = await db().collection(TOKEN_DESIGNS_COLLECTION).where("customerId", "==", customerId).get();
  return snap.docs
    .map((d) => d.data() as TokenDesignV1)
    .filter((d) => d.storeId === storeId)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

// --- gallery -----------------------------------------------------------------

export const getTokenGalleryEntryV1 = (id: string) => getDoc<TokenGalleryEntryV1>(TOKEN_GALLERY_COLLECTION, id);

export async function createTokenGalleryEntryV1(entry: TokenGalleryEntryV1): Promise<void> {
  await db().collection(TOKEN_GALLERY_COLLECTION).doc(entry.entryId).create(entry);
}

export async function listTokenGalleryV1(storeId: string): Promise<TokenGalleryEntryV1[]> {
  const snap = await db().collection(TOKEN_GALLERY_COLLECTION).where("storeId", "==", storeId).get();
  return snap.docs.map((d) => d.data() as TokenGalleryEntryV1).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function setTokenGalleryStatusV1(entryId: string, status: TokenGalleryStatusV1, by: string): Promise<void> {
  await db()
    .collection(TOKEN_GALLERY_COLLECTION)
    .doc(entryId)
    .update({ status, reviewedAt: new Date().toISOString(), reviewedBy: by });
}

export async function deleteTokenGalleryEntryV1(entryId: string): Promise<void> {
  await db().collection(TOKEN_GALLERY_COLLECTION).doc(entryId).delete();
}

export async function countTokenGalleryCopyV1(entryId: string): Promise<void> {
  const { FieldValue } = await import("firebase-admin/firestore");
  await db().collection(TOKEN_GALLERY_COLLECTION).doc(entryId).update({ copies: FieldValue.increment(1) });
}

// --- generations -------------------------------------------------------------

export const getTokenGenerationV1 = (id: string) => getDoc<TokenGenerationV1>(TOKEN_GENERATIONS_COLLECTION, id);

export async function createTokenGenerationV1(generation: TokenGenerationV1): Promise<boolean> {
  try {
    await db().collection(TOKEN_GENERATIONS_COLLECTION).doc(generation.generationId).create(generation);
    return true;
  } catch (err) {
    if ((err as { code?: number }).code === 6) return false;
    throw err;
  }
}

/** Read-modify-write a generation in a transaction; `mutate` returns null to skip. */
export async function updateTokenGenerationV1(
  generationId: string,
  mutate: (current: TokenGenerationV1) => TokenGenerationV1 | null,
): Promise<TokenGenerationV1 | null> {
  const ref = db().collection(TOKEN_GENERATIONS_COLLECTION).doc(generationId);
  return db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return null;
    const current = snap.data() as TokenGenerationV1;
    const next = mutate(current);
    if (!next) return current;
    tx.set(ref, { ...next, updatedAt: new Date().toISOString() });
    return next;
  });
}

// --- versions ----------------------------------------------------------------

export const getTokenVersionV1 = (id: string) => getDoc<TokenVersionV1>(TOKEN_VERSIONS_COLLECTION, id);
export const getTokenVersionsV1 = (ids: readonly string[]) => getMany<TokenVersionV1>(TOKEN_VERSIONS_COLLECTION, ids);

export async function saveTokenVersionV1(version: TokenVersionV1): Promise<void> {
  await db().collection(TOKEN_VERSIONS_COLLECTION).doc(version.versionId).set(version);
}

// --- snapshots ---------------------------------------------------------------

export const getTokenSnapshotsV1 = (ids: readonly string[]) => getMany<TokenPrintSnapshotV1>(TOKEN_SNAPSHOTS_COLLECTION, ids);

export async function createTokenSnapshotV1(snapshot: TokenPrintSnapshotV1): Promise<void> {
  await db().collection(TOKEN_SNAPSHOTS_COLLECTION).doc(snapshot.snapshotId).create(snapshot);
}

// --- orders ------------------------------------------------------------------

export const getTokenOrderV1 = (id: string) => getDoc<TokenPrintOrderV1>(TOKEN_ORDERS_COLLECTION, id);

export async function createTokenOrderV1(order: TokenPrintOrderV1): Promise<void> {
  await db().collection(TOKEN_ORDERS_COLLECTION).doc(order.orderId).create(order);
}

export async function updateTokenOrderV1(
  orderId: string,
  mutate: (current: TokenPrintOrderV1) => TokenPrintOrderV1 | null,
): Promise<TokenPrintOrderV1 | null> {
  const ref = db().collection(TOKEN_ORDERS_COLLECTION).doc(orderId);
  return db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return null;
    const current = snap.data() as TokenPrintOrderV1;
    const next = mutate(current);
    if (!next) return current;
    const stamped = { ...next, updatedAt: new Date().toISOString() };
    tx.set(ref, stamped);
    return stamped;
  });
}

export async function listTokenOrdersForStoreV1(storeId: string): Promise<TokenPrintOrderV1[]> {
  const snap = await db().collection(TOKEN_ORDERS_COLLECTION).where("storeId", "==", storeId).get();
  return snap.docs
    .map((d) => d.data() as TokenPrintOrderV1)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

// --- usage limits ------------------------------------------------------------

function utcDay(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** `customerRemaining` is null for customers with no daily limit. */
export type TokenUsageCheckV1 =
  | { ok: true; customerRemaining: number | null }
  | { ok: false; reason: "customer" | "store"; message: string };

/** Only a verified email counts, so signing up with someone else's address grants nothing. */
async function isUnlimitedTokenCustomerV1(customerId: string): Promise<boolean> {
  const allowed = tokenCreatorConfigV1().unlimitedEmails;
  if (!allowed.length) return false;
  const customer = await loadCustomer(customerId).catch(() => null);
  return Boolean(customer?.emailVerified && allowed.includes(customer.email.trim().toLowerCase()));
}

/**
 * Takes `images` from today's allowance for the customer and the store, or
 * takes nothing and says which limit stopped it. One transaction, so two tabs
 * generating at once cannot both slip under the limit.
 */
export async function reserveTokenImagesV1(customerId: string, storeId: string, images: number): Promise<TokenUsageCheckV1> {
  const config = tokenCreatorConfigV1();
  const day = utcDay();
  const col = db().collection(TOKEN_USAGE_COLLECTION);
  const customerRef = col.doc(`customer_${customerId}_${day}`);
  const storeRef = col.doc(`store_${storeId}_${day}`);
  const unlimited = await isUnlimitedTokenCustomerV1(customerId);
  return db().runTransaction(async (tx) => {
    const [customerSnap, storeSnap] = await Promise.all([tx.get(customerRef), tx.get(storeRef)]);
    const customerUsed = (customerSnap.data()?.images as number | undefined) ?? 0;
    const storeUsed = (storeSnap.data()?.images as number | undefined) ?? 0;
    if (unlimited) {
      const at = new Date().toISOString();
      tx.set(customerRef, { customerId, storeId, day, images: customerUsed + images, updatedAt: at }, { merge: true });
      tx.set(storeRef, { storeId, day, images: storeUsed + images, updatedAt: at }, { merge: true });
      return { ok: true as const, customerRemaining: null };
    }
    if (customerUsed + images > config.customerDailyImages) {
      const left = Math.max(0, config.customerDailyImages - customerUsed);
      return {
        ok: false as const,
        reason: "customer" as const,
        message:
          left > 0
            ? `You have ${left} image${left === 1 ? "" : "s"} left today, and this needs ${images}. Your allowance resets at midnight UTC.`
            : `You've used today's ${Math.floor(config.customerDailyImages / 4)} generations. Your allowance resets at midnight UTC.`,
      };
    }
    if (storeUsed + images > config.storeDailyImages) {
      return {
        ok: false as const,
        reason: "store" as const,
        message: "The store has reached today's Token Creator limit. Please try again tomorrow.",
      };
    }
    const at = new Date().toISOString();
    tx.set(customerRef, { customerId, storeId, day, images: customerUsed + images, updatedAt: at }, { merge: true });
    tx.set(storeRef, { storeId, day, images: storeUsed + images, updatedAt: at }, { merge: true });
    return { ok: true as const, customerRemaining: config.customerDailyImages - customerUsed - images };
  });
}

/** Gives back allowance for images that failed, so customers only pay for art they got. */
export async function refundTokenImagesV1(customerId: string, storeId: string, images: number): Promise<void> {
  if (images <= 0) return;
  const day = utcDay();
  const col = db().collection(TOKEN_USAGE_COLLECTION);
  const refs = [col.doc(`customer_${customerId}_${day}`), col.doc(`store_${storeId}_${day}`)];
  await db().runTransaction(async (tx) => {
    const snaps = await Promise.all(refs.map((ref) => tx.get(ref)));
    snaps.forEach((snap, i) => {
      if (!snap.exists) return;
      const used = (snap.data()?.images as number | undefined) ?? 0;
      tx.set(refs[i]!, { images: Math.max(0, used - images) }, { merge: true });
    });
  });
}

export async function tokenImagesRemainingTodayV1(customerId: string): Promise<number | null> {
  const config = tokenCreatorConfigV1();
  if (await isUnlimitedTokenCustomerV1(customerId)) return null;
  const snap = await db().collection(TOKEN_USAGE_COLLECTION).doc(`customer_${customerId}_${utcDay()}`).get();
  const used = (snap.data()?.images as number | undefined) ?? 0;
  return Math.max(0, config.customerDailyImages - used);
}
