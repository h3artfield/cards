"use client";

import Link from "next/link";
import { useState } from "react";
import { useParams } from "next/navigation";
import { CameraCapture } from "@/components/CameraCapture";
import { CustomerAuthShell } from "@/components/CustomerAuthShell";
import { useCustomer } from "@/context/CustomerContext";
import { apiFetch } from "@/lib/api-client";
import {
  authButton,
  authButtonSecondary,
  authError,
  authHeading,
  authLink,
  authSubtext,
} from "@/lib/customer-auth-ui";
import type { CollectionCard } from "@/lib/types";

type Step = "front" | "back" | "confirm" | "saved";

export default function CollectionScanPage() {
  const { slug } = useParams<{ slug: string }>();
  const { customer, loading: customerLoading } = useCustomer();

  const [step, setStep] = useState<Step>("front");
  const [frontUrl, setFrontUrl] = useState<string | null>(null);
  const [backUrl, setBackUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<CollectionCard[]>([]);

  function resetCapture() {
    setFrontUrl(null);
    setBackUrl(null);
    setStep("front");
  }

  async function saveToCollection() {
    if (!frontUrl) return;
    setSaving(true);
    setError(null);
    try {
      const { card } = await apiFetch<{ card: CollectionCard }>(
        `/api/store/${encodeURIComponent(slug)}/collection`,
        {
          method: "POST",
          body: JSON.stringify({
            frontImageUrl: frontUrl,
            backImageUrl: backUrl ?? undefined,
          }),
        },
      );
      setAdded((prev) => [card, ...prev]);
      setFrontUrl(null);
      setBackUrl(null);
      setStep("saved");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not add the card.",
      );
    } finally {
      setSaving(false);
    }
  }

  if (customerLoading) {
    return (
      <CustomerAuthShell>
        <p className={authSubtext}>Loading…</p>
      </CustomerAuthShell>
    );
  }

  if (!customer) {
    return (
      <CustomerAuthShell>
        <h1 className={authHeading}>Sign in to scan</h1>
        <p className={`mt-3 ${authSubtext}`}>
          Your collection is tied to your account at this store.
        </p>
        <Link
          href={`/sign-in?store=${encodeURIComponent(slug)}&return=1`}
          className={`mt-6 block ${authButton} no-underline`}
        >
          Sign in
        </Link>
      </CustomerAuthShell>
    );
  }

  const capturing = step === "front" || step === "back";

  if (capturing) {
    return (
      <div className="fixed inset-0 z-10 flex flex-col bg-white px-3 pb-[env(safe-area-inset-bottom)] pt-[max(0.5rem,env(safe-area-inset-top))]">
        <div className="mb-2 flex shrink-0 items-center justify-between">
          <div>
            <p className="text-xs text-gray-500">My collection</p>
            <h1 className="text-lg font-bold">
              {step === "front" ? "Front photo" : "Back photo"}
            </h1>
          </div>
          <span className="rounded-full bg-indigo-100 px-3 py-1 text-xs font-medium text-indigo-800">
            {added.length} added
          </span>
        </div>

        <div className="min-h-0 flex-1">
          <CameraCapture
            key={step}
            side={step === "back" ? "back" : "front"}
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
              if (step === "front") setFrontUrl(null);
              else setBackUrl(null);
            }}
            previewUrl={step === "front" ? frontUrl : backUrl}
          />
        </div>

        {step === "back" && (
          <button
            type="button"
            className="shrink-0 py-3 text-sm text-gray-500"
            onClick={() => setStep("confirm")}
          >
            Skip the back photo
          </button>
        )}
      </div>
    );
  }

  return (
    <CustomerAuthShell>
      <h1 className={authHeading}>
        {step === "confirm" ? "Confirm this card" : "Added to your collection"}
      </h1>

      {error && <p className={`mt-6 ${authError}`}>{error}</p>}

      {step === "confirm" && frontUrl && (
        <>
          <div className="mt-6 grid grid-cols-2 gap-3">
            <div>
              <p className="mb-1 text-xs uppercase tracking-wide text-neutral-500">
                Front
              </p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={frontUrl}
                alt="Card front"
                className="w-full border border-neutral-700 object-contain"
              />
            </div>
            {backUrl && (
              <div>
                <p className="mb-1 text-xs uppercase tracking-wide text-neutral-500">
                  Back
                </p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={backUrl}
                  alt="Card back"
                  className="w-full border border-neutral-700 object-contain"
                />
              </div>
            )}
          </div>

          <div className="mt-6 space-y-3">
            <button
              type="button"
              className={authButton}
              disabled={saving}
              onClick={() => void saveToCollection()}
            >
              {saving ? "Identifying…" : "Add to my collection"}
            </button>
            <button
              type="button"
              className={authButtonSecondary}
              disabled={saving}
              onClick={resetCapture}
            >
              Retake photos
            </button>
          </div>
        </>
      )}

      {step === "saved" && (
        <>
          <p className={`mt-3 ${authSubtext}`}>
            {added.length} card{added.length === 1 ? "" : "s"} added this
            session.
          </p>

          <ul className="mt-6 space-y-3">
            {added.map((card) => (
              <li
                key={card.id}
                className="flex items-center gap-3 border border-neutral-800 p-3"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={card.frontImageUrl}
                  alt={card.displayName}
                  className="h-16 w-12 shrink-0 object-cover"
                />
                <div className="min-w-0">
                  <p className="truncate text-sm text-white">
                    {card.displayName}
                  </p>
                  <p className="truncate text-xs text-neutral-500">
                    {[card.setName, card.cardNumber && `#${card.cardNumber}`]
                      .filter(Boolean)
                      .join(" · ") ||
                      (card.needsReview ? "Not identified" : "In your binder")}
                  </p>
                </div>
              </li>
            ))}
          </ul>

          <div className="mt-8 space-y-3">
            <button type="button" className={authButton} onClick={resetCapture}>
              Scan another card
            </button>
            <Link
              href={`/s/${slug}/collection`}
              className={`block ${authButtonSecondary} no-underline`}
            >
              View my collection
            </Link>
          </div>
        </>
      )}

      <Link
        href={`/s/${slug}/scan`}
        className={`mt-8 block text-center ${authLink}`}
      >
        Back to scan options
      </Link>
    </CustomerAuthShell>
  );
}
