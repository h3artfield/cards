"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CustomerAuthShell } from "@/components/CustomerAuthShell";
import { StoreBrandMark } from "@/components/StoreBrandMark";
import { useCustomer } from "@/context/CustomerContext";
import {
  authButton,
  authButtonSecondary,
  authError,
  authSubtext,
} from "@/lib/customer-auth-ui";
import { googleAuthErrorMessage } from "@/lib/customer-auth-config";
import { STORE_SLUG_SESSION_KEY } from "@/lib/store-slug";

type StoreAuthConfig = {
  googleEnabled: boolean;
  appleEnabled: boolean;
};

type StoreHomePageProps = {
  slug: string;
  storeName: string;
  logoUrl?: string | null;
  loading?: boolean;
  error?: string | null;
};

export function StoreHomePage({
  slug,
  storeName,
  logoUrl,
  loading = false,
  error = null,
}: StoreHomePageProps) {
  const { customer, loading: customerLoading, logout, canViewOrderHistory, refresh } =
    useCustomer();
  const [actionError, setActionError] = useState<string | null>(null);
  const [authConfig, setAuthConfig] = useState<StoreAuthConfig>({
    googleEnabled: false,
    appleEnabled: false,
  });

  useEffect(() => {
    if (!slug) return;
    try {
      sessionStorage.setItem(STORE_SLUG_SESSION_KEY, slug);
    } catch {
      /* ignore */
    }
  }, [slug]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const authError = params.get("auth_error");
    const signedIn = params.get("signed_in");

    if (authError) {
      setActionError(googleAuthErrorMessage(authError));
      params.delete("auth_error");
      const qs = params.toString();
      window.history.replaceState(
        {},
        "",
        `${window.location.pathname}${qs ? `?${qs}` : ""}`,
      );
    }

    if (signedIn) {
      void refresh().finally(() => {
        params.delete("signed_in");
        const qs = params.toString();
        window.history.replaceState(
          {},
          "",
          `${window.location.pathname}${qs ? `?${qs}` : ""}`,
        );
      });
    }
  }, [refresh]);

  useEffect(() => {
    fetch(`/api/store/${encodeURIComponent(slug)}`)
      .then(async (r) => {
        const data = await r.json();
        if (r.ok) {
          setAuthConfig({
            googleEnabled: Boolean(data.auth?.googleEnabled),
            appleEnabled: Boolean(data.auth?.appleEnabled),
          });
        }
      })
      .catch(() => {});
  }, [slug]);

  const signInEmail = `/sign-in?store=${encodeURIComponent(slug)}`;
  const signInReturn = `/sign-in?store=${encodeURIComponent(slug)}&return=1`;

  if (error) {
    return (
      <CustomerAuthShell>
        <p className={authError}>{error}</p>
      </CustomerAuthShell>
    );
  }

  if (loading || customerLoading) {
    return (
      <CustomerAuthShell>
        <p className={authSubtext}>Loading…</p>
      </CustomerAuthShell>
    );
  }

  const loggedIn = Boolean(customer);

  return (
    <CustomerAuthShell wide>
      <StoreBrandMark
        storeName={storeName}
        logoUrl={logoUrl}
        variant="auth"
        subtitle={loggedIn ? "Welcome back" : "Sell your cards"}
      />

      {loggedIn && customer && (
        <div className="mt-8 text-center">
          <p className="text-sm text-white">
            {customer.firstName} {customer.lastName}
          </p>
          <p className="mt-1 text-xs text-neutral-500">{customer.email}</p>
        </div>
      )}

      {actionError && <p className={`mt-8 ${authError}`}>{actionError}</p>}

      <div className="mt-10 space-y-3">
        {loggedIn ? (
          <>
            <Link
              href={`/s/${slug}/inventory`}
              className={`block ${authButtonSecondary} text-center no-underline`}
            >
              Shop
            </Link>
            <Link
              href={`/s/${slug}/calendar`}
              className={`block ${authButtonSecondary} text-center no-underline`}
            >
              Events
            </Link>
            <Link
              href={`/s/${slug}/decks`}
              className={`block ${authButtonSecondary} text-center no-underline`}
            >
              Decks
            </Link>
            <Link
              href={`/s/${slug}/collection`}
              className={`block ${authButtonSecondary} text-center no-underline`}
            >
              Collection
            </Link>
            {canViewOrderHistory && (
              <Link href="/orders" className={`block ${authButtonSecondary} text-center no-underline`}>
                Orders
              </Link>
            )}
            <button type="button" className={authButtonSecondary} onClick={() => void logout()}>
              Sign out
            </button>
          </>
        ) : (
          <>
            <Link
              href={`/s/${slug}/inventory`}
              className={`block ${authButtonSecondary} text-center no-underline`}
            >
              Shop
            </Link>
            <Link
              href={`/s/${slug}/calendar`}
              className={`block ${authButtonSecondary} text-center no-underline`}
            >
              Events
            </Link>
            {authConfig.googleEnabled && (
              <Link
                href={`/api/auth/google?store=${encodeURIComponent(slug)}`}
                className={`block ${authButton} text-center no-underline`}
              >
                Continue with Google
              </Link>
            )}
            {authConfig.appleEnabled && (
              <Link
                href={`/api/auth/apple?store=${encodeURIComponent(slug)}`}
                className={`block ${authButtonSecondary} text-center no-underline`}
              >
                Continue with Apple
              </Link>
            )}
            <Link href={signInEmail} className={`block ${authButton} text-center no-underline`}>
              Create account
            </Link>
            <Link href={signInReturn} className={`block ${authButtonSecondary} text-center no-underline`}>
              Sign in
            </Link>
          </>
        )}
      </div>
    </CustomerAuthShell>
  );
}
