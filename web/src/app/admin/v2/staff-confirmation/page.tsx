"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AdminLayout } from "@/components/AdminLayout";
import { AdminPricingHeader, AdminPricingSubNav } from "@/components/admin/AdminPricingSubNav";
import { adminFetch } from "@/lib/api-client";
import { useAdmin } from "@/context/AdminContext";
import type { StaffConfirmationQueueItem } from "@/lib/card-flow-v2/staff-confirmation-queue";
import { friendlyQueueReason } from "@/lib/card-flow-v2/v2-staff-labels";

function topIssue(item: StaffConfirmationQueueItem): string {
  if (item.reasons.includes("identity_not_locked_or_confirmed")) {
    return "Confirm the correct printing";
  }
  if (item.reasons.includes("variant_uncertainty")) {
    return "Variant needs confirmation";
  }
  if (item.reasons.includes("source_disagreement")) {
    return "Source prices disagree";
  }
  return friendlyQueueReason(item.reasons[0] ?? "identity_not_locked_or_confirmed");
}

export default function StaffConfirmationQueuePage() {
  const { loading: authLoading, activeStore } = useAdmin();
  const [queue, setQueue] = useState<StaffConfirmationQueueItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const r = await adminFetch("/api/admin/v2/staff-confirmation-queue");
    const d = await r.json();
    setQueue(d.queue ?? []);
  }, []);

  useEffect(() => {
    if (authLoading || !activeStore) return;
    setLoading(true);
    void load().finally(() => setLoading(false));
  }, [authLoading, activeStore, load]);

  return (
    <AdminLayout>
      <AdminPricingHeader />

      <div className="mt-4">
        <AdminPricingSubNav />
      </div>

      <h1 className="mb-2 mt-6 text-xl font-semibold">Staff Confirmation Queue</h1>
      <p className="mb-4 text-sm text-gray-600">
        Cards waiting for staff to confirm the exact printing before pricing preview.
      </p>

      {loading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : queue.length === 0 ? (
        <p className="text-sm text-gray-500">No cards in queue.</p>
      ) : (
        <div className="space-y-3">
          {queue.map((item) => (
            <div
              key={item.cardId}
              className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
            >
              <div className="flex gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={item.frontImageUrl}
                  alt=""
                  className="h-16 w-12 shrink-0 rounded object-contain"
                />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold leading-tight">
                    {item.name ?? "Unknown card"}
                  </p>
                  <p className="text-xs text-gray-500">
                    {item.category ?? "—"}
                    {item.orderNumber ? ` · ${item.orderNumber}` : ""}
                  </p>

                  <dl className="mt-2 space-y-1 text-sm">
                    <div className="flex justify-between gap-2">
                      <dt className="text-gray-600">Top issue</dt>
                      <dd className="text-right text-xs font-medium">
                        {topIssue(item)}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-gray-600">Suspects</dt>
                      <dd>{item.suspectCount}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-gray-600">Pricing data</dt>
                      <dd>
                        {item.pricingSignalCount > 0 ? "Yes" : "No"}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-gray-600">Production</dt>
                      <dd>${item.currentMarketPrice?.toFixed(2) ?? "—"}</dd>
                    </div>
                  </dl>

                  {item.topSuspects.length > 0 && (
                    <ul className="mt-2 text-xs text-gray-700">
                      {item.topSuspects.slice(0, 2).map((s) => (
                        <li key={s.suspectId} className="truncate">
                          {(s.matchScore * 100).toFixed(0)}% — {s.label}
                        </li>
                      ))}
                    </ul>
                  )}

                  <Link
                    href={`/admin/orders/${item.orderId}`}
                    className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
                  >
                    Review / confirm
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </AdminLayout>
  );
}
