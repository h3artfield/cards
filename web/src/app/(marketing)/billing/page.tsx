"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MarketingShell } from "@/components/marketing/MarketingShell";
import { subscriptionStatusLabel } from "@/lib/subscription-access";
import type { StoreSubscription } from "@/lib/types";

export default function BillingPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [subscription, setSubscription] = useState<StoreSubscription | null>(null);
  const [subscriptionActive, setSubscriptionActive] = useState(false);
  const [storeName, setStoreName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/me", { credentials: "include" })
      .then(async (res) => {
        if (!res.ok) {
          router.replace("/login");
          return;
        }
        const data = await res.json();
        if (data.session?.role !== "store") {
          router.replace("/admin");
          return;
        }
        setSubscription(data.subscription ?? null);
        setSubscriptionActive(Boolean(data.subscriptionActive));
        setStoreName(data.activeStore?.storeName ?? null);
      })
      .catch(() => router.replace("/login"))
      .finally(() => setLoading(false));
  }, [router]);

  async function startCheckout() {
    setBusy("checkout");
    setError(null);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not start checkout");
        return;
      }
      window.location.href = data.checkoutUrl;
    } catch {
      setError("Network error — try again.");
    } finally {
      setBusy(null);
    }
  }

  async function openPortal() {
    setBusy("portal");
    setError(null);
    try {
      const res = await fetch("/api/billing/portal", {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not open billing portal");
        return;
      }
      window.location.href = data.portalUrl;
    } catch {
      setError("Network error — try again.");
    } finally {
      setBusy(null);
    }
  }

  if (loading) {
    return (
      <MarketingShell>
        <div className="px-4 py-20 text-center text-slate-600">Loading billing…</div>
      </MarketingShell>
    );
  }

  return (
    <MarketingShell>
      <div className="mx-auto max-w-lg px-4 py-12 sm:px-6 sm:py-16">
        <h1 className="text-3xl font-bold text-slate-900">Billing</h1>
        <p className="mt-2 text-slate-600">
          {storeName ? `${storeName} — ` : ""}
          Card Scanner 9000 Store Plan ($100/month)
        </p>

        <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          {subscriptionActive ? (
            <>
              <p className="text-sm font-medium text-emerald-700">Subscription active</p>
              <p className="mt-2 text-sm text-slate-600">
                Status: {subscriptionStatusLabel(subscription?.status)}
                {subscription?.currentPeriodEnd
                  ? ` · Renews ${new Date(subscription.currentPeriodEnd).toLocaleDateString()}`
                  : null}
              </p>
              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={openPortal}
                  disabled={busy != null}
                  className="rounded-xl bg-violet-600 px-4 py-3 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-60"
                >
                  {busy === "portal" ? "Opening…" : "Manage subscription"}
                </button>
                <Link
                  href="/admin"
                  className="inline-flex items-center justify-center rounded-xl border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-800 hover:bg-slate-50"
                >
                  Go to dashboard
                </Link>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm font-medium text-red-700">
                Your subscription is not active. Please update billing to continue.
              </p>
              <p className="mt-2 text-sm text-slate-600">
                Status: {subscriptionStatusLabel(subscription?.status)}
              </p>
              <div className="mt-6 flex flex-col gap-3">
                <button
                  type="button"
                  onClick={startCheckout}
                  disabled={busy != null}
                  className="rounded-xl bg-violet-600 px-4 py-3 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-60"
                >
                  {busy === "checkout" ? "Starting checkout…" : "Start for $100/month"}
                </button>
                {subscription?.stripeCustomerId ? (
                  <button
                    type="button"
                    onClick={openPortal}
                    disabled={busy != null}
                    className="rounded-xl border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-60"
                  >
                    Manage billing
                  </button>
                ) : null}
              </div>
            </>
          )}
          {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}
        </div>
      </div>
    </MarketingShell>
  );
}
