"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useCustomer } from "@/context/CustomerContext";
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

export default function OrdersPage() {
  const { customer, loading: customerLoading, canViewOrderHistory } = useCustomer();
  const [orders, setOrders] = useState<BuybackOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [accessError, setAccessError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [signInHref, setSignInHref] = useState("/sign-in?return=1");

  useEffect(() => {
    try {
      const slug = sessionStorage.getItem(STORE_SLUG_SESSION_KEY);
      if (slug) {
        setSignInHref(
          `/sign-in?store=${encodeURIComponent(slug)}&return=1`,
        );
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (customerLoading) return;
    if (!customer) {
      setLoading(false);
      return;
    }
    let storeQuery = "";
    try {
      const slug = sessionStorage.getItem(STORE_SLUG_SESSION_KEY);
      if (slug) storeQuery = `&store=${encodeURIComponent(slug)}`;
    } catch {
      /* ignore */
    }
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
      .finally(() => setLoading(false));
  }, [customer, customerLoading]);

  async function handleCreateOrder() {
    if (!customer) return;
    setCreating(true);
    try {
      let storeSlug: string | null = null;
      try {
        storeSlug = sessionStorage.getItem(STORE_SLUG_SESSION_KEY);
      } catch {
        /* ignore */
      }
      const order = await createCustomerOrder(customer.id, storeSlug);
      goToOrderScan(order.id);
    } finally {
      setCreating(false);
    }
  }

  if (customerLoading || loading) {
    return <PageShell>Loading account...</PageShell>;
  }

  if (!customer) {
    return (
      <PageShell>
        <p className="text-gray-600">Sign in to view your account.</p>
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
        <p className="mt-2 text-sm text-gray-600">
          {accessError ??
            "Verify your email to view your order history and manage submissions."}
        </p>
        <p className="mt-1 text-sm text-gray-600">{customer.email}</p>
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
      <p className="mt-1 text-sm text-gray-600">
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

      <h2 className="mt-8 text-sm font-semibold uppercase tracking-wide text-gray-500">
        Your orders
      </h2>

      {orders.length === 0 ? (
        <p className="mt-4 text-gray-500">No orders yet.</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {orders.map((order) => (
            <li key={order.id}>
              <Link
                href={`/order/${order.id}`}
                className="block rounded-xl border border-gray-200 bg-white p-4 hover:border-indigo-300"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                      Order number
                    </p>
                    <p className="font-mono text-lg font-bold text-gray-900">
                      {order.orderNumber}
                    </p>
                  </div>
                  <OrderStatusBadge status={order.status} />
                </div>
                <p className="mt-2 text-xs text-gray-500">
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

  return (
    <div className="mx-auto min-h-screen max-w-lg px-6 py-10">
      <StoreBrandMark
        storeName={branding.storeName}
        logoUrl={branding.storeLogoUrl}
        variant="compact"
      />
      <div className="mt-6">{children}</div>
      <Link
        href={homeHref}
        className={`mt-8 block text-center text-sm ${glassLink}`}
      >
        Back to home
      </Link>
    </div>
  );
}
