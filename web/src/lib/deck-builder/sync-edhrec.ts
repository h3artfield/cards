import { v4 as uuidv4 } from "uuid";
import {
  fetchEdhrecCommanderMeta,
  fetchEdhrecTopCommanders,
  sleep,
} from "./edhrec-client";
import { importScryfallCardsBatch } from "./scryfall-catalog";
import type { EdhrecCommanderMeta, CatalogCard } from "./types";

export async function syncEdhrecCommandersBatch(input: {
  slugs: string[];
  saveMeta: (meta: EdhrecCommanderMeta) => Promise<void>;
  saveCatalogCard: (card: CatalogCard) => Promise<void>;
  /** When false, only cache the commander card — not every EDHREC staple (much faster bulk sync). */
  importRecommendationCards?: boolean;
  onProgress?: (msg: string) => void;
}): Promise<{ synced: number; failed: number }> {
  let synced = 0;
  let failed = 0;
  const importRecs = input.importRecommendationCards ?? false;

  for (const slug of input.slugs) {
    input.onProgress?.(`Syncing ${slug}…`);
    const meta = await fetchEdhrecCommanderMeta(slug);
    if (!meta) {
      failed += 1;
      await sleep(1000);
      continue;
    }
    await input.saveMeta(meta);

    const scryfallIds = importRecs
      ? [
          ...(meta.scryfallId ? [meta.scryfallId] : []),
          ...meta.recommendations.map((r) => r.scryfallId),
        ]
      : meta.scryfallId
        ? [meta.scryfallId]
        : [];

    if (scryfallIds.length > 0) {
      await importScryfallCardsBatch(scryfallIds, async (card) => {
        await input.saveCatalogCard(card);
      });
    }

    synced += 1;
    await sleep(1000);
  }

  return { synced, failed };
}

export async function syncEdhrecTopCommandersBatch(input: {
  limit: number;
  offset: number;
  batchSize: number;
  saveMeta: (meta: EdhrecCommanderMeta) => Promise<void>;
  saveCatalogCard: (card: CatalogCard) => Promise<void>;
  importRecommendationCards?: boolean;
}): Promise<{ synced: number; failed: number; remaining: number; slugs: string[] }> {
  const top = await fetchEdhrecTopCommanders(input.limit);
  const slice = top.slice(input.offset, input.offset + input.batchSize);
  const slugs = slice.map((c) => c.slug);

  const result = await syncEdhrecCommandersBatch({
    slugs,
    saveMeta: input.saveMeta,
    saveCatalogCard: input.saveCatalogCard,
    importRecommendationCards: input.importRecommendationCards,
  });

  return {
    ...result,
    remaining: Math.max(0, top.length - input.offset - slice.length),
    slugs,
  };
}

export async function syncEdhrecTheme(input: {
  commanderSlug: string;
  themeSlug: string;
  saveMeta: (meta: EdhrecCommanderMeta) => Promise<void>;
  saveCatalogCard: (card: CatalogCard) => Promise<void>;
}): Promise<EdhrecCommanderMeta | null> {
  const meta = await fetchEdhrecCommanderMeta(
    input.commanderSlug,
    input.themeSlug,
  );
  if (!meta) return null;
  await input.saveMeta(meta);
  const ids = meta.recommendations.map((r) => r.scryfallId);
  if (meta.scryfallId) ids.unshift(meta.scryfallId);
  await importScryfallCardsBatch(ids, input.saveCatalogCard);
  return meta;
}

export function newSyncRunId(): string {
  return uuidv4();
}
