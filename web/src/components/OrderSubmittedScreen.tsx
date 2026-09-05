"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/Button";
import { useCustomer } from "@/context/CustomerContext";
import { useStoreHomeHref } from "@/hooks/useStoreHomeHref";
import {
  createCustomerOrder,
  goToOrderScan,
} from "@/lib/create-customer-order";
import { STORE_SLUG_SESSION_KEY } from "@/lib/store-slug";

export function OrderSubmittedScreen({
  orderNumber,
  customerEmail,
}: {
  orderNumber: string;
  customerEmail?: string;
}) {
  const router = useRouter();
  const homeHref = useStoreHomeHref();
  const { customer } = useCustomer();
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const emailLine = customerEmail?.trim()
    ? customerEmail.trim()
    : "your email on file";

  async function handleCreateAnother() {
    setCreateError(null);
    if (!customer) {
      router.push(homeHref);
      return;
    }
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
    } catch {
      setCreateError("Could not start a new order. Please try again.");
      setCreating(false);
    }
  }

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 py-16 text-center">
      <h1 className="text-2xl font-bold text-[var(--text-hi)]">Thank you!</h1>
      <p className="mt-3 max-w-sm text-sm leading-relaxed text-[var(--text)]">
        We will notify you at{" "}
        <span className="font-semibold text-[var(--text-hi)]">{emailLine}</span> when
        your order has finished processing.
      </p>

      <div className="mt-8 w-full max-w-xs rounded-2xl border border-[var(--accent-lo)] bg-[var(--accent-wash)] px-6 py-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--accent-hi)]">
          Your order number
        </p>
        <p className="mt-2 font-mono text-2xl font-bold tracking-tight text-[var(--text-hi)]">
          {orderNumber}
        </p>
        <p className="mt-2 text-xs leading-relaxed text-[var(--text)]">
          Give this number to a store associate when you hand in your cards.
        </p>
      </div>

      <div className="mt-10 w-full max-w-xs space-y-3">
        <Button
          fullWidth
          disabled={creating}
          onClick={() => void handleCreateAnother()}
        >
          {creating ? "Starting…" : "Create another order"}
        </Button>
        <Link href="/orders">
          {/* `secondary` is the light-ground white button, which this page no
              longer is; glassSecondary is its dark counterpart. */}
          <Button fullWidth variant="glassSecondary">
            Account
          </Button>
        </Link>
        {createError ? (
          <p className="text-xs text-[var(--bad)]">{createError}</p>
        ) : null}
      </div>
    </div>
  );
}
