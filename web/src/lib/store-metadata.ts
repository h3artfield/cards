import type { Metadata } from "next";
import { resolveStoreBySlug } from "./deck-builder/deck-builder-service";

export async function storeNameForSlug(slug: string): Promise<string | null> {
  try {
    const store = await resolveStoreBySlug(slug);
    return store?.storeName?.trim() || null;
  } catch {
    return null;
  }
}

/** Public store pages must never show the platform's own brand. */
export function storePublicMetadata(input: {
  storeName: string | null;
  title?: string;
  description?: string;
}): Metadata {
  const storeName = input.storeName ?? "Card shop";
  const title = input.title ?? `${storeName} — Singles`;
  const description =
    input.description ??
    `Browse ${storeName}'s trading card singles in stock — prices, conditions, and quantities on hand.`;
  return {
    title,
    description,
    applicationName: storeName,
    openGraph: {
      title,
      description,
      siteName: storeName,
      type: "website",
    },
    twitter: {
      card: "summary",
      title,
      description,
    },
  };
}
