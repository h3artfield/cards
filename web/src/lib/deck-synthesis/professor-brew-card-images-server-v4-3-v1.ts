/**
 * Server-only Professor brew card image resolution.
 *
 * Our own printing catalog (`catalogCards`, one doc per Scryfall printing)
 * already carries each printing's CDN image, so that is read first. Scryfall's
 * API is the fallback for names the catalog does not have: it allows about ten
 * requests a second, and a deck is a hundred names, which is how a grid ended
 * up with a third of its images refused.
 */
import { COLLECTIONS } from "../firebase/collections";
import { getAdminFirestore } from "../firebase/admin";
import { scryfallFetch } from "../processing/scryfall-client";
import {
  pickScryfallCardImageUrl,
  scryfallNamedImageUrl,
} from "./professor-brew-scryfall-images-v1";

export const PROFESSOR_BREW_CARD_IMAGES_SERVER_V4_3_V1_VERSION =
  "professor-brew-card-images-server-v4-3-v1";

/** Card images never change for a name, so a process-lifetime cache is safe. */
const catalogImageCache = new Map<string, string | null>();

async function catalogImageUrl(name: string): Promise<string | null> {
  if (catalogImageCache.has(name)) return catalogImageCache.get(name) ?? null;
  const db = getAdminFirestore();
  if (!db) return null;
  const col = db.collection(COLLECTIONS.catalogCards);
  try {
    const pick = (docs: FirebaseFirestore.QueryDocumentSnapshot[]) =>
      docs.map((doc) => doc.get("imageNormal") as string | undefined).find(Boolean) ?? null;
    let url = pick((await col.where("name", "==", name).select("imageNormal").limit(3).get()).docs);
    // A deck often names a double-faced card by its front face alone, while
    // the printing is stored under "Front // Back".
    if (!url && !name.includes("//")) {
      const prefix = `${name} // `;
      url = pick(
        (
          await col
            .where("name", ">=", prefix)
            .where("name", "<", `${prefix}\uf8ff`)
            .select("imageNormal")
            .limit(3)
            .get()
        ).docs,
      );
    }
    catalogImageCache.set(name, url);
    return url;
  } catch {
    return null;
  }
}

async function scryfallImageUrl(trimmed: string): Promise<string> {
  try {
    const exactRes = await scryfallFetch(
      `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(trimmed)}`,
    );
    if (exactRes.ok) {
      const card = (await exactRes.json()) as Parameters<typeof pickScryfallCardImageUrl>[0];
      const picked = pickScryfallCardImageUrl(card);
      if (picked) return picked;
    }
    const fuzzyRes = await scryfallFetch(
      `https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(trimmed)}`,
    );
    if (fuzzyRes.ok) {
      const card = (await fuzzyRes.json()) as Parameters<typeof pickScryfallCardImageUrl>[0];
      const picked = pickScryfallCardImageUrl(card);
      if (picked) return picked;
    }
  } catch {
    /* fall through to redirect URL */
  }
  return scryfallNamedImageUrl(trimmed, true);
}

export async function resolveProfessorBrewCardImageUrl(cardName: string): Promise<string> {
  const trimmed = cardName.trim();
  if (!trimmed) return scryfallNamedImageUrl("Plains");
  return (await catalogImageUrl(trimmed)) ?? scryfallImageUrl(trimmed);
}

export async function resolveProfessorBrewCardImageMap(
  cardNames: string[],
): Promise<Record<string, string>> {
  const unique = [...new Set(cardNames.map((n) => n.trim()).filter(Boolean))];
  const fromCatalog = await Promise.all(unique.map(async (name) => [name, await catalogImageUrl(name)] as const));
  const out: Record<string, string> = {};
  const misses: string[] = [];
  for (const [name, url] of fromCatalog) {
    if (url) out[name] = url;
    else misses.push(name);
  }
  // The few the catalog lacks go to Scryfall one at a time, inside its limit.
  for (const name of misses) out[name] = await scryfallImageUrl(name);
  return out;
}
