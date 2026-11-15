"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useCustomer } from "@/context/CustomerContext";
import {
  deckBuildSignInHref,
  normalizeDeckBuildRedirectPath,
} from "@/lib/store-inventory/deck-build-auth";

export function RequireCustomerForDeckBuild({
  slug,
  returnPath,
  signedOutHref,
  children,
}: {
  slug: string;
  returnPath: string;
  /** When set, a signed-out visitor goes here instead of the store sign-in form. */
  signedOutHref?: string;
  children: React.ReactNode;
}) {
  const { customer, loading } = useCustomer();
  const router = useRouter();

  useEffect(() => {
    if (loading || customer) return;
    const safePath = normalizeDeckBuildRedirectPath(returnPath) ?? returnPath;
    router.replace(signedOutHref ?? deckBuildSignInHref(slug, safePath));
  }, [customer, loading, returnPath, router, signedOutHref, slug]);

  if (loading || !customer) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center bg-neutral-950 text-neutral-400">
        <p className="text-sm">Checking sign-in…</p>
      </div>
    );
  }

  return <>{children}</>;
}
