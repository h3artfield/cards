"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminLayout } from "@/components/AdminLayout";
import { Button } from "@/components/Button";
import { useAdmin } from "@/context/AdminContext";
import { adminFetch } from "@/lib/api-client";
import type { PickupReservation, PickupReservationStatus } from "@/lib/types";

const STATUS_LABEL: Record<PickupReservationStatus, string> = {
  active: "Waiting for pickup",
  completed: "Paid",
  expired: "Released — not picked up",
  cancelled: "Cancelled",
};

const STATUS_CLASS: Record<PickupReservationStatus, string> = {
  active: "border-amber-400/50 bg-amber-400/10 text-amber-200",
  completed: "border-emerald-400/50 bg-emerald-400/10 text-emerald-200",
  expired: "border-gray-300 bg-gray-200 text-gray-700",
  cancelled: "border-gray-300 bg-gray-200 text-gray-700",
};

/** Paid online and not handed over yet. */
function readyForPickup(r: PickupReservation): boolean {
  return r.payOnline === true && r.status === "completed" && !r.pickedUpAt;
}

function statusLabel(r: PickupReservation): string {
  if (r.payOnline) {
    if (r.status === "active") return "Checking out online";
    if (r.status === "completed") return r.pickedUpAt ? "Paid online · picked up" : "Paid online — ready for pickup";
    if (r.status === "expired") return "Checkout abandoned";
  }
  return STATUS_LABEL[r.status];
}

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function draftAdminUrl(shopDomain: string | undefined, draftOrderId: string) {
  const numeric = draftOrderId.match(/(\d+)$/)?.[1];
  if (!shopDomain || !numeric) return null;
  return `https://${shopDomain}/admin/draft_orders/${numeric}`;
}

export default function AdminPickupsPage() {
  const { activeStore } = useAdmin();
  const [reservations, setReservations] = useState<PickupReservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showClosed, setShowClosed] = useState(false);
  const [shopDomain, setShopDomain] = useState<string | undefined>();

  const load = useCallback(async (sync: boolean) => {
    setError(null);
    const res = await adminFetch(`/api/admin/pickups${sync ? "?sync=1" : ""}`);
    const data = (await res.json()) as {
      reservations?: PickupReservation[];
      shopDomain?: string | null;
      error?: string;
    };
    if (!res.ok) throw new Error(data.error ?? "Could not load pickups");
    setReservations(data.reservations ?? []);
    setShopDomain(data.shopDomain ?? undefined);
  }, []);

  useEffect(() => {
    if (!activeStore) return;
    setLoading(true);
    load(false)
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : "Could not load pickups"),
      )
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

  async function cancel(reservation: PickupReservation) {
    if (
      !window.confirm(
        `Cancel ${reservation.draftOrderName} for ${reservation.customerName}? The cards go back on sale.`,
      )
    ) {
      return;
    }
    setBusyId(reservation.id);
    setError(null);
    try {
      const res = await adminFetch(
        `/api/admin/pickups/${encodeURIComponent(reservation.id)}/cancel`,
        { method: "POST" },
      );
      const data = (await res.json()) as {
        reservation?: PickupReservation;
        error?: string;
      };
      if (!res.ok || !data.reservation) {
        throw new Error(data.error ?? "Could not cancel");
      }
      setReservations((prev) =>
        prev.map((r) => (r.id === reservation.id ? data.reservation! : r)),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not cancel");
    } finally {
      setBusyId(null);
    }
  }

  async function markPickedUp(reservation: PickupReservation) {
    setBusyId(reservation.id);
    setError(null);
    try {
      const res = await adminFetch(
        `/api/admin/pickups/${encodeURIComponent(reservation.id)}/picked-up`,
        { method: "POST" },
      );
      const data = (await res.json()) as { reservation?: PickupReservation; error?: string };
      if (!res.ok || !data.reservation) throw new Error(data.error ?? "Could not update");
      setReservations((prev) =>
        prev.map((r) => (r.id === reservation.id ? data.reservation! : r)),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update");
    } finally {
      setBusyId(null);
    }
  }

  // An unpaid pay-online draft is a customer still at checkout, not a pickup.
  const isWaiting = (r: PickupReservation) =>
    (r.status === "active" && !r.payOnline) || readyForPickup(r);
  const waiting = reservations.filter(isWaiting);
  const closed = reservations.filter((r) => !isWaiting(r));
  const shown = showClosed ? [...waiting, ...closed] : waiting;

  return (
    <AdminLayout>
      <div className="mx-auto max-w-5xl">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Pickups</h1>
            <p className="mt-1 text-sm text-gray-700">
              Singles customers reserved online. Load the draft in Shopify POS by
              its number or the customer&apos;s name, add anything else, and take
              payment there. Holds release after 7 days. Orders marked &quot;Paid
              online&quot; are already paid — hand the cards over and mark them picked up.
            </p>
          </div>
          <Button variant="secondary" onClick={() => void refresh()} disabled={syncing}>
            {syncing ? "Checking Shopify…" : "Check Shopify now"}
          </Button>
        </div>

        {error ? (
          <p className="mt-4 rounded-lg border border-red-400/40 bg-red-400/10 p-3 text-sm text-red-200">
            {error}
          </p>
        ) : null}

        {loading ? (
          <p className="mt-6 text-sm text-gray-600">Loading…</p>
        ) : shown.length === 0 ? (
          <p className="mt-6 rounded-lg border border-dashed border-gray-300 p-6 text-center text-sm text-gray-600">
            No pickup orders waiting.
          </p>
        ) : (
          <ul className="mt-6 space-y-3">
            {shown.map((r) => {
              const url = draftAdminUrl(shopDomain, r.draftOrderId);
              return (
                <li
                  key={r.id}
                  className="rounded-xl border border-gray-200 bg-white p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-lg font-bold text-gray-900">
                        {r.draftOrderName} · {r.customerName || "Online customer"}
                      </p>
                      <p className="text-sm text-gray-700">
                        {[r.customerEmail, r.customerPhone].filter(Boolean).join(" · ") ||
                          "No contact on file"}
                      </p>
                      <p className="mt-1 text-sm text-gray-700">
                        Reserved {shortDate(r.createdAt)}
                        {r.status === "active"
                          ? ` · held until ${shortDate(r.reserveUntil)}`
                          : ""}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-2">
                      <span
                        className={`rounded-md border px-2 py-1 text-xs font-semibold ${STATUS_CLASS[r.status]}`}
                      >
                        {statusLabel(r)}
                      </span>
                      <span className="text-base font-semibold tabular-nums text-gray-900">
                        ${r.subtotal.toFixed(2)}
                      </span>
                    </div>
                  </div>

                  <ul className="mt-3 divide-y divide-gray-200 rounded-lg border border-gray-200 text-sm">
                    {r.lines.map((line) => (
                      <li
                        key={line.inventoryItemId}
                        className="flex justify-between gap-3 px-3 py-2"
                      >
                        <span className="min-w-0 truncate text-gray-900">
                          {line.quantity > 1 ? `${line.quantity}× ` : ""}
                          {line.displayName}
                        </span>
                        <span className="shrink-0 tabular-nums text-gray-700">
                          ${(line.unitPrice * line.quantity).toFixed(2)}
                        </span>
                      </li>
                    ))}
                  </ul>

                  {r.lastError ? (
                    <p className="mt-2 text-xs text-amber-200">
                      Last Shopify check failed: {r.lastError}
                    </p>
                  ) : null}

                  <div className="mt-3 flex flex-wrap gap-2">
                    {url ? (
                      <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex min-h-9 items-center rounded-md border border-gray-300 bg-gray-200 px-3 text-sm font-semibold text-gray-900 hover:border-indigo-400 hover:text-indigo-300"
                      >
                        Open draft in Shopify
                      </a>
                    ) : null}
                    {readyForPickup(r) ? (
                      <Button disabled={busyId === r.id} onClick={() => void markPickedUp(r)}>
                        {busyId === r.id ? "Saving…" : "Mark picked up"}
                      </Button>
                    ) : null}
                    {r.status === "active" ? (
                      <Button
                        variant="ghost"
                        disabled={busyId === r.id}
                        onClick={() => void cancel(r)}
                      >
                        {busyId === r.id ? "Cancelling…" : "Cancel & release cards"}
                      </Button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {closed.length > 0 ? (
          <button
            type="button"
            onClick={() => setShowClosed((v) => !v)}
            className="mt-4 text-sm text-gray-700 underline hover:text-gray-900"
          >
            {showClosed ? "Hide" : "Show"} {closed.length} past pickup
            {closed.length === 1 ? "" : "s"}
          </button>
        ) : null}
      </div>
    </AdminLayout>
  );
}
