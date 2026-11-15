"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminLayout } from "@/components/AdminLayout";
import { Button } from "@/components/Button";
import { TokenGalleryReviewAdminV1 } from "@/components/token-creator/TokenGalleryReviewAdminV1";
import { TokenPrintSheetsAdminV1, type TokenSheetOrderV1 } from "@/components/token-creator/TokenPrintSheetsAdminV1";
import { useAdmin } from "@/context/AdminContext";
import { adminFetch } from "@/lib/api-client";
import type { TokenBoxV1 } from "@/lib/token-creator/design-v1";
import type {
  TokenPaymentStateV1,
  TokenPrintOrderLineV1,
  TokenPrintOrderV1,
  TokenProductionStateV1,
} from "@/lib/token-creator/types-v1";

type QueueLine = TokenPrintOrderLineV1 & {
  frontUrl: string;
  backUrl: string;
  frontDownloadUrl: string;
  backDownloadUrl: string;
  finish?: string;
  artArea?: TokenBoxV1 | null;
};
type QueueOrder = Omit<TokenPrintOrderV1, "lines" | "processedEvents"> & { lines: QueueLine[] };

const PRODUCTION_LABEL: Record<TokenProductionStateV1, string> = {
  not_released: "Waiting for payment",
  paid: "Paid",
  ready: "Ready for print",
  printing: "Printing",
  printed: "Printed",
  fulfilled: "Fulfilled",
  cancelled: "Cancelled",
};

const PAYMENT_LABEL: Record<TokenPaymentStateV1, string> = {
  awaiting_payment: "Checkout open",
  paid: "Paid",
  abandoned: "Checkout abandoned",
  refunded: "Refunded",
  cancelled: "Cancelled",
};

const NEXT_STEP: Partial<Record<TokenProductionStateV1, { state: TokenProductionStateV1; label: string }>> = {
  paid: { state: "ready", label: "Mark ready for print" },
  ready: { state: "printing", label: "Start printing" },
  printing: { state: "printed", label: "Mark printed" },
  printed: { state: "fulfilled", label: "Mark fulfilled" },
};

const STATE_CLASS: Record<TokenProductionStateV1, string> = {
  not_released: "border-gray-300 bg-gray-200 text-gray-700",
  paid: "border-amber-400/50 bg-amber-400/10 text-amber-200",
  ready: "border-sky-400/50 bg-sky-400/10 text-sky-200",
  printing: "border-indigo-400/50 bg-indigo-400/10 text-indigo-200",
  printed: "border-emerald-400/50 bg-emerald-400/10 text-emerald-200",
  fulfilled: "border-emerald-400/50 bg-emerald-400/10 text-emerald-200",
  cancelled: "border-gray-300 bg-gray-200 text-gray-700",
};

function shortDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function orderAdminUrl(shopDomain: string | undefined, gid: string | null, kind: "orders" | "draft_orders") {
  const numeric = gid?.match(/(\d+)$/)?.[1];
  if (!shopDomain || !numeric) return null;
  return `https://${shopDomain}/admin/${kind}/${numeric}`;
}

const linkClass =
  "inline-flex min-h-9 items-center rounded-md border border-gray-300 bg-gray-200 px-3 text-sm font-semibold text-gray-900 hover:border-indigo-400 hover:text-indigo-300";

export default function AdminTokensPage() {
  const { activeStore } = useAdmin();
  const [orders, setOrders] = useState<QueueOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showOther, setShowOther] = useState(false);
  const [shopDomain, setShopDomain] = useState<string | undefined>();

  const load = useCallback(async (sync: boolean) => {
    setError(null);
    const res = await adminFetch(`/api/admin/token-orders${sync ? "?sync=1" : ""}`);
    const data = (await res.json()) as { orders?: QueueOrder[]; shopDomain?: string | null; error?: string };
    if (!res.ok) throw new Error(data.error ?? "Could not load token orders");
    setOrders(data.orders ?? []);
    setShopDomain(data.shopDomain ?? undefined);
  }, []);

  useEffect(() => {
    if (!activeStore) return;
    setLoading(true);
    load(true)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not load token orders"))
      .finally(() => setLoading(false));
  }, [activeStore, load]);

  async function refresh() {
    setSyncing(true);
    try {
      await load(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not refresh");
    } finally {
      setSyncing(false);
    }
  }

  async function patchState(orderId: string, state: TokenProductionStateV1) {
    const res = await adminFetch(`/api/admin/token-orders/${encodeURIComponent(orderId)}`, {
      method: "PATCH",
      body: JSON.stringify({ productionState: state }),
    });
    const data = (await res.json()) as { order?: TokenPrintOrderV1; error?: string };
    if (!res.ok || !data.order) throw new Error(data.error ?? "Could not update");
    const updated = data.order;
    setOrders((prev) =>
      prev.map((o) =>
        o.orderId === orderId ? { ...o, productionState: updated.productionState, statusHistory: updated.statusHistory } : o,
      ),
    );
  }

  async function setState(order: QueueOrder, state: TokenProductionStateV1) {
    if (state === "cancelled" && !window.confirm(`Cancel printing for ${order.customerName || "this order"}? Refund it in Shopify separately.`)) {
      return;
    }
    setBusyId(order.orderId);
    setError(null);
    try {
      await patchState(order.orderId, state);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update");
    } finally {
      setBusyId(null);
    }
  }

  const queue = orders.filter((o) => o.paymentState === "paid" && o.productionState !== "fulfilled" && o.productionState !== "cancelled");
  const other = orders.filter((o) => !queue.includes(o));
  const shown = showOther ? [...queue, ...other] : queue;
  const sheetOrders = useMemo<TokenSheetOrderV1[]>(
    () =>
      orders
        .filter((o) => o.paymentState === "paid")
        .map((o) => ({
          orderId: o.orderId,
          title: `${o.shopifyOrderName ?? o.draftOrderName ?? "Order"} ${o.customerName || o.customerEmail}`.trim(),
          productionState: o.productionState,
          lines: o.lines,
        })),
    [orders],
  );

  return (
    <AdminLayout>
      <div className="mx-auto max-w-5xl">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Token print queue</h1>
            <p className="mt-1 text-sm text-gray-700">
              Custom tokens customers designed and paid for. Each file is 69×94 mm at 300 DPI, which is a
              63×88 mm card plus 3 mm bleed on every side. Orders only appear here once Shopify reports them paid.
            </p>
          </div>
          <Button variant="secondary" onClick={() => void refresh()} disabled={syncing}>
            {syncing ? "Checking Shopify…" : "Check Shopify now"}
          </Button>
        </div>

        {error ? (
          <p className="mt-4 rounded-lg border border-red-400/40 bg-red-400/10 p-3 text-sm text-red-200">{error}</p>
        ) : null}

        {!loading ? (
          <TokenPrintSheetsAdminV1
            orders={sheetOrders}
            onMarkPrinting={async (ids) => {
              for (const id of ids) await patchState(id, "printing");
            }}
          />
        ) : null}

        {loading ? (
          <p className="mt-6 text-sm text-gray-600">Loading…</p>
        ) : shown.length === 0 ? (
          <p className="mt-6 rounded-lg border border-dashed border-gray-300 p-6 text-center text-sm text-gray-600">
            No paid token orders waiting to print.
          </p>
        ) : (
          <ul className="mt-6 space-y-3">
            {shown.map((o) => {
              const orderUrl = orderAdminUrl(shopDomain, o.shopifyOrderId, "orders");
              const draftUrl = orderAdminUrl(shopDomain, o.draftOrderId, "draft_orders");
              const next = o.paymentState === "paid" ? NEXT_STEP[o.productionState] : undefined;
              return (
                <li key={o.orderId} className="rounded-xl border border-gray-200 bg-white p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-lg font-bold text-gray-900">
                        {o.shopifyOrderName ?? o.draftOrderName ?? "Token order"} · {o.customerName || o.customerEmail}
                      </p>
                      <p className="text-sm text-gray-700">{o.customerEmail || "No email on file"}</p>
                      <p className="mt-1 text-sm text-gray-700">
                        {o.cardCount} card{o.cardCount === 1 ? "" : "s"} · ordered {shortDate(o.createdAt)}
                        {o.paidAt ? ` · paid ${shortDate(o.paidAt)}` : ""}
                      </p>
                      {o.shippingSummary ? <p className="mt-1 text-sm text-gray-700">{o.shippingSummary}</p> : null}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-2">
                      <span className={`rounded-md border px-2 py-1 text-xs font-semibold ${STATE_CLASS[o.productionState]}`}>
                        {o.paymentState === "paid" ? PRODUCTION_LABEL[o.productionState] : PAYMENT_LABEL[o.paymentState]}
                      </span>
                      <span className="text-base font-semibold tabular-nums text-gray-900">
                        ${(o.subtotalCents / 100).toFixed(2)}
                      </span>
                    </div>
                  </div>

                  <ul className="mt-3 grid gap-3 sm:grid-cols-2">
                    {o.lines.map((line) => (
                      <li key={line.snapshotId} className="flex gap-3 rounded-lg border border-gray-200 p-2">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={line.frontUrl} alt={line.name} className="h-28 w-20 shrink-0 rounded object-cover" loading="lazy" />
                        <div className="min-w-0 flex-1 text-sm">
                          <p className="truncate font-semibold text-gray-900">
                            {line.quantity}× {line.name}
                          </p>
                          <p className="truncate text-gray-700">{line.styleName ?? "No art style"}</p>
                          <p className="tabular-nums text-gray-700">
                            ${((line.unitPriceCents * line.quantity) / 100).toFixed(2)}
                          </p>
                          <div className="mt-2 flex flex-wrap gap-2 text-xs">
                            <a href={line.frontDownloadUrl} className="underline text-gray-900 hover:text-indigo-300">
                              Front PNG
                            </a>
                            <a href={line.backDownloadUrl} className="underline text-gray-900 hover:text-indigo-300">
                              Back PNG
                            </a>
                            <a href={line.backUrl} target="_blank" rel="noopener noreferrer" className="underline text-gray-700 hover:text-indigo-300">
                              View back
                            </a>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>

                  {o.lastError ? <p className="mt-2 text-xs text-amber-200">Last Shopify check failed: {o.lastError}</p> : null}

                  <div className="mt-3 flex flex-wrap gap-2">
                    {next ? (
                      <Button disabled={busyId === o.orderId} onClick={() => void setState(o, next.state)}>
                        {busyId === o.orderId ? "Saving…" : next.label}
                      </Button>
                    ) : null}
                    {orderUrl ? (
                      <a href={orderUrl} target="_blank" rel="noopener noreferrer" className={linkClass}>
                        Open order in Shopify
                      </a>
                    ) : draftUrl ? (
                      <a href={draftUrl} target="_blank" rel="noopener noreferrer" className={linkClass}>
                        Open draft in Shopify
                      </a>
                    ) : null}
                    {o.productionState !== "cancelled" && o.productionState !== "fulfilled" ? (
                      <Button variant="ghost" disabled={busyId === o.orderId} onClick={() => void setState(o, "cancelled")}>
                        Cancel printing
                      </Button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {other.length > 0 ? (
          <button
            type="button"
            onClick={() => setShowOther((v) => !v)}
            className="mt-4 text-sm text-gray-700 underline hover:text-gray-900"
          >
            {showOther ? "Hide" : "Show"} {other.length} other order{other.length === 1 ? "" : "s"} (unpaid, fulfilled or cancelled)
          </button>
        ) : null}

        <TokenGalleryReviewAdminV1 storeKey={activeStore ? String((activeStore as { id?: string }).id ?? "store") : null} />
      </div>
    </AdminLayout>
  );
}
