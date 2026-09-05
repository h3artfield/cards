"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useCustomer } from "@/context/CustomerContext";
import { CustomerTradeCreditPanel } from "@/components/CustomerTradeCreditPanel";
import { OrderStatusBadge } from "@/components/OrderStatusBadge";
import { Button } from "@/components/Button";
import { StoreBrandMark } from "@/components/StoreBrandMark";
import { usePublicStoreBranding } from "@/hooks/usePublicStoreBranding";
import { useStoreHomeHref } from "@/hooks/useStoreHomeHref";
import { glassLink } from "@/lib/glass-styles";
import { STORE_SLUG_SESSION_KEY } from "@/lib/store-slug";
import {
  createCustomerOrder,
  goToOrderScan,
} from "@/lib/create-customer-order";
import type { BuybackOrder } from "@/lib/types";
import type { CustomerSavedDeck } from "@/lib/customer-saved-decks/customer-saved-deck-store";

function readStoredStoreSlug(): string | null {
  try {
    return sessionStorage.getItem(STORE_SLUG_SESSION_KEY);
  } catch {
    return null;
  }
}

export default function OrdersPage() {
  const {
    customer,
    store,
    loading: customerLoading,
    canViewOrderHistory,
  } = useCustomer();
  const [orders, setOrders] = useState<BuybackOrder[]>([]);
  const [savedDecks, setSavedDecks] = useState<CustomerSavedDeck[]>([]);
  const [ordersLoaded, setOrdersLoaded] = useState(false);
  const [accessError, setAccessError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  // Which store the visitor came from is browser-only state, so it is read
  // through an external store rather than mirrored into React state.
  const storedSlug = useSyncExternalStore(
    () => () => {},
    readStoredStoreSlug,
    () => null,
  );

  const slug = store?.slug ?? storedSlug;
  const signInHref = slug
    ? `/sign-in?store=${encodeURIComponent(slug)}&return=1`
    : "/sign-in?return=1";
  const loading = customerLoading || (Boolean(customer) && !ordersLoaded);

  useEffect(() => {
    if (customerLoading || !customer) return;

    const storeQuery = slug ? `&store=${encodeURIComponent(slug)}` : "";
    fetch(`/api/orders?customerId=${customer.id}${storeQuery}`, {
      credentials: "include",
    })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) {
          setAccessError(d.error ?? "Could not load orders");
          return;
        }
        setOrders(d.orders ?? []);
      })
      .finally(() => setOrdersLoaded(true));

    fetch(`/api/customers/decks${storeQuery ? storeQuery.replace("&", "?") : ""}`, {
      credentials: "include",
    })
      .then(async (r) => {
        if (!r.ok) return;
        const d = (await r.json()) as { decks?: CustomerSavedDeck[] };
        setSavedDecks(d.decks ?? []);
      })
      .catch(() => {});
  }, [customer, customerLoading, slug]);

  async function handleCreateOrder() {
    if (!customer) return;
    setCreating(true);
    try {
      const order = await createCustomerOrder(customer.id, slug);
      goToOrderScan(order.id);
    } finally {
      setCreating(false);
    }
  }

  if (loading) {
    return <PageShell>Loading account...</PageShell>;
  }

  if (!customer) {
    return (
      <PageShell>
        <p className="text-[var(--text)]">Sign in to view your account.</p>
        <Link href={signInHref}>
          <Button fullWidth className="mt-4">
            Sign in
          </Button>
        </Link>
      </PageShell>
    );
  }

  if (!canViewOrderHistory || accessError) {
    return (
      <PageShell>
        <h1 className="text-2xl font-bold">Verify your email</h1>
        <p className="mt-2 text-sm text-[var(--text)]">
          {accessError ??
            "Verify your email to view your order history and manage submissions."}
        </p>
        <p className="mt-1 text-sm text-[var(--text)]">{customer.email}</p>
        <Link href="/verify-email">
          <Button fullWidth className="mt-6" variant="glassSecondary">
            I verified — refresh
          </Button>
        </Link>
        <Link href={signInHref.replace("return=1", "")}>
          <Button fullWidth className="mt-3">
            Back to store
          </Button>
        </Link>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <h1 className="text-2xl font-bold">Account</h1>
      <p className="mt-1 text-sm text-[var(--text)]">
        {customer.firstName} {customer.lastName} · {customer.email}
      </p>

      <Button
        fullWidth
        className="mt-6"
        disabled={creating}
        onClick={() => void handleCreateOrder()}
      >
        {creating ? "Starting…" : "Create another order"}
      </Button>

      {store ? (
        <>
          <Link
            href={`/s/${store.slug}/collection`}
            className="mt-3 block rounded-xl border border-[var(--line-subtle)] bg-[var(--ink-800)] p-4 text-center text-sm font-medium text-[var(--text-hi)] hover:border-[var(--accent-lo)]"
          >
            My collection
          </Link>
          <CustomerTradeCreditPanel slug={store.slug} />
        </>
      ) : null}

      <h2 className="mt-8 text-sm font-semibold uppercase tracking-wide text-[var(--text-lo)]">
        Your Commander decks
      </h2>
      {savedDecks.length === 0 ? (
        <p className="mt-4 text-[var(--text-lo)]">No saved decks yet. Build one from store inventory.</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {savedDecks.map((deck) => (
            <li key={deck.id}>
              <Link
                href={`/s/${deck.storeSlug}/inventory/professor/build?buildId=${encodeURIComponent(deck.buildId)}`}
                className="block rounded-xl border border-[var(--line-subtle)] bg-[var(--ink-800)] p-4 hover:border-[var(--accent-lo)]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-[var(--text-hi)]">{deck.deckName}</p>
                    <p className="mt-1 text-xs text-[var(--text-lo)]">
                      Bracket {deck.bracket} · {new Date(deck.updatedAt).toLocaleDateString()}
                    </p>
                  </div>
                  {deck.grade ? (
                    <span className="rounded-full bg-[var(--accent-wash)] px-2.5 py-1 text-xs font-bold text-[var(--accent-hi)]">
                      {deck.grade.split(/[\s(]/)[0]}
                    </span>
                  ) : null}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <h2 className="mt-8 text-sm font-semibold uppercase tracking-wide text-[var(--text-lo)]">
        Your orders
      </h2>

      {orders.length === 0 ? (
        <p className="mt-4 text-[var(--text-lo)]">No orders yet.</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {orders.map((order) => (
            <li key={order.id}>
              <Link
                href={`/order/${order.id}`}
                className="block rounded-xl border border-[var(--line-subtle)] bg-[var(--ink-800)] p-4 hover:border-[var(--accent-lo)]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-[var(--text-lo)]">
                      Order number
                    </p>
                    <p className="font-mono text-lg font-bold text-[var(--text-hi)]">
                      {order.orderNumber}
                    </p>
                  </div>
                  <OrderStatusBadge status={order.status} />
                </div>
                <p className="mt-2 text-xs text-[var(--text-lo)]">
                  Submitted {new Date(order.submittedAt ?? order.createdAt).toLocaleString()}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </PageShell>
  );
}

function PageShell({ children }: { children: React.ReactNode }) {
  const { branding } = usePublicStoreBranding();
  const homeHref = useStoreHomeHref();

  // This page had no background of its own, so it rendered on the browser
  // default white while the rest of the customer journey was dark. The `compact`
  // brand mark it used pairs dark text with a white glow for light grounds and
  // would have disappeared here, so it moves to the shared `auth` lockup.
  return (
    <div className="storefront-theme min-h-screen bg-[var(--ink-850)] text-[var(--text)]">
      <div className="mx-auto max-w-lg px-6 py-10">
        <StoreBrandMark
          storeName={branding.storeName}
          logoUrl={branding.storeLogoUrl}
          variant="auth"
          subtitle="Account"
        />
        <div>{children}</div>
        <Link
          href={homeHref}
          className={`mt-8 block text-center text-sm ${glassLink}`}
        >
          Back to home
        </Link>
      </div>
    </div>
  );
}
