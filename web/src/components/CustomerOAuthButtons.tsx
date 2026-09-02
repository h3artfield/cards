"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { authButtonSecondary } from "@/lib/customer-auth-ui";
import { STORE_SLUG_SESSION_KEY } from "@/lib/store-slug";
import { normalizeDeckBuildRedirectPath } from "@/lib/store-inventory/deck-build-auth";

export function CustomerOAuthButtons({
  storeSlug: storeSlugProp,
  redirectPath,
  className = "",
}: {
  storeSlug?: string | null;
  redirectPath?: string | null;
  className?: string;
}) {
  const [storeSlug, setStoreSlug] = useState(storeSlugProp ?? null);
  const [googleEnabled, setGoogleEnabled] = useState(false);

  useEffect(() => {
    if (storeSlugProp) {
      setStoreSlug(storeSlugProp);
      return;
    }
    try {
      const stored = sessionStorage.getItem(STORE_SLUG_SESSION_KEY);
      if (stored) setStoreSlug(stored);
    } catch {
      /* ignore */
    }
  }, [storeSlugProp]);

  useEffect(() => {
    if (!storeSlug) return;
    fetch(`/api/store/${encodeURIComponent(storeSlug)}`)
      .then(async (r) => {
        const data = await r.json();
        if (r.ok) {
          setGoogleEnabled(Boolean(data.auth?.googleEnabled));
        }
      })
      .catch(() => {});
  }, [storeSlug]);

  if (!googleEnabled || !storeSlug) return null;

  const safeRedirect = redirectPath
    ? normalizeDeckBuildRedirectPath(redirectPath) ?? redirectPath
    : null;
  const params = new URLSearchParams({ store: storeSlug });
  if (safeRedirect) params.set("redirect", safeRedirect);
  const googleHref = `/api/auth/google?${params.toString()}`;

  return (
    <div className={`space-y-3 ${className}`.trim()}>
      <Link
        href={googleHref}
        className={`block text-center no-underline ${authButtonSecondary}`}
      >
        Continue with Google
      </Link>
    </div>
  );
}
