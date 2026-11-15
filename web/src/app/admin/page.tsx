"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AdminLayout } from "@/components/AdminLayout";
import { isOrderReadyForReview } from "@/components/OpenOrderStatusBadge";
import { OrderProcessingStatus } from "@/components/OrderProcessingStatus";
import { OrderStatusBadge } from "@/components/OrderStatusBadge";
import { adminFetch } from "@/lib/api-client";
import { useAdmin } from "@/context/AdminContext";
import { usePollingWhenVisible } from "@/hooks/use-polling";
import type { BuybackOrder, Customer } from "@/lib/types";
import type { OrderReportSummary } from "@/lib/reports/store-strategic-report";

interface EnrichedOrder {
  order: BuybackOrder;
  customer: Customer | null;
  cardCount: number;
  cardsProcessedCount: number;
  reportSummary?: OrderReportSummary;
}

type OrdersTab = "open" | "closed";

function isClosedOrder(order: BuybackOrder): boolean {
  return order.status === "paid";
}

function localDateKey(iso?: string): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function todayLocalDateKey(): string {
  return localDateKey(new Date().toISOString())!;
}

function sortOpenOrders(a: EnrichedOrder, b: EnrichedOrder): number {
  return (
    new Date(b.order.submittedAt ?? b.order.createdAt).getTime() -
    new Date(a.order.submittedAt ?? a.order.createdAt).getTime()
  );
}

function sortClosedOrders(a: EnrichedOrder, b: EnrichedOrder): number {
  const aTime = new Date(a.order.completedAt ?? a.order.createdAt).getTime();
  const bTime = new Date(b.order.completedAt ?? b.order.createdAt).getTime();
  return bTime - aTime;
}

export default function AdminOrdersPage() {
  const { loading: authLoading, activeStore } = useAdmin();
  const [orders, setOrders] = useState<EnrichedOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<OrdersTab>("open");
  const [closedDate, setClosedDate] = useState(todayLocalDateKey);

  const loadOrders = useCallback(async () => {
    const r = await adminFetch("/api/admin/orders");
    const d = await r.json();
    setOrders(d.orders ?? []);
  }, []);

  useEffect(() => {
    if (authLoading || !activeStore) return;
    setLoading(true);
    void loadOrders().finally(() => setLoading(false));
  }, [authLoading, activeStore, loadOrders]);

  const hasBuildingOrders = useMemo(
    () =>
      orders.some(
        (row) =>
          !isClosedOrder(row.order) &&
          !isOrderReadyForReview(row.order.status),
      ),
    [orders],
  );

  usePollingWhenVisible(
    loadOrders,
    hasBuildingOrders ? 5_000 : 15_000,
    !authLoading && !!activeStore,
  );

  const { openOrders, closedOrders, closedDates } = useMemo(() => {
    const open: EnrichedOrder[] = [];
    const closed: EnrichedOrder[] = [];
    const dates = new Set<string>();

    for (const row of orders) {
      if (isClosedOrder(row.order)) {
        closed.push(row);
        const key = localDateKey(row.order.completedAt ?? row.order.createdAt);
        if (key) dates.add(key);
      } else {
        open.push(row);
      }
    }

    open.sort(sortOpenOrders);
    closed.sort(sortClosedOrders);

    return {
      openOrders: open,
      closedOrders: closed,
      closedDates: [...dates].sort((a, b) => b.localeCompare(a)),
    };
  }, [orders]);

  useEffect(() => {
    if (tab !== "closed" || closedDates.length === 0) return;
    const hasOnSelectedDate = closedOrders.some((row) => {
      const key = localDateKey(row.order.completedAt ?? row.order.createdAt);
      return key === closedDate;
    });
    if (!hasOnSelectedDate) {
      setClosedDate(closedDates[0]!);
    }
  }, [tab, closedDate, closedDates, closedOrders]);

  const closedForDate = useMemo(
    () =>
      closedOrders.filter((row) => {
        const key = localDateKey(row.order.completedAt ?? row.order.createdAt);
        return key === closedDate;
      }),
    [closedOrders, closedDate],
  );

  const visibleOrders = tab === "open" ? openOrders : closedForDate;

  return (
    <AdminLayout>
      <div>
        <h2 className="text-2xl font-bold text-[var(--text-hi)]">Orders</h2>
        {activeStore && (
          <p className="mt-1 text-sm text-[var(--text-lo)]">{activeStore.storeName}</p>
        )}
      </div>

      {!loading && orders.length > 0 && (
        <div className="mt-6 flex flex-wrap items-center gap-3 border-b border-[var(--line-subtle)]">
          <TabButton
            active={tab === "open"}
            onClick={() => setTab("open")}
            label="Open"
            count={openOrders.length}
          />
          <TabButton
            active={tab === "closed"}
            onClick={() => setTab("closed")}
            label="Closed"
            count={closedOrders.length}
          />
        </div>
      )}

      {tab === "closed" && !loading && closedOrders.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-[var(--text)]">
            <span className="font-medium">Completed on</span>
            <input
              type="date"
              value={closedDate}
              onChange={(e) => setClosedDate(e.target.value)}
              className="rounded-lg border border-[var(--line)] bg-[var(--ink-800)] px-3 py-1.5 text-sm text-[var(--text-hi)] shadow-sm focus:border-[var(--accent-lo)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-lo)]"
            />
          </label>
          {closedDates.length > 0 && !closedDates.includes(closedDate) && (
            <p className="text-xs text-[var(--text-lo)]">
              No orders on this date — pick another or choose a recent day below.
            </p>
          )}
          {closedDates.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {closedDates.slice(0, 7).map((date) => (
                <button
                  key={date}
                  type="button"
                  onClick={() => setClosedDate(date)}
                  className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition ${
                    date === closedDate
                      ? "bg-[var(--accent-wash)] text-[var(--accent-hi)]"
                      : "bg-[var(--ink-750)] text-[var(--text)] hover:bg-[var(--ink-700)]"
                  }`}
                >
                  {formatDateChip(date)}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {loading ? (
        <p className="mt-6 text-[var(--text-lo)]">Loading orders…</p>
      ) : orders.length === 0 ? (
        <div className="mt-8 rounded-xl border border-dashed border-[var(--line)] bg-[var(--ink-800)] px-8 py-12 text-center">
          <p className="text-lg font-medium text-[var(--text-hi)]">No orders yet</p>
          <p className="mt-2 text-sm text-[var(--text)]">
            Customers scan your store QR code to create orders. Print the QR from{" "}
            <Link href="/admin/settings" className="text-[var(--accent)] hover:underline">
              Settings & QR
            </Link>
            .
          </p>
        </div>
      ) : visibleOrders.length === 0 ? (
        <div className="mt-8 rounded-xl border border-dashed border-[var(--line)] bg-[var(--ink-800)] px-8 py-12 text-center">
          <p className="text-lg font-medium text-[var(--text-hi)]">
            {tab === "open" ? "No open orders" : "No closed orders on this date"}
          </p>
          <p className="mt-2 text-sm text-[var(--text)]">
            {tab === "open"
              ? "Completed purchases appear under the Closed tab."
              : `Try another date — ${closedOrders.length} completed order${closedOrders.length === 1 ? "" : "s"} total.`}
          </p>
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-xl border border-[var(--line-subtle)] bg-[var(--ink-800)]">
          {tab === "open" ? (
            <OpenOrdersTable orders={visibleOrders} />
          ) : (
            <ClosedOrdersTable orders={visibleOrders} />
          )}
        </div>
      )}
    </AdminLayout>
  );
}

function OpenOrdersTable({ orders }: { orders: EnrichedOrder[] }) {
  return (
    <table className="min-w-full text-sm">
      <thead className="bg-[var(--ink-750)] text-left text-xs uppercase tracking-wide text-[var(--text-lo)]">
        <tr>
          <th className="px-4 py-3">Order</th>
          <th className="px-4 py-3">Customer</th>
          <th className="px-4 py-3 text-right">Status</th>
        </tr>
      </thead>
      <tbody>
        {orders.map(({ order, customer, cardCount, cardsProcessedCount }) => {
          const ready = isOrderReadyForReview(order.status);
          return (
          <tr
            key={order.id}
            className="border-t border-[var(--line-subtle)] hover:bg-[var(--ink-750)]"
          >
            <td className="px-4 py-3">
              {ready ? (
                <Link
                  href={`/admin/orders/${order.id}`}
                  className="font-semibold text-[var(--accent)] hover:text-[var(--accent-hi)] hover:underline"
                >
                  {order.orderNumber}
                </Link>
              ) : (
                <span
                  className="font-semibold text-[var(--text-lo)]"
                  title="Still processing — available when status is Ready for review"
                >
                  {order.orderNumber}
                </span>
              )}
            </td>
            <td className="px-4 py-3 font-medium text-[var(--text-hi)]">
              {customer ? `${customer.firstName} ${customer.lastName}` : "—"}
            </td>
            <td className="px-4 py-3 text-right">
              <OrderProcessingStatus
                order={order}
                cardCount={cardCount}
                cardsProcessedCount={cardsProcessedCount}
              />
            </td>
          </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function ClosedOrdersTable({ orders }: { orders: EnrichedOrder[] }) {
  return (
    <table className="min-w-full text-sm">
      <thead className="bg-[var(--ink-750)] text-left text-xs uppercase tracking-wide text-[var(--text-lo)]">
        <tr>
          <th className="px-4 py-3">Order</th>
          <th className="px-4 py-3">Customer</th>
          <th className="px-4 py-3">Completed</th>
          <th className="px-4 py-3">Cards</th>
          <th className="px-4 py-3">Reports</th>
          <th className="px-4 py-3">Status</th>
          <th className="px-4 py-3">Market</th>
          <th className="px-4 py-3">Paid</th>
          <th className="px-4 py-3">Review</th>
        </tr>
      </thead>
      <tbody>
        {orders.map(({ order, customer, cardCount, reportSummary }) => (
          <tr
            key={order.id}
            className="border-t border-[var(--line-subtle)] hover:bg-[var(--ink-750)]"
          >
            <td className="px-4 py-3">
              <Link
                href={`/admin/orders/${order.id}`}
                className="font-medium text-[var(--accent)] hover:text-[var(--accent-hi)] hover:underline"
              >
                {order.orderNumber}
              </Link>
              {reportSummary?.topSummary && (
                <p className="mt-1 max-w-xs text-xs text-slate-500 line-clamp-2">
                  {reportSummary.topSummary}
                </p>
              )}
            </td>
            <td className="px-4 py-3">
              {customer ? `${customer.firstName} ${customer.lastName}` : "—"}
              <br />
              <span className="text-xs text-slate-500">{customer?.email}</span>
            </td>
            <td className="px-4 py-3 text-xs">
              {order.completedAt
                ? new Date(order.completedAt).toLocaleDateString()
                : "—"}
            </td>
            <td className="px-4 py-3">{cardCount}</td>
            <td className="px-4 py-3">
              {reportSummary && reportSummary.analyzed > 0 ? (
                <span className="text-xs text-slate-600">
                  <span className="font-medium text-emerald-700">
                    {reportSummary.buy} buy
                  </span>
                  {" · "}
                  <span className="font-medium text-red-700">
                    {reportSummary.pass} pass
                  </span>
                  {reportSummary.review > 0 && (
                    <> · {reportSummary.review} review</>
                  )}
                </span>
              ) : (
                <span className="text-xs text-slate-400">—</span>
              )}
            </td>
            <td className="px-4 py-3">
              <OrderStatusBadge status={order.status} />
              {order.offerType && (
                <p className="mt-0.5 text-[10px] uppercase text-slate-500">
                  {order.offerType}
                </p>
              )}
            </td>
            <td className="px-4 py-3">
              ${(order.totalMarketEstimate ?? 0).toFixed(2)}
            </td>
            <td className="px-4 py-3">
              ${(order.purchaseAmount ?? order.totalCashOffer ?? 0).toFixed(2)}
            </td>
            <td className="px-4 py-3">{order.manualReviewCount ?? 0}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function TabButton({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`-mb-px border-b-2 px-1 pb-3 text-sm font-medium transition ${
        active
          ? "border-[var(--accent)] text-[var(--accent-hi)]"
          : "border-transparent text-[var(--text-lo)] hover:border-[var(--line)] hover:text-[var(--text-hi)]"
      }`}
    >
      {label}
      <span
        className={`ml-1.5 rounded-full px-1.5 py-0.5 text-xs ${
          active ? "bg-[var(--accent-wash)] text-[var(--accent-hi)]" : "bg-[var(--ink-750)] text-[var(--text)]"
        }`}
      >
        {count}
      </span>
    </button>
  );
}

function formatDateChip(dateKey: string): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const today = todayLocalDateKey();
  const yesterday = localDateKey(
    new Date(Date.now() - 86_400_000).toISOString(),
  );
  if (dateKey === today) return "Today";
  if (dateKey === yesterday) return "Yesterday";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
