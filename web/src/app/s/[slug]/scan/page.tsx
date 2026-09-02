"use client";

import Link from "next/link";
import { useState } from "react";
import { useParams } from "next/navigation";
import { CustomerAuthShell } from "@/components/CustomerAuthShell";
import { StoreBrandMark } from "@/components/StoreBrandMark";
import { useCustomer } from "@/context/CustomerContext";
import { useStoreBranding } from "@/hooks/useStoreBranding";
import {
  createCustomerOrder,
  goToOrderScan,
} from "@/lib/create-customer-order";
import {
  authButton,
  authButtonSecondary,
  authError,
  authHeading,
  authLink,
  authSubtext,
} from "@/lib/customer-auth-ui";

export default function ScanDestinationPage() {
  const { slug } = useParams<{ slug: string }>();
  const { customer, loading: customerLoading } = useCustomer();
  const { storeName, logoUrl, loading: storeLoading, error } = useStoreBranding(slug);
  const [creating, setCreating] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  async function startBuybackOrder() {
    if (!customer) return;
    setCreating(true);
    setActionError(null);
    try {
      const order = await createCustomerOrder(customer.id, slug);
      goToOrderScan(order.id);
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Could not start an order",
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

  if (storeLoading || customerLoading) {
    return (
      <CustomerAuthShell>
        <p className={authSubtext}>Loading…</p>
      </CustomerAuthShell>
    );
  }

  if (!customer) {
    return (
      <CustomerAuthShell>
        <StoreBrandMark
          storeName={storeName ?? ""}
          logoUrl={logoUrl}
          variant="auth"
          subtitle="Scan cards"
        />
        <p className={authSubtext}>
          Scanning needs an account so your cards and any trade credit stay
          with you.
        </p>
        <div className="mt-6 space-y-3">
          <Link
            href={`/sign-in?store=${encodeURIComponent(slug)}&return=1`}
            className={`block ${authButton} no-underline`}
          >
            Sign in
          </Link>
          <Link
            href={`/sign-in?store=${encodeURIComponent(slug)}`}
            className={`block ${authButtonSecondary} no-underline`}
          >
            Create account
          </Link>
        </div>
      </CustomerAuthShell>
    );
  }

  if (!customer.emailVerified) {
    return (
      <CustomerAuthShell>
        <StoreBrandMark
          storeName={storeName ?? ""}
          logoUrl={logoUrl}
          variant="auth"
          subtitle="Scan cards"
        />
        <p className={authSubtext}>
          Verify your email before scanning. Check your inbox for the
          verification link.
        </p>
        <Link href={`/s/${slug}`} className={`mt-6 block text-center ${authLink}`}>
          Back to store
        </Link>
      </CustomerAuthShell>
    );
  }

  return (
    <CustomerAuthShell>
      <StoreBrandMark
        storeName={storeName ?? ""}
        logoUrl={logoUrl}
        variant="auth"
        subtitle="Scan cards"
      />

      <h1 className={authHeading}>Where should these cards go?</h1>
      <p className={`mt-3 ${authSubtext}`}>
        Pick a destination now. Cards you keep can be sent to the store later
        without scanning them again.
      </p>

      {actionError && <p className={`mt-6 ${authError}`}>{actionError}</p>}

      <div className="mt-8 space-y-6">
        <div className="border border-neutral-700 p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-white">
            Sell to the store
          </h2>
          <p className={`mt-2 mb-4 ${authSubtext}`}>
            {storeName ?? "The store"} reviews each card and pays you in cash
            or trade credit.
          </p>
          <button
            type="button"
            className={authButton}
            disabled={creating}
            onClick={() => void startBuybackOrder()}
          >
            {creating ? "Starting…" : "Start a buyback order"}
          </button>
        </div>

        <div className="border border-neutral-700 p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-white">
            Add to my collection
          </h2>
          <p className={`mt-2 mb-4 ${authSubtext}`}>
            Keep the cards. They go in your binder here, and Magic cards can be
            used to build decks.
          </p>
          <Link
            href={`/s/${slug}/collection/scan`}
            className={`block ${authButtonSecondary} no-underline`}
          >
            Scan into my collection
          </Link>
        </div>
      </div>

      <Link href={`/s/${slug}`} className={`mt-8 block text-center ${authLink}`}>
        Back to store
      </Link>
    </CustomerAuthShell>
  );
}
