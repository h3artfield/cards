"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  LiveCardScanner,
  type LiveScanMatchPayload,
} from "@/components/LiveCardScanner";
import { PrintingPickerSheet } from "@/components/PrintingPickerSheet";
import type { PrintingSearchOption } from "@/app/api/scan-index/printings/route";
import type { ScanIndexCard } from "@/lib/scan-index/types";
import { Button } from "@/components/Button";
import { apiFetch } from "@/lib/api-client";
import { CONSENT_TEXT } from "@/lib/constants";
import { isOrderLockedForScanning } from "@/lib/customer-order-display";
import type { BuybackOrder, CardCategory, ItemType, ScannedCard } from "@/lib/types";

type Step = "scanning" | "consent";

export default function ScanPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [step, setStep] = useState<Step>("scanning");
  const [cards, setCards] = useState<ScannedCard[]>([]);
  const [order, setOrder] = useState<BuybackOrder | null>(null);
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [pendingSaves, setPendingSaves] = useState(0);
  const [editingTrayCard, setEditingTrayCard] = useState<ScannedCard | null>(
    null,
  );
  const submittingRef = useRef(false);

  const loadOrder = useCallback(async () => {
    const data = await apiFetch<{
      order: BuybackOrder;
      cards: ScannedCard[];
    }>(`/api/orders/${id}`);
    setOrder(data.order);
    setCards(data.cards);
  }, [id]);

  useEffect(() => {
    loadOrder().catch((err) => {
      setError(
        err instanceof Error ? err.message : "Could not load order. Try again.",
      );
    });
  }, [loadOrder]);

  useEffect(() => {
    if (order && isOrderLockedForScanning(order.status)) {
      router.replace(`/order/${id}`);
    }
  }, [order, id, router]);

  const applyPrintingToScannedCard = useCallback(
    async (targetCardId: string, printing: PrintingSearchOption | ScanIndexCard) => {
      const category: CardCategory =
        printing.catalogSource === "pokemon_tcg"
          ? "pokemon"
          : printing.catalogSource === "ygoprodeck"
            ? "yugioh"
            : "magic";

      const updates: Partial<ScannedCard> = {
        detectedName: printing.name,
        setName: printing.setName,
        setCode: printing.setCode,
        cardNumber: printing.cardNumber,
        catalogId: printing.catalogId,
        catalogSource: printing.catalogSource,
        category,
      };

      setCards((prev) =>
        prev.map((c) => (c.id === targetCardId ? { ...c, ...updates } : c)),
      );

      if (targetCardId.startsWith("temp-")) return;

      try {
        const res = await apiFetch<{ card: ScannedCard }>("/api/cards", {
          method: "PATCH",
          body: JSON.stringify({
            id: targetCardId,
            ...updates,
          }),
        });
        setCards((prev) =>
          prev.map((c) => (c.id === targetCardId ? res.card : c)),
        );
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Could not update card printing.",
        );
      }
    },
    [],
  );

  const handleCardDetected = useCallback(
    async (payload: LiveScanMatchPayload) => {
      setError(null);
      const matched = payload.card;
      const category: CardCategory | undefined = matched
        ? matched.catalogSource === "pokemon_tcg"
          ? "pokemon"
          : matched.catalogSource === "ygoprodeck"
            ? "yugioh"
            : "magic"
        : payload.game === "other"
          ? undefined
          : payload.game;

      // Optimistic card entry so the user sees it immediately with zero lag
      const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const optimisticCard: ScannedCard = {
        id: tempId,
        orderId: id,
        frontImageUrl: payload.frontImageUrl,
        backImageUrl: "",
        itemType: "raw" as ItemType,
        category,
        detectedName: matched?.name,
        setName: matched?.setName,
        setCode: matched?.setCode,
        cardNumber: matched?.cardNumber,
        catalogSource: matched?.catalogSource,
        catalogId: matched?.catalogId,
        scanMatchDistance: payload.matchDistance,
        status: "pending",
        createdAt: new Date().toISOString(),
      };

      setCards((prev) => [optimisticCard, ...prev]);
      setPendingSaves((n) => n + 1);

      try {
        const res = await apiFetch<{ card: ScannedCard }>("/api/cards", {
          method: "POST",
          body: JSON.stringify({
            orderId: id,
            itemType: "raw" as ItemType,
            frontImageUrl: payload.frontImageUrl,
            backImageUrl: "",
            category,
            detectedName: matched?.name,
            setName: matched?.setName,
            setCode: matched?.setCode,
            cardNumber: matched?.cardNumber,
            catalogSource: matched?.catalogSource,
            catalogId: matched?.catalogId,
            scanMatchDistance: payload.matchDistance,
            allowDuplicate: true,
          }),
        });
        setCards((prev) =>
          prev.map((c) => (c.id === tempId ? res.card : c)),
        );
      } catch (err) {
        setCards((prev) => prev.filter((c) => c.id !== tempId));
        setError(err instanceof Error ? err.message : "Could not save card.");
      } finally {
        setPendingSaves((n) => Math.max(0, n - 1));
      }
    },
    [id],
  );

  // When the user switches the printing on the live scanner HUD, update the most recently added card in the tray
  const handleLivePrintingSwitched = useCallback(
    async (newCard: ScanIndexCard) => {
      const mostRecent = cards[0];
      if (!mostRecent) return;
      await applyPrintingToScannedCard(mostRecent.id, newCard);
    },
    [applyPrintingToScannedCard, cards],
  );

  async function removeScannedCard(cardId: string) {
    if (cardId.startsWith("temp-")) {
      setCards((prev) => prev.filter((c) => c.id !== cardId));
      return;
    }
    const previous = cards;
    setCards((prev) => prev.filter((c) => c.id !== cardId));
    try {
      await apiFetch(`/api/cards?id=${encodeURIComponent(cardId)}`, {
        method: "DELETE",
      });
    } catch (err) {
      setCards(previous);
      setError(err instanceof Error ? err.message : "Could not remove card.");
    }
  }

  async function finishOrder() {
    if (submittingRef.current || pendingSaves > 0) return;
    submittingRef.current = true;
    setSubmitting(true);
    setError(null);
    try {
      await apiFetch(`/api/orders/${id}/submit`, { method: "POST" });
      router.replace(`/order/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Submit failed");
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  function requestFinish() {
    if (cards.length > 0) {
      setStep("consent");
    } else {
      setError("Scan at least one card before finishing.");
    }
  }

  if (!order) {
    return (
      <div className="mx-auto max-w-lg px-6 py-10">
        {error ?? "Loading..."}
      </div>
    );
  }

  if (step === "consent") {
    return (
      <div className="mx-auto min-h-screen max-w-lg px-6 py-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-500">{order.orderNumber}</p>
            <h1 className="text-xl font-bold">Submit Buyback Order</h1>
          </div>
          <span className="rounded-full bg-indigo-100 px-3 py-1 text-xs font-medium text-indigo-800">
            {cards.length} card{cards.length !== 1 ? "s" : ""}
          </span>
        </div>

        <div className="space-y-4">
          <p className="text-sm text-gray-700">{CONSENT_TEXT}</p>
          <label className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              className="mt-1"
            />
            <span>I agree and want to submit my order.</span>
          </label>
          <Button
            fullWidth
            disabled={!consent || submitting || pendingSaves > 0}
            onClick={() => void finishOrder()}
          >
            {submitting
              ? "Submitting…"
              : pendingSaves > 0
                ? `Saving ${pendingSaves} card(s)…`
                : `Submit ${cards.length} Card${cards.length === 1 ? "" : "s"}`}
          </Button>
          <Button
            variant="secondary"
            fullWidth
            disabled={submitting}
            onClick={() => setStep("scanning")}
          >
            Back to Live Scanner
          </Button>
        </div>

        {error && (
          <div className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-10 flex flex-col bg-neutral-950 text-white pb-[env(safe-area-inset-bottom)] pt-[max(0.5rem,env(safe-area-inset-top))]">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between px-3 pb-2">
        <div>
          <p className="text-[11px] font-medium text-neutral-400">
            {order.orderNumber} · Front-Only Rapid Scan
          </p>
          <h1 className="text-base font-bold text-white">Live Card Scanner</h1>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-indigo-500/20 px-3 py-1 text-xs font-semibold text-indigo-300 ring-1 ring-indigo-500/40">
            {cards.length} card{cards.length !== 1 ? "s" : ""}
            {pendingSaves > 0 ? " (saving…)" : ""}
          </span>
          {cards.length > 0 && (
            <button
              type="button"
              onClick={requestFinish}
              disabled={pendingSaves > 0}
              className="rounded-xl bg-emerald-500 px-3.5 py-1.5 text-xs font-extrabold text-neutral-950 shadow hover:bg-emerald-400 disabled:opacity-50"
            >
              Finish Order →
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="mx-3 mb-2 rounded-lg border border-red-500/40 bg-red-950/80 px-3 py-2 text-xs text-red-200">
          {error}
        </div>
      )}

      {/* Live Viewfinder */}
      <div className="min-h-0 flex-1 px-2">
        <LiveCardScanner
          onCardDetected={handleCardDetected}
          onCardPrintingSwitched={handleLivePrintingSwitched}
          autoAdd
        />
      </div>

      {/* Running Scanned Cards Tray */}
      <div className="shrink-0 border-t border-neutral-800 bg-neutral-900/95 px-3 py-2.5">
        {cards.length === 0 ? (
          <div className="flex items-center justify-between text-xs text-neutral-400">
            <span>Hold each card in the frame — it adds automatically.</span>
            <Link
              href={`/order/${id}`}
              className="text-neutral-400 underline hover:text-white"
            >
              Order status
            </Link>
          </div>
        ) : (
          <div>
            <p className="mb-1.5 text-[10px] font-medium text-neutral-400">
              Tap any card below to change its set / printing:
            </p>
            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              {cards.map((card) => (
                <div
                  key={card.id}
                  className="flex shrink-0 items-center gap-2 rounded-xl border border-neutral-800 bg-neutral-950 px-2.5 py-1.5 hover:border-indigo-500/60"
                >
                  <button
                    type="button"
                    onClick={() => setEditingTrayCard(card)}
                    className="flex items-center gap-2 text-left"
                    title="Change printing or card"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={card.frontImageUrl}
                      alt={card.detectedName ?? "Scanned card"}
                      className="h-9 w-7 shrink-0 rounded object-cover"
                    />
                    <div className="max-w-[9.5rem] min-w-0">
                      <p className="truncate text-xs font-semibold text-white">
                        {card.detectedName ?? "Tap to identify"}
                      </p>
                      <p className="truncate text-[10px] text-indigo-300 underline">
                        {[
                          card.setName ?? card.setCode?.toUpperCase(),
                          card.cardNumber && `#${card.cardNumber}`,
                        ]
                          .filter(Boolean)
                          .join(" · ") || "Change printing"}
                      </p>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => void removeScannedCard(card.id)}
                    className="ml-1 rounded p-1 text-xs text-neutral-500 hover:bg-neutral-800 hover:text-red-400"
                    title="Remove card"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Visual Printing Picker Drawer for any card tapped in the tray */}
      <PrintingPickerSheet
        open={Boolean(editingTrayCard)}
        initialName={editingTrayCard?.detectedName ?? ""}
        initialGame={
          editingTrayCard?.category === "pokemon"
            ? "pokemon"
            : editingTrayCard?.category === "magic"
              ? "magic"
              : "all"
        }
        currentCatalogId={editingTrayCard?.catalogId}
        onClose={() => setEditingTrayCard(null)}
        onSelectPrinting={(picked) => {
          if (editingTrayCard) {
            void applyPrintingToScannedCard(editingTrayCard.id, picked);
          }
          setEditingTrayCard(null);
        }}
      />
    </div>
  );
}
