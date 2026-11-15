import type { Metadata } from "next";
import { resolveStoreBySlug } from "@/lib/deck-builder/deck-builder-service";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { COLLECTIONS } from "@/lib/firebase/collections";
import { isCardLinkKeyV1 } from "@/lib/inventory/card-link-key";
import { storePublicMetadata } from "@/lib/store-metadata";
import type { InventoryItem } from "@/lib/types";

async function cardNameForKey(storeId: string, key: string): Promise<string | null> {
  const db = getAdminFirestore();
  if (!db || !isCardLinkKeyV1(key)) return null;
  const snap = await db
    .collection(COLLECTIONS.inventory)
    .where("storeId", "==", storeId)
    .where("cardLinkKey", "==", key)
    .limit(1)
    .get();
  const item = snap.docs[0]?.data() as InventoryItem | undefined;
  if (!item) return null;
  return (
    item.productName?.trim() ||
    item.displayName?.split(" — ")[0]?.trim() ||
    null
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; key: string }>;
}): Promise<Metadata> {
  const { slug, key } = await params;
  const store = await resolveStoreBySlug(slug).catch(() => null);
  const storeName = store?.storeName?.trim() || null;
  const cardName = store
    ? await cardNameForKey(store.id, key.trim().toLowerCase()).catch(() => null)
    : null;
  if (!cardName) return storePublicMetadata({ storeName });
  return storePublicMetadata({
    storeName,
    title: `${cardName} — ${storeName ?? "Singles"}`,
    description: `${cardName} in stock at ${storeName ?? "our shop"}. See price, condition, and quantity on hand.`,
  });
}

export default function CardLinkLayout({ children }: { children: React.ReactNode }) {
  return children;
}
