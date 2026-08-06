"use client";

import { useEffect, useState } from "react";
import { STORE_SLUG_SESSION_KEY } from "@/lib/store-slug";

export type PublicStoreBranding = {
  storeName: string;
  storeSlug: string;
  storeLogoUrl?: string;
};

const GENERIC: PublicStoreBranding = {
  storeName: "Card Shop Buyback",
  storeSlug: "",
};

export function usePublicStoreBranding() {
  const [branding, setBranding] = useState<PublicStoreBranding>(GENERIC);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let slug: string | null = null;
    try {
      slug = sessionStorage.getItem(STORE_SLUG_SESSION_KEY);
    } catch {
      /* ignore */
    }

    if (!slug) {
      setBranding(GENERIC);
      setLoading(false);
      return;
    }

    fetch(`/api/store/${encodeURIComponent(slug)}`)
      .then(async (r) => {
        if (!r.ok) throw new Error("Store not found");
        const d = await r.json();
        setBranding({
          storeName: d.store.name,
          storeSlug: d.store.slug,
          storeLogoUrl: d.store.logoUrl ?? undefined,
        });
      })
      .catch(() => setBranding(GENERIC))
      .finally(() => setLoading(false));
  }, []);

  return { branding, loading };
}
