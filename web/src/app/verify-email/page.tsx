"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { apiFetch } from "@/lib/api-client";
import { authHeading, authSubtext, authLink } from "@/lib/customer-auth-ui";
import { SignInShell } from "@/app/sign-in/SignInShell";
import { useCustomer } from "@/context/CustomerContext";
import { STORE_SLUG_SESSION_KEY } from "@/lib/store-slug";
import type { BuybackOrder } from "@/lib/types";

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const { refresh } = useCustomer();
  const [status, setStatus] = useState<"loading" | "redirecting" | "error">("loading");

  useEffect(() => {
    if (!token) {
      setStatus("error");
      return;
    }

    apiFetch<{ verified: boolean; storeSlug?: string }>(
      "/api/customers/verify-email",
      {
        method: "POST",
        body: JSON.stringify({ token }),
      },
    )
      .then(async (data) => {
        setStatus("redirecting");
        await refresh();

        let storeSlug = data.storeSlug;
        if (!storeSlug) {
          try {
            storeSlug = sessionStorage.getItem(STORE_SLUG_SESSION_KEY) ?? undefined;
          } catch {
            /* ignore */
          }
        }

        const { order } = await apiFetch<{ order: BuybackOrder }>("/api/orders", {
          method: "POST",
          body: JSON.stringify({
            ...(storeSlug ? { storeSlug } : {}),
          }),
        });

        window.location.assign(`/order/${order.id}/scan`);
      })
      .catch(() => setStatus("error"));
  }, [token, refresh]);

  if (status === "loading" || status === "redirecting") {
    return (
      <SignInShell>
        <h1 className={authHeading}>Verifying your email</h1>
        <p className={`mt-3 ${authSubtext}`}>
          {status === "redirecting"
            ? "Email verified. Starting your buyback…"
            : "Please wait…"}
        </p>
      </SignInShell>
    );
  }

  return (
    <SignInShell>
      <h1 className={authHeading}>Verification failed</h1>
      <p className={`mt-3 ${authSubtext}`}>
        This link is invalid or expired. Sign in and request a new verification
        email.
      </p>
      <Link href="/sign-in?return=1" className={`mt-6 block text-center ${authLink}`}>
        Sign in
      </Link>
    </SignInShell>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense
      fallback={
        <SignInShell>
          <p className={authSubtext}>Loading…</p>
        </SignInShell>
      }
    >
      <VerifyEmailContent />
    </Suspense>
  );
}
