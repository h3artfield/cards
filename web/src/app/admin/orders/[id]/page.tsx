"use client";

import { useCallback, useEffect, useMemo, useRef, useState, Suspense } from "react";
import { useParams, useRouter } from "next/navigation";
import { AdminLayout } from "@/components/AdminLayout";
import { OrderStatusBadge } from "@/components/OrderStatusBadge";
import { OrderReadyEmailStatus } from "@/components/OrderReadyEmailStatus";
import { OrderProcessingStatus } from "@/components/OrderProcessingStatus";
import { ConditionLadderTable } from "@/components/ConditionLadderTable";
import { CardBuybackReportPanel } from "@/components/CardBuybackReportPanel";
import { CardIdentityPanel } from "@/components/CardIdentityPanel";
import { CardFlowV2EvidencePanel } from "@/components/CardFlowV2EvidencePanel";
import { CardFlowV2AuditPanel } from "@/components/CardFlowV2AuditPanel";
import { CardFlowV2MobileReviewCard } from "@/components/CardFlowV2MobileReviewCard";
import { runCardAuditV2 } from "@/lib/card-flow-v2/audit/run-card-audit-v2";
import { buildStaffTrainingExplanation } from "@/lib/card-flow-v2/staff-training-explanation";
import { resolveV2ReviewStatus } from "@/lib/card-flow-v2/v2-review-status";
import { CatalogLookupPanel } from "@/components/CatalogLookupPanel";
import { SportsMarketplaceLinks } from "@/components/SportsMarketplaceLinks";
import { CardConditionPanel } from "@/components/CardConditionPanel";
import { CardFeedbackForm } from "@/components/CardFeedbackForm";
import { PriceCompsPanel } from "@/components/admin/PriceCompsPanel";
import { Button } from "@/components/Button";
import { adminFetch } from "@/lib/api-client";
import { cardDisplayName } from "@/lib/processing/card-display-name";
import {
  computeProductionOrderRunningTotals,
  effectiveCardDecision,
  resolveCardClerkReviewContext,
} from "@/lib/processing/card-buy-decision";
import { resolveClerkVisualReviewState } from "@/lib/processing/clerk-visual-review-state";
import { offersFromLadder } from "@/lib/processing/condition-ladder";
import { staffEditOffersForCondition } from "@/lib/card-flow-v2/staff-edit-condition-ladder";
import { getStaffSelectedSuspect } from "@/lib/card-flow-v2/staff-suspect-selection";
import { suspectBlocksTcgplayerPricing } from "@/lib/card-flow-v2/pokemon-japanese-fallback";
import { useAdmin } from "@/context/AdminContext";
import { usePollingWhenVisible } from "@/hooks/use-polling";
import type {
  BuybackOrder,
  Customer,
  ScannedCard,
  ConditionEstimate,
  StaffEditRecord,
  StoreRule,
} from "@/lib/types";

export default function AdminOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { loading: authLoading, activeStore } = useAdmin();
  const [order, setOrder] = useState<BuybackOrder | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [cards, setCards] = useState<ScannedCard[]>([]);
  const [storeRules, setStoreRules] = useState<StoreRule[]>([]);
  const [editingCard, setEditingCard] = useState<string | null>(null);
  const [feedbackCard, setFeedbackCard] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [analyzingCard, setAnalyzingCard] = useState<string | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const pendingAnalysisRef = useRef(new Set<string>());

  const loadOrder = useCallback(async () => {
    const res = await fetch(`/api/orders/${id}`);
    const data = await res.json();
    setOrder(data.order);
    setCustomer(data.customer);
    setCards(data.cards ?? []);
  }, [id]);

  useEffect(() => {
    if (authLoading || !activeStore) return;
    void loadOrder();
  }, [authLoading, activeStore, loadOrder]);

  useEffect(() => {
    if (authLoading || !activeStore || !order?.storeId) return;
    void adminFetch(`/api/admin/rules?storeId=${encodeURIComponent(order.storeId)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setStoreRules(data?.rules ?? []))
      .catch(() => setStoreRules([]));
  }, [authLoading, activeStore, order?.storeId]);

  const orderStillProcessing =
    order?.status === "processing" ||
    order?.status === "submitted" ||
    order?.status === "scanning";
  const cardsPendingAnalysis = cards.some(
    (c) => !c.resaleAnalysis || !c.identityVerification,
  );

  usePollingWhenVisible(
    loadOrder,
    orderStillProcessing ? 5_000 : 10_000,
    !authLoading &&
      !!activeStore &&
      !!order &&
      (orderStillProcessing || cardsPendingAnalysis),
  );

  useEffect(() => {
    const needsAnalysis = cards.filter(
      (c) =>
        (!c.resaleAnalysis || !c.identityVerification) &&
        !pendingAnalysisRef.current.has(c.id) &&
        analyzingCard !== c.id,
    );
    if (!needsAnalysis.length || analyzingCard) return;

    const next = needsAnalysis[0];
    pendingAnalysisRef.current.add(next.id);
    void runFullAnalysis(next.id);
  }, [cards, analyzingCard]);

  async function adminAction(
    body: Record<string, unknown>,
    options?: { redirectToOrders?: boolean },
  ): Promise<boolean> {
    setSaving(true);
    try {
      const res = await adminFetch(`/api/admin/orders/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      if (!res.ok) return false;
      if (options?.redirectToOrders) {
        router.push("/admin");
        return true;
      }
      await loadOrder();
      return true;
    } finally {
      setSaving(false);
    }
  }

  async function updateCard(cardId: string, updates: Partial<ScannedCard>) {
    await adminAction({ cardUpdates: [{ id: cardId, ...updates }] });
    setEditingCard(null);
  }

  async function runFullAnalysis(cardId: string) {
    setAnalyzingCard(cardId);
    setAnalysisError(null);
    try {
      const res = await adminFetch(`/api/admin/cards/${cardId}/full-analysis`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        setAnalysisError(data.error ?? "Analysis failed");
        return;
      }
      await loadOrder();
    } finally {
      setAnalyzingCard(null);
    }
  }

  async function removeCard(cardId: string) {
    if (!window.confirm("Are you sure you want to delete this card?")) return;
    setSaving(true);
    await adminFetch(`/api/admin/orders/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ cardDeleteIds: [cardId] }),
    });
    await loadOrder();
    setSaving(false);
  }

  const duplicateCardIds = findDuplicateCardIds(cards);
  const totals = useMemo(
    () => computeProductionOrderRunningTotals(cards, storeRules),
    [cards, storeRules],
  );
  const cardCount = totals.totalCards;
  const cardOrderLabel = `${cardCount} card order`;
  const latestReopen =
    order?.reopenHistory && order.reopenHistory.length > 0
      ? [...order.reopenHistory].reverse()[0]
      : null;

  if (!order) {
    return (
      <AdminLayout>
        <p>Loading...</p>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <h2 className="text-xl font-bold">{order.orderNumber}</h2>
            <span className="text-sm text-gray-500">{cardOrderLabel}</span>
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-2">
          {orderStillProcessing ? (
            <OrderProcessingStatus order={order} cards={cards} />
          ) : (
            <OrderStatusBadge status={order.status} />
          )}
          <OrderReadyEmailStatus order={order} customerEmail={customer?.email} />
          {latestReopen && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-right text-xs text-amber-950">
              <p className="font-semibold">
                Reopened {order.reopenHistory!.length} time
                {order.reopenHistory!.length === 1 ? "" : "s"}
              </p>
              <p className="mt-0.5 text-amber-900">
                {latestReopen.reopenedByName} ·{" "}
                {new Date(latestReopen.reopenedAt).toLocaleDateString()}
                {latestReopen.previousPurchaseAmount != null &&
                  ` · was $${latestReopen.previousPurchaseAmount.toFixed(2)}`}
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
        {customer ? (
          <div className="min-w-0 text-sm">
            <p className="font-medium text-gray-900">
              {customer.firstName} {customer.lastName}
            </p>
            <p className="text-gray-600">
              {customer.email} · {customer.phone}
            </p>
          </div>
        ) : (
          <div />
        )}

        {order.status !== "paid" && order.status !== "cancelled" && (
          <Button
            disabled={saving}
            className="shrink-0"
            onClick={() => adminAction({ action: "reprocess" })}
          >
            Reprocess cards
          </Button>
        )}
      </div>

      {duplicateCardIds.size > 0 && (
        <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">
          This order has duplicate card entries (same name/set/number). Remove the
          extra copy below — this usually happens when submit was tapped twice
          during scanning.
        </p>
      )}

      {analysisError && (
        <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {analysisError}
        </p>
      )}
      <div className="mt-6 grid grid-cols-1 gap-6 pb-36">
        {cards.map((card) => {
          const v2Audit =
            card.cardFlowV2Audit ??
            (card.cardFlowV2Identity?.lockedIdentity
              ? runCardAuditV2({ card })
              : undefined);
          const clerkCtx = resolveCardClerkReviewContext(card, storeRules);
          const hasV2 = clerkCtx.hasV2;
          const decision = clerkCtx.decision;
          const v2ReviewStatus =
            clerkCtx.v2ReviewStatus ??
            resolveV2ReviewStatus({ card, audit: v2Audit });
          const storeRuleBlock = clerkCtx.storeRuleBlock;
          const staffTraining = buildStaffTrainingExplanation({
            card,
            audit: v2Audit,
            reviewStatus: v2ReviewStatus,
          });
          return (
          <div key={card.id} className={hasV2 ? "" : "rounded-xl border bg-white p-4"}>
            <div className="flex min-w-0 flex-col gap-3">
              {!hasV2 && (
              <div className="space-y-1.5 text-sm">
                {duplicateCardIds.has(card.id) && (
                  <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">
                    Possible duplicate entry
                  </p>
                )}
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-xl font-semibold leading-tight">
                    {cardDisplayName(card)}
                  </p>
                  {decision !== "pending" && (
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-bold uppercase ${
                        decision === "yes"
                          ? "bg-emerald-600 text-white"
                          : "bg-red-600 text-white"
                      }`}
                    >
                      {decision}
                    </span>
                  )}
                  {decision === "pending" && card.resaleAnalysis && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">
                      review
                    </span>
                  )}
                </div>
                <p className="text-gray-600">
                  {card.category} · {card.setName ?? "—"} · {card.cardNumber ?? "—"}
                </p>
                {card.ruleMatches?.length ? (
                  <p className="text-orange-700">
                    Rules: {card.ruleMatches.join(", ")}
                  </p>
                ) : null}
                {card.warnings?.map((w) => (
                  <p key={w} className="text-red-600">
                    ⚠ {w}
                  </p>
                ))}
              </div>
              )}

              {hasV2 && duplicateCardIds.has(card.id) && (
                <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">
                  Possible duplicate entry
                </p>
              )}

              {hasV2 && (
                <Suspense
                  fallback={
                    <div className="rounded-xl border border-violet-200 p-4 text-sm text-gray-500">
                      Loading card review…
                    </div>
                  }
                >
                <CardFlowV2MobileReviewCard
                  card={card}
                  identity={card.cardFlowV2Identity}
                  market={card.cardFlowV2Market}
                  offerPreview={card.cardFlowV2OfferPreview}
                  audit={v2Audit}
                  reviewStatus={v2ReviewStatus}
                  staffTraining={staffTraining}
                  reviewState={resolveClerkVisualReviewState({
                    card,
                    v2ReviewStatus,
                    storeRuleBlocked: Boolean(storeRuleBlock?.doNotBuy),
                  })}
                  storeRules={storeRules}
                  storeRuleBlock={storeRuleBlock}
                  bodyExtras={
                    <div className="space-y-4">
                      {editingCard === card.id && (
                        <CardEditForm
                          card={card}
                          onSave={(updates) => updateCard(card.id, updates)}
                          onCancel={() => setEditingCard(null)}
                        />
                      )}
                      {feedbackCard === card.id && (
                        <CardFeedbackForm
                          card={card}
                          onClose={() => setFeedbackCard(null)}
                        />
                      )}
                      {(card.category === "sports" ||
                        (card.visionJson as { category?: string } | undefined)
                          ?.category === "sports") && (
                        <CatalogLookupPanel
                          card={card}
                          onApplied={() => void loadOrder()}
                        />
                      )}
                      <SportsMarketplaceLinks
                        card={card}
                        identity={card.cardFlowV2Identity}
                        market={card.cardFlowV2Market}
                      />
                    </div>
                  }
                  footer={
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        disabled={saving}
                        variant={decision === "yes" ? "primary" : "secondary"}
                        onClick={() =>
                          updateCard(card.id, {
                            status: "approved",
                            staffDecision: "yes",
                          })
                        }
                      >
                        Yes
                      </Button>
                      <Button
                        disabled={saving}
                        variant={decision === "no" ? "danger" : "secondary"}
                        onClick={() =>
                          updateCard(card.id, {
                            status: "do_not_buy",
                            staffDecision: "no",
                          })
                        }
                      >
                        No
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() => {
                          setFeedbackCard(
                            feedbackCard === card.id ? null : card.id,
                          );
                          setEditingCard(null);
                        }}
                      >
                        Feedback
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() => {
                          setEditingCard(
                            editingCard === card.id ? null : card.id,
                          );
                          setFeedbackCard(null);
                        }}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        disabled={saving}
                        className="text-gray-500"
                        onClick={() => void removeCard(card.id)}
                      >
                        Remove
                      </Button>
                    </div>
                  }
                  legacyAdvanced={
                    <>
                      <details className="rounded-lg border border-indigo-200 bg-indigo-50/40">
                        <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-indigo-900">
                          Advanced / Legacy V1 Report
                        </summary>
                        <div className="border-t border-indigo-100 p-3">
                          <CardBuybackReportPanel
                            analysis={card.resaleAnalysis}
                            analyzing={analyzingCard === card.id}
                            onAnalyze={() => runFullAnalysis(card.id)}
                            className="border-0 bg-transparent p-0 shadow-none"
                          />
                        </div>
                      </details>

                      <CardIdentityPanel
                        verification={card.identityVerification}
                        frontImageUrl={card.frontImageUrl}
                        backImageUrl={card.backImageUrl}
                        cardName={cardDisplayName(card)}
                        conditionReport={card.conditionReport}
                      />

                      <CardConditionPanel
                        report={card.conditionReport}
                        conditionEstimate={card.conditionEstimate}
                        conditionOverride={card.conditionOverride}
                        lastStaffEdit={card.lastStaffEdit}
                      />

                      {card.salesComps && card.salesComps.recentSales.length > 0 && (
                        <PriceCompsPanel salesComps={card.salesComps} />
                      )}

                      {card.conditionLadder && (
                        <div>
                          <h4 className="mb-2 text-sm font-medium">
                            Condition price ladder
                          </h4>
                          <ConditionLadderTable
                            ladder={card.conditionLadder}
                            activeCondition={
                              card.conditionOverride?.condition ??
                              card.conditionEstimate
                            }
                          />
                        </div>
                      )}

                      {v2Audit && (
                        <CardFlowV2AuditPanel
                          cardId={card.id}
                          audit={v2Audit}
                          onSaved={() => void loadOrder()}
                        />
                      )}
                    </>
                  }
                  onSaved={(payload) => {
                    if (payload?.card || payload?.identity) {
                      setCards((prev) =>
                        prev.map((c) =>
                          c.id === card.id
                            ? {
                                ...c,
                                ...(payload.card ?? {}),
                                cardFlowV2Identity:
                                  payload.identity ??
                                  payload.card?.cardFlowV2Identity ??
                                  c.cardFlowV2Identity,
                                cardFlowV2Market:
                                  payload.market ??
                                  payload.card?.cardFlowV2Market ??
                                  c.cardFlowV2Market,
                                cardFlowV2OfferPreview:
                                  payload.offerPreview ??
                                  payload.card?.cardFlowV2OfferPreview ??
                                  c.cardFlowV2OfferPreview,
                                marketPrice:
                                  payload.card?.marketPrice ?? c.marketPrice,
                                cashOffer:
                                  payload.card?.cashOffer ?? c.cashOffer,
                                tradeOffer:
                                  payload.card?.tradeOffer ?? c.tradeOffer,
                                status: payload.card?.status ?? c.status,
                              }
                            : c,
                        ),
                      );
                    } else {
                      void loadOrder();
                    }
                  }}
                />
                </Suspense>
              )}

              {!hasV2 && (
                <CardFlowV2EvidencePanel
                  cardId={card.id}
                  evidence={card.cardFlowV2Evidence}
                  identity={card.cardFlowV2Identity}
                  market={card.cardFlowV2Market}
                  offerPreview={card.cardFlowV2OfferPreview}
                  onSaved={(payload) => {
                    if (payload?.identity) {
                      setCards((prev) =>
                        prev.map((c) =>
                          c.id === card.id
                            ? {
                                ...c,
                                cardFlowV2Identity:
                                  payload.identity ?? c.cardFlowV2Identity,
                                cardFlowV2Market:
                                  payload.market ?? c.cardFlowV2Market,
                                cardFlowV2OfferPreview:
                                  payload.offerPreview ?? c.cardFlowV2OfferPreview,
                              }
                            : c,
                        ),
                      );
                    } else {
                      void loadOrder();
                    }
                  }}
                />
              )}

              {!hasV2 && v2Audit && (
                <CardFlowV2AuditPanel
                  cardId={card.id}
                  audit={v2Audit}
                  onSaved={() => void loadOrder()}
                />
              )}
              {!hasV2 && (
                <>
              <CardIdentityPanel
                verification={card.identityVerification}
                frontImageUrl={card.frontImageUrl}
                backImageUrl={card.backImageUrl}
                cardName={cardDisplayName(card)}
                conditionReport={card.conditionReport}
              />
              {(card.category === "sports" ||
                (card.visionJson as { category?: string } | undefined)?.category ===
                  "sports") && (
                <CatalogLookupPanel card={card} onApplied={() => void loadOrder()} />
              )}
              <SportsMarketplaceLinks card={card} />
              <CardConditionPanel
                report={card.conditionReport}
                conditionEstimate={card.conditionEstimate}
                conditionOverride={card.conditionOverride}
                lastStaffEdit={card.lastStaffEdit}
              />
                {card.salesComps && card.salesComps.recentSales.length > 0 && (
                  <PriceCompsPanel salesComps={card.salesComps} />
                )}
                <CardBuybackReportPanel
                  analysis={card.resaleAnalysis}
                  analyzing={analyzingCard === card.id}
                  onAnalyze={() => runFullAnalysis(card.id)}
                />
                </>
              )}
              </div>

            {!hasV2 && card.conditionLadder && (
              <div className="mt-4">
                <h4 className="mb-2 text-sm font-medium">Condition price ladder</h4>
                <ConditionLadderTable
                  ladder={card.conditionLadder}
                  activeCondition={
                    card.conditionOverride?.condition ?? card.conditionEstimate
                  }
                />
              </div>
            )}

            {!hasV2 && editingCard === card.id && (
              <CardEditForm
                card={card}
                onSave={(updates) => updateCard(card.id, updates)}
                onCancel={() => setEditingCard(null)}
              />
            )}

            {!hasV2 && feedbackCard === card.id && (
              <CardFeedbackForm
                card={card}
                onClose={() => setFeedbackCard(null)}
              />
            )}

            {!hasV2 && (
            <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-gray-100 pt-4">
              <Button
                disabled={saving}
                variant={decision === "yes" ? "primary" : "secondary"}
                onClick={() =>
                  updateCard(card.id, {
                    status: "approved",
                    staffDecision: "yes",
                  })
                }
              >
                Yes
              </Button>
              <Button
                disabled={saving}
                variant={decision === "no" ? "danger" : "secondary"}
                onClick={() =>
                  updateCard(card.id, {
                    status: "do_not_buy",
                    staffDecision: "no",
                  })
                }
              >
                No
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setFeedbackCard(feedbackCard === card.id ? null : card.id);
                  setEditingCard(null);
                }}
              >
                Feedback
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setEditingCard(editingCard === card.id ? null : card.id);
                  setFeedbackCard(null);
                }}
              >
                Edit
              </Button>
              <Button
                variant="ghost"
                disabled={saving}
                className="text-gray-500"
                onClick={() => void removeCard(card.id)}
              >
                Remove
              </Button>
            </div>
            )}
          </div>
          );
        })}
      </div>

      <OrderOfferFooter
        orderStatus={order.status}
        totals={totals}
        offerType={order.offerType}
        completedAt={order.completedAt}
        purchaseAmount={order.purchaseAmount}
        saving={saving}
        onCompleteCash={() =>
          adminAction(
            {
              action: "complete_purchase",
              offerType: "cash",
            },
            { redirectToOrders: true },
          )
        }
        onCompleteTrade={() =>
          adminAction(
            {
              action: "complete_purchase",
              offerType: "trade",
            },
            { redirectToOrders: true },
          )
        }
        onCancelSale={() =>
          adminAction({ action: "cancel_sale" }, { redirectToOrders: true })
        }
        onReopen={(employeeName) =>
          adminAction({
            action: "reopen_order",
            employeeName,
          })
        }
      />
      <div className="h-28" aria-hidden />
    </AdminLayout>
  );
}

function OrderOfferFooter({
  orderStatus,
  totals,
  offerType,
  completedAt,
  purchaseAmount,
  saving,
  onCompleteCash,
  onCompleteTrade,
  onCancelSale,
  onReopen,
}: {
  orderStatus: BuybackOrder["status"];
  totals: ReturnType<typeof computeProductionOrderRunningTotals>;
  offerType?: "cash" | "trade";
  completedAt?: string;
  purchaseAmount?: number;
  saving: boolean;
  onCompleteCash: () => void;
  onCompleteTrade: () => void;
  onCancelSale: () => void;
  onReopen: (employeeName: string) => void;
}) {
  const finalized = orderStatus === "paid" || orderStatus === "cancelled";
  const [showReopen, setShowReopen] = useState(false);
  const [employeeName, setEmployeeName] = useState("");
  const [reopenError, setReopenError] = useState<string | null>(null);

  function handleReopen() {
    setReopenError(null);
    const name = employeeName.trim();
    if (!name) {
      setReopenError("Enter your name to reopen this order.");
      return;
    }
    onReopen(name);
    setShowReopen(false);
    setEmployeeName("");
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white/95 px-4 py-4 shadow-[0_-4px_24px_rgba(0,0,0,0.08)] backdrop-blur-sm">
      <div className="mx-auto flex max-w-5xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            {finalized ? "Finalized" : "Running total"}
          </p>
          {finalized ? (
            <>
              <p className="text-lg font-bold text-gray-900 capitalize">
                {orderStatus === "paid"
                  ? `Purchased · ${offerType ?? "cash"}`
                  : "Sale cancelled"}
              </p>
              {orderStatus === "paid" && purchaseAmount != null && (
                <p className="text-sm text-gray-700">
                  Paid ${purchaseAmount.toFixed(2)} · {totals.includedCount} card
                  {totals.includedCount === 1 ? "" : "s"}
                </p>
              )}
              {completedAt && (
                <p className="text-xs text-gray-500">
                  {new Date(completedAt).toLocaleString()}
                </p>
              )}
            </>
          ) : (
            <>
              <p className="text-lg font-bold text-gray-900">
                {totals.includedCount} card{totals.includedCount === 1 ? "" : "s"} ·
                Market ${totals.market.toFixed(2)}
              </p>
              <p className="text-sm text-gray-700">
                Cash ${totals.cash.toFixed(2)} · Trade ${totals.trade.toFixed(2)}
              </p>
            </>
          )}
        </div>
        {!finalized && (
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={saving || totals.includedCount === 0}
              onClick={onCompleteCash}
            >
              Cash ${totals.cash.toFixed(2)}
            </Button>
            <Button
              variant="secondary"
              disabled={saving || totals.includedCount === 0}
              onClick={onCompleteTrade}
            >
              Trade ${totals.trade.toFixed(2)}
            </Button>
            <Button
              variant="ghost"
              disabled={saving}
              className="text-red-600 hover:text-red-800"
              onClick={() => {
                if (window.confirm("Cancel this sale? No cards will be purchased.")) {
                  onCancelSale();
                }
              }}
            >
              Cancel sale
            </Button>
          </div>
        )}
        {finalized && (
          <div className="w-full sm:w-auto">
            {!showReopen ? (
              <Button
                variant="secondary"
                disabled={saving}
                onClick={() => setShowReopen(true)}
              >
                Reopen order
              </Button>
            ) : (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                <p className="text-xs font-medium text-amber-950">
                  Reopening is logged with your name
                </p>
                <input
                  value={employeeName}
                  onChange={(e) => setEmployeeName(e.target.value)}
                  placeholder="Your name"
                  className="mt-2 w-full rounded-lg border border-amber-200 px-3 py-2 text-sm sm:min-w-[200px]"
                />
                {reopenError && (
                  <p className="mt-1 text-xs text-red-600">{reopenError}</p>
                )}
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button disabled={saving} onClick={handleReopen}>
                    Confirm reopen
                  </Button>
                  <Button
                    variant="ghost"
                    disabled={saving}
                    onClick={() => {
                      setShowReopen(false);
                      setEmployeeName("");
                      setReopenError(null);
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function CardEditForm({
  card,
  onSave,
  onCancel,
}: {
  card: ScannedCard;
  onSave: (updates: Partial<ScannedCard>) => void;
  onCancel: () => void;
}) {
  const activeCondition =
    card.conditionOverride?.condition ?? card.conditionEstimate ?? "LP";
  const staffSuspect = card.cardFlowV2Identity
    ? getStaffSelectedSuspect(card.cardFlowV2Identity)
    : undefined;
  const blocksTcgPricing = suspectBlocksTcgplayerPricing(staffSuspect);
  const [condition, setCondition] = useState<ConditionEstimate>(activeCondition);
  const initialOffers =
    staffEditOffersForCondition(card, activeCondition) ??
    (!blocksTcgPricing
      ? offersFromLadder(card.conditionLadder, activeCondition)
      : null);
  const suggestedCash =
    card.resaleAnalysis?.suggestedCashOffer ??
    card.resaleAnalysis?.maxBuyPrice;
  const initialMarket =
    initialOffers?.marketValue ?? (blocksTcgPricing ? 0 : card.marketPrice ?? 0);
  const initialCash =
    initialOffers?.cashOffer ??
    (blocksTcgPricing ? 0 : card.cashOffer ?? suggestedCash ?? 0);
  const initialTrade =
    initialOffers?.tradeOffer ?? (blocksTcgPricing ? 0 : card.tradeOffer ?? 0);
  const [market, setMarket] = useState(String(initialMarket));
  const [cash, setCash] = useState(String(initialCash));
  const [trade, setTrade] = useState(String(initialTrade));
  const [staffName, setStaffName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pricesAuto, setPricesAuto] = useState(true);

  function handleConditionChange(next: ConditionEstimate) {
    setCondition(next);
    const row =
      staffEditOffersForCondition(card, next) ??
      (!blocksTcgPricing ? offersFromLadder(card.conditionLadder, next) : null);
    if (row) {
      setMarket(row.marketValue.toFixed(2));
      setCash(row.cashOffer.toFixed(2));
      setTrade(row.tradeOffer.toFixed(2));
      setPricesAuto(true);
    }
  }

  const marketNum = parseFloat(market) || 0;
  const cashNum = parseFloat(cash) || 0;
  const tradeNum = parseFloat(trade) || 0;
  const hasChanges =
    condition !== activeCondition ||
    marketNum !== initialMarket ||
    cashNum !== initialCash ||
    tradeNum !== initialTrade;

  function handleSave() {
    setError(null);
    if (hasChanges) {
      const name = staffName.trim();
      if (!name) {
        setError("Enter your name to save edits.");
        return;
      }
    }

    const updates: Partial<ScannedCard> = {
      marketPrice: marketNum,
      cashOffer: cashNum,
      tradeOffer: tradeNum,
    };

    if (hasChanges) {
      const audit: StaffEditRecord = {
        changedByName: staffName.trim(),
        changedAt: new Date().toISOString(),
      };
      updates.lastStaffEdit = audit;

      updates.conditionEstimate = condition;
      if (condition !== activeCondition) {
        updates.conditionOverride = {
          condition,
          previousCondition: activeCondition,
          changedByName: audit.changedByName,
          changedAt: audit.changedAt,
        };
      }
    }

    onSave(updates);
  }

  return (
    <div className="mt-4 rounded-lg border border-indigo-100 bg-indigo-50/40 p-4">
      <p className="text-sm font-semibold text-gray-900">Edit offer</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block text-sm">
          <span className="text-xs font-medium text-gray-600">Condition</span>
          <select
            value={condition}
            onChange={(e) =>
              handleConditionChange(e.target.value as ConditionEstimate)
            }
            className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
          >
            {["NM", "LP", "MP", "HP", "DMG"].map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="text-xs font-medium text-gray-600">Market price</span>
          <input
            value={market}
            onChange={(e) => {
              setMarket(e.target.value);
              setPricesAuto(false);
            }}
            type="number"
            min={0}
            step="0.01"
            className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
          />
        </label>
        <label className="block text-sm">
          <span className="text-xs font-medium text-gray-600">Buy price (cash)</span>
          <input
            value={cash}
            onChange={(e) => {
              setCash(e.target.value);
              setPricesAuto(false);
            }}
            type="number"
            min={0}
            step="0.01"
            className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
          />
        </label>
        <label className="block text-sm">
          <span className="text-xs font-medium text-gray-600">Trade price</span>
          <input
            value={trade}
            onChange={(e) => {
              setTrade(e.target.value);
              setPricesAuto(false);
            }}
            type="number"
            min={0}
            step="0.01"
            className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
          />
        </label>
      </div>
      {pricesAuto && condition !== activeCondition && (
        <p className="mt-2 text-xs text-indigo-700">
          Market, cash, and trade updated from TCGplayer lowest listing for{" "}
          {condition}.
        </p>
      )}
      <label className="mt-3 block text-sm">
        <span className="text-xs font-medium text-gray-600">
          Your name {hasChanges ? "(required)" : ""}
        </span>
        <input
          value={staffName}
          onChange={(e) => setStaffName(e.target.value)}
          placeholder="Staff name"
          className="mt-1 w-full max-w-xs rounded-lg border px-3 py-2 text-sm"
        />
      </label>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      <div className="mt-4 flex gap-2">
        <Button onClick={handleSave}>Save</Button>
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function findDuplicateCardIds(cards: ScannedCard[]): Set<string> {
  const seen = new Map<string, string>();
  const dupes = new Set<string>();
  for (const card of cards) {
    if (!card.detectedName?.trim()) continue;
    const key = [
      card.detectedName.trim().toLowerCase(),
      card.setName?.trim().toLowerCase() ?? "",
      card.cardNumber?.trim().toLowerCase() ?? "",
    ].join("|");
    const prior = seen.get(key);
    if (prior) {
      dupes.add(prior);
      dupes.add(card.id);
    } else {
      seen.set(key, card.id);
    }
  }
  return dupes;
}
