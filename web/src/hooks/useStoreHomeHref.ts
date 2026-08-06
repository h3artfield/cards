"use client";

import { useEffect, useState } from "react";
import { STORE_SLUG_SESSION_KEY, storeEntryPath } from "@/lib/store-slug";

/** Customer home — store landing when slug is known, else platform home. */
export function useStoreHomeHref(): string {
  const [href, setHref] = useState("/");

  useEffect(() => {
    try {
      const slug = sessionStorage.getItem(STORE_SLUG_SESSION_KEY);
      if (slug) setHref(storeEntryPath(slug));
    } catch {
      /* ignore */
    }
  }, []);

  return href;
}
