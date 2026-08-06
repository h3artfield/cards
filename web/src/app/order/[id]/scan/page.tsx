"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { CameraCapture } from "@/components/CameraCapture";
import { Button } from "@/components/Button";
import { apiFetch } from "@/lib/api-client";
import { CONSENT_TEXT } from "@/lib/constants";
import { isOrderLockedForScanning } from "@/lib/customer-order-display";
import type { BuybackOrder, ItemType, ScannedCard } from "@/lib/types";

type Step = "front" | "back" | "confirm" | "consent";

export default function ScanPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [step, setStep] = useState<Step>("front");
  const [frontUrl, setFrontUrl] = useState<string | null>(null);
  const [backUrl, setBackUrl] = useState<string | null>(null);
  const [cards, setCards] = useState<ScannedCard[]>([]);
  const [order, setOrder] = useState<BuybackOrder | null>(null);
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savingCard, setSavingCard] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const currentBatchSavedRef = useRef(false);
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

  async function saveCurrentCard(options?: { resetAfter?: boolean }) {
    if (!frontUrl || !backUrl) return;
    setSavingCard(true);
    setError(null);
    try {
      await apiFetch("/api/cards", {
        method: "POST",
        body: JSON.stringify({
          orderId: id,
          itemType: "unknown" as ItemType,
          frontImageUrl: frontUrl,
          backImageUrl: backUrl,
        }),
      });
      currentBatchSavedRef.current = true;
      await loadOrder();
      if (options?.resetAfter !== false) {
        resetCardFlow();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save card.");
      throw err;
    } finally {
      setSavingCard(false);
    }
  }

  async function ensureCurrentCardSaved() {
    if (!frontUrl || !backUrl || currentBatchSavedRef.current) return;
    await saveCurrentCard({ resetAfter: false });
  }

  function resetCardFlow() {
    setFrontUrl(null);
    setBackUrl(null);
    setStep("front");
    currentBatchSavedRef.current = false;
  }

  async function finishOrder() {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    setError(null);
    try {
      await ensureCurrentCardSaved();
      await apiFetch(`/api/orders/${id}/submit`, { method: "POST" });
      router.replace(`/order/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Submit failed");
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  async function requestFinish() {
    if (frontUrl && !backUrl) {
      setStep("back");
      return;
    }
    if (frontUrl && backUrl) {
      try {
        await ensureCurrentCardSaved();
        setStep("consent");
      } catch {
        /* error shown inline */
      }
      return;
    }
    if (cards.length > 0) {
      setStep("consent");
    } else {
      setError("Add at least one card before finishing.");
    }
  }

  if (!order) {
    return (
      <div className="mx-auto max-w-lg px-6 py-10">
        {error ?? "Loading..."}
      </div>
    );
  }

  const capturing = step === "front" || step === "back";
  const captureSide = step === "back" ? "back" : "front";
  const captureTitle =
    step === "front"
      ? "Front photo"
      : step === "back"
        ? "Back photo"
        : "Scan Cards";

  return (
    <div
      className={
        capturing
          ? "fixed inset-0 z-10 flex flex-col bg-white px-3 pb-[env(safe-area-inset-bottom)] pt-[max(0.5rem,env(safe-area-inset-top))]"
          : "mx-auto min-h-screen max-w-lg px-6 py-8"
      }
    >
      <div
        className={
          capturing
            ? "mb-2 flex shrink-0 items-center justify-between"
            : "mb-6 flex items-center justify-between"
        }
      >
        <div>
          <p className="text-xs text-gray-500">{order.orderNumber}</p>
          <h1 className={capturing ? "text-lg font-bold" : "text-xl font-bold"}>
            {capturing ? captureTitle : "Scan Cards"}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-indigo-100 px-3 py-1 text-xs font-medium text-indigo-800">
            {cards.length} card{cards.length !== 1 ? "s" : ""}
          </span>
          {cards.length > 0 && step !== "consent" && (
            <button
              type="button"
              onClick={() => void requestFinish()}
              className="text-xs font-medium text-indigo-600"
            >
              Finish
            </button>
          )}
        </div>
      </div>

      {capturing ? (
        <div className="min-h-0 flex-1">
          <CameraCapture
            key={step}
            side={captureSide}
            captureMode="raw"
            label={
              step === "front"
                ? "Place the front of the card inside the rectangle."
                : "Flip the card and capture the back."
            }
            onCapture={(url) => {
              if (step === "front") {
                setFrontUrl(url);
                setStep("back");
              } else {
                setBackUrl(url);
                setStep("confirm");
              }
            }}
            onRetake={() => {
              if (step === "front") {
                setFrontUrl(null);
              } else {
                setBackUrl(null);
              }
            }}
            previewUrl={step === "front" ? frontUrl : backUrl}
          />
        </div>
      ) : (
        <>
          {step === "confirm" && frontUrl && backUrl && (
            <div className="space-y-4">
              <h2 className="font-semibold">Confirm this card</h2>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="mb-1 text-xs font-medium text-gray-500">Front</p>
                  <img
                    src={frontUrl}
                    alt="Card front"
                    className="w-full rounded-lg border object-contain"
                  />
                </div>
                <div>
                  <p className="mb-1 text-xs font-medium text-gray-500">Back</p>
                  <img
                    src={backUrl}
                    alt="Card back"
                    className="w-full rounded-lg border object-contain"
                  />
                </div>
              </div>
              <Button
                fullWidth
                disabled={savingCard}
                onClick={async () => {
                  try {
                    await saveCurrentCard();
                  } catch {
                    /* error shown inline */
                  }
                }}
              >
                {savingCard ? "Saving card…" : "Add Another Card"}
              </Button>
              <Button
                variant="secondary"
                fullWidth
                disabled={savingCard}
                onClick={() => void requestFinish()}
              >
                Finish Order
              </Button>
              <Button
                variant="ghost"
                fullWidth
                disabled={savingCard}
                onClick={resetCardFlow}
              >
                Retake Photos
              </Button>
            </div>
          )}

          {step === "consent" && (
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
                disabled={!consent || submitting}
                onClick={() => void finishOrder()}
              >
                {submitting ? "Submitting…" : "Submit Order"}
              </Button>
            </div>
          )}

          {error && (
            <div className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <Link
            href={`/order/${id}`}
            className="mt-6 block text-center text-sm text-gray-500"
          >
            View order status
          </Link>
        </>
      )}
    </div>
  );
}
