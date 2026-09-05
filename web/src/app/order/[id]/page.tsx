"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { OrderSubmittedScreen } from "@/components/OrderSubmittedScreen";
import { Button } from "@/components/Button";
import { isOrderLockedForScanning } from "@/lib/customer-order-display";
import type { BuybackOrder, Customer } from "@/lib/types";

export default function OrderPage() {
  const { id } = useParams<{ id: string }>();
  const [order, setOrder] = useState<BuybackOrder | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch(`/api/orders/${id}`, { credentials: "include" });
        const d = await res.json();
        if (cancelled) return;
        if (res.ok) {
          setOrder(d.order);
          setCustomer(d.customer);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loading) {
    return (
      <Shell>
        <p className="text-center text-[var(--text)]">Loading your order…</p>
      </Shell>
    );
  }

  if (!order) {
    return <Shell>Order not found.</Shell>;
  }

  const isDraft = !isOrderLockedForScanning(order.status);

  if (isDraft) {
    return (
      <Shell>
        <h1 className="text-2xl font-bold">{order.orderNumber}</h1>
        <p className="mt-2 text-sm text-[var(--text)]">Continue scanning your cards.</p>
        <Link href={`/order/${id}/scan`} className="mt-6 block">
          <Button fullWidth>Continue Scanning</Button>
        </Link>
      </Shell>
    );
  }

  return (
    <Shell>
      <OrderSubmittedScreen
        orderNumber={order.orderNumber}
        customerEmail={customer?.email}
      />
    </Shell>
  );
}

// Like the account page, this had no background of its own and so rendered on
// the browser-default light body in the middle of a dark customer journey.
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="storefront-theme min-h-screen bg-[var(--ink-850)] text-[var(--text)]">
      <div className="mx-auto max-w-lg px-6 py-10">{children}</div>
    </div>
  );
}
