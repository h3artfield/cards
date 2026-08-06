"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CustomerAuthShell } from "@/components/CustomerAuthShell";
import { StoreBrandMark } from "@/components/StoreBrandMark";
import { useCustomer } from "@/context/CustomerContext";
import {
  createCustomerOrder,
  goToOrderScan,
} from "@/lib/create-customer-order";
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
  const [creating, setCreating] = useState(false);
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

  async function startNewOrder() {
    if (!customer?.emailVerified) return;
    setCreating(true);
    setActionError(null);
    try {
      const order = await createCustomerOrder(customer.id, slug);
      goToOrderScan(order.id);
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Could not create order",
      );
      setCreating(false);
    }
  }

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
    <CustomerAuthShell>
      <StoreBrandMark
        storeName={storeName}
        logoUrl={logoUrl}
        variant="auth"
        subtitle={loggedIn ? "Welcome back" : "Sell your cards"}
      />

      <p className={`-mt-4 mb-8 text-center text-sm text-neutral-400`}>
        Selling cards to {storeName}
      </p>

      {loggedIn && customer && (
        <div className="mb-8 text-center">
          <p className="text-sm text-white">
            {customer.firstName} {customer.lastName}
          </p>
          <p className="text-xs text-neutral-500">{customer.email}</p>
        </div>
      )}

      {actionError && <p className={`mb-4 ${authError}`}>{actionError}</p>}

      <div className="space-y-3">
        {loggedIn ? (
          <>
            <Link
              href={`/s/${slug}/inventory`}
              className={`block ${authButtonSecondary} text-center no-underline`}
            >
              Browse store inventory
            </Link>
            <Link
              href={`/s/${slug}/inventory?mode=deck-builder`}
              className={`block ${authButtonSecondary} text-center no-underline`}
            >
              Build a Commander deck
            </Link>
            {!customer?.emailVerified ? (
              <p className={`mb-2 ${authSubtext}`}>
                Verify your email before scanning. Check your inbox for the
                verification link.
              </p>
            ) : (
              <button
                type="button"
                className={authButton}
                disabled={creating}
                onClick={() => void startNewOrder()}
              >
                {creating ? "Starting…" : "Start scanning cards"}
              </button>
            )}
            {canViewOrderHistory && customer?.emailVerified && (
              <Link href="/orders" className={`block ${authButtonSecondary} text-center no-underline`}>
                View my orders
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
              Browse store inventory
            </Link>
            <Link
              href={`/s/${slug}/inventory?mode=deck-builder`}
              className={`block ${authButtonSecondary} text-center no-underline`}
            >
              Build a Commander deck
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
