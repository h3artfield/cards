"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AdminLayout } from "@/components/AdminLayout";
import { Button } from "@/components/Button";
import { CardBuybackReportPanel } from "@/components/CardBuybackReportPanel";
import { CardIdentityPanel } from "@/components/CardIdentityPanel";
import { CardConditionPanel } from "@/components/CardConditionPanel";
import { adminFetch } from "@/lib/api-client";
import { useAdmin } from "@/context/AdminContext";
import type { CardFeedback } from "@/lib/types";

export function AdminFeedbackContent() {
  const router = useRouter();
  const { session, loading: authLoading } = useAdmin();
  const [items, setItems] = useState<CardFeedback[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const isPlatform = session?.role === "platform";

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await adminFetch("/api/admin/feedback");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not load feedback");
      setItems(data.feedback ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (authLoading) return;
    if (!session) return;
    if (!isPlatform) {
      router.replace("/admin");
      return;
    }
    void load();
  }, [authLoading, session, isPlatform, router]);

  async function markReviewed(id: string) {
    setUpdatingId(id);
    try {
      const res = await adminFetch(`/api/admin/feedback/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "reviewed" }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Update failed");
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setUpdatingId(null);
    }
  }

  const newCount = items.filter((f) => f.status === "new").length;

  return (
    <AdminLayout showStoreTabs={false}>
      <div>
        <h2 className="text-xl font-bold">Feedback</h2>
        <p className="text-sm text-gray-600">
          Store-submitted card reports and notes
          {newCount > 0 && (
            <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">
              {newCount} new
            </span>
          )}
        </p>
      </div>

      {error && (
        <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>
      )}

      {loading ? (
        <p className="mt-6 text-gray-500">Loading…</p>
      ) : items.length === 0 ? (
        <p className="mt-6 text-gray-500">No feedback yet.</p>
      ) : (
        <ul className="mt-6 space-y-3">
          {items.map((item) => {
            const expanded = expandedId === item.id;
            const snap = item.cardSnapshot;
            return (
              <li
                key={item.id}
                className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-gray-900">
                      {item.cardDisplayName}
                      {item.status === "new" && (
                        <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-900">
                          New
                        </span>
                      )}
                    </p>
                    <p className="text-sm text-gray-600">
                      {item.storeName ?? item.storeId} · Order{" "}
                      {item.orderNumber ?? item.orderId.slice(0, 8)}
                    </p>
                    <p className="text-xs text-gray-500">
                      {new Date(item.createdAt).toLocaleString()} ·{" "}
                      {item.submittedByEmail}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Link
                      href={`/admin/orders/${item.orderId}`}
                      className="text-sm text-indigo-600 hover:underline"
                    >
                      View order
                    </Link>
                    {item.status === "new" && (
                      <Button
                        variant="secondary"
                        disabled={updatingId === item.id}
                        onClick={() => void markReviewed(item.id)}
                      >
                        {updatingId === item.id ? "Saving…" : "Mark reviewed"}
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      onClick={() =>
                        setExpandedId(expanded ? null : item.id)
                      }
                    >
                      {expanded ? "Hide report" : "Show report"}
                    </Button>
                  </div>
                </div>

                <blockquote className="mt-3 rounded-lg border-l-4 border-indigo-300 bg-indigo-50/50 px-3 py-2 text-sm text-gray-800">
                  {item.message}
                </blockquote>

                {expanded && snap && (
                  <div className="mt-4 space-y-3 border-t border-gray-100 pt-4">
                    <p className="text-sm text-gray-700">
                      Market ${(snap.marketPrice ?? 0).toFixed(2)} · Cash $
                      {(snap.cashOffer ?? 0).toFixed(2)} · Trade $
                      {(snap.tradeOffer ?? 0).toFixed(2)}
                      {snap.setName && (
                        <>
                          {" "}
                          · {snap.setName}
                          {snap.cardNumber ? ` #${snap.cardNumber}` : ""}
                        </>
                      )}
                    </p>
                    {snap.warnings?.map((w) => (
                      <p key={w} className="text-xs text-red-700">
                        ⚠ {w}
                      </p>
                    ))}
                    {snap.frontImageUrl && (
                      <img
                        src={snap.frontImageUrl}
                        alt=""
                        className="h-32 w-auto rounded border object-contain"
                      />
                    )}
                    {snap.identityVerification && (
                      <CardIdentityPanel
                        verification={snap.identityVerification}
                        frontImageUrl={snap.frontImageUrl ?? ""}
                        backImageUrl=""
                        cardName={item.cardDisplayName}
                        conditionReport={snap.conditionReport}
                      />
                    )}
                    {snap.conditionReport && (
                      <CardConditionPanel report={snap.conditionReport} />
                    )}
                    {snap.resaleAnalysis && (
                      <CardBuybackReportPanel
                        analysis={snap.resaleAnalysis}
                        analyzing={false}
                      />
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </AdminLayout>
  );
}
