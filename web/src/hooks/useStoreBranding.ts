"use client";

import { useEffect, useState } from "react";

export type StoreBranding = {
  storeName: string | null;
  logoUrl: string | null;
  loading: boolean;
  error: string | null;
};

/** Branding for a known store slug — for customer pages under /s/[slug]. */
export function useStoreBranding(slug: string | null | undefined) {
  const [branding, setBranding] = useState<StoreBranding>(() => ({
    storeName: null,
    logoUrl: null,
    loading: Boolean(slug),
    error: null,
  }));

  useEffect(() => {
    if (!slug) return;

    let active = true;
    fetch(`/api/store/${encodeURIComponent(slug)}`)
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error ?? "Store not found");
        if (!active) return;
        setBranding({
          storeName: data.store.name,
          logoUrl: data.store.logoUrl ?? null,
          loading: false,
          error: null,
        });
      })
      .catch((err) => {
        if (!active) return;
        setBranding({
          storeName: null,
          logoUrl: null,
          loading: false,
          error: err instanceof Error ? err.message : "Store not found",
        });
      });

    return () => {
      active = false;
    };
  }, [slug]);

  return branding;
}
