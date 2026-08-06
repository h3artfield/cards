"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AdminLayout } from "@/components/AdminLayout";
import { AdminPricingHeader, AdminPricingSubNav } from "@/components/admin/AdminPricingSubNav";
import { adminFetch } from "@/lib/api-client";
import { useAdmin } from "@/context/AdminContext";
import type { V2ReviewQueueItem } from "@/lib/card-flow-v2/v2-review-queue";
import {
  clerkRecommendationShortTitle,
  needsProductionComparison,
  resolveClerkRecommendationForQueue,
} from "@/lib/card-flow-v2/clerk-recommendation";

function ReviewQueueCard({ item }: { item: V2ReviewQueueItem }) {
  const recommendation = resolveClerkRecommendationForQueue({
    v2ReviewStatus: item.v2ReviewStatus,
    productionMarketPrice: item.productionMarketPrice,
    v2PreviewMarketPrice: item.v2PreviewMarketPrice,
  });

  const showProduction = needsProductionComparison({
    reviewStatus: item.v2ReviewStatus,
    productionMarketPrice: item.productionMarketPrice,
    v2PreviewMarketPrice: item.v2PreviewMarketPrice,
  });

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={item.frontImageUrl}
          alt=""
          className="h-16 w-12 shrink-0 rounded object-contain"
        />
        <div className="min-w-0 flex-1">
          <p className="font-semibold leading-tight">{item.name ?? "Unknown card"}</p>
          {item.orderNumber && (
            <p className="text-xs text-gray-500">{item.orderNumber}</p>
          )}
          <dl className="mt-2 space-y-1 text-sm">
            <div className="flex justify-between gap-2">
              <dt className="text-gray-600">Action</dt>
              <dd className="text-right font-medium">
                {clerkRecommendationShortTitle(recommendation)}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-gray-600">V2</dt>
              <dd>
                {item.v2PreviewMarketPrice != null
                  ? `$${item.v2PreviewMarketPrice.toFixed(2)}`
                  : "Blocked"}
              </dd>
            </div>
            {showProduction && (
              <div className="flex justify-between gap-2">
                <dt className="text-gray-600">Production</dt>
                <dd>
                  {item.productionMarketPrice != null
                    ? `$${item.productionMarketPrice.toFixed(2)}`
                    : "—"}
                </dd>
              </div>
            )}
          </dl>
          <Link
            href={`/admin/orders/${item.orderId}`}
            className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            Open review
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function V2ReviewQueuePage() {
  const { loading: authLoading, activeStore } = useAdmin();
  const [queue, setQueue] = useState<V2ReviewQueueItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const r = await adminFetch("/api/admin/v2/review-queue");
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

      <h1 className="mb-2 mt-6 text-xl font-semibold">V2 Staff Review Queue</h1>
      <p className="mb-4 text-sm text-gray-600">
        Tap a card to confirm printing, see V2 estimate, and follow the action.
      </p>

      {loading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : queue.length === 0 ? (
        <p className="text-sm text-gray-500">No cards need V2 review.</p>
      ) : (
        <div className="space-y-3">
          {queue.map((item) => (
            <ReviewQueueCard key={item.cardId} item={item} />
          ))}
        </div>
      )}
    </AdminLayout>
  );
}
