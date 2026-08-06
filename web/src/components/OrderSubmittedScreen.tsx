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
      <h1 className="text-2xl font-bold text-gray-900">Thank you!</h1>
      <p className="mt-3 max-w-sm text-sm leading-relaxed text-gray-700">
        We will notify you at{" "}
        <span className="font-semibold text-gray-900">{emailLine}</span> when
        your order has finished processing.
      </p>

      <div className="mt-8 w-full max-w-xs rounded-2xl border-2 border-indigo-200 bg-indigo-50 px-6 py-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-indigo-800">
          Your order number
        </p>
        <p className="mt-2 font-mono text-2xl font-bold tracking-tight text-indigo-950">
          {orderNumber}
        </p>
        <p className="mt-2 text-xs leading-relaxed text-indigo-900/80">
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
          <Button fullWidth variant="secondary">
            Account
          </Button>
        </Link>
        {createError ? (
          <p className="text-xs text-red-600">{createError}</p>
        ) : null}
      </div>
    </div>
  );
}
