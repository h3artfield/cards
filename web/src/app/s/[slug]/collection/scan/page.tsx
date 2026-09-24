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
import { collectionScannerAppHref } from "@/lib/collection/collection-scanner-app";

type Step = "front" | "identifying" | "saved";

export default function CollectionScanPage() {
  const { slug } = useParams<{ slug: string }>();
  const { customer, loading: customerLoading } = useCustomer();

  const [step, setStep] = useState<Step>("front");
  const [frontUrl, setFrontUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<CollectionCard[]>([]);

  function resetCapture() {
    setFrontUrl(null);
    setError(null);
    setStep("front");
  }

  async function identifyFront(url: string) {
    setFrontUrl(url);
    setStep("identifying");
    setError(null);
    try {
      const { card } = await apiFetch<{ card: CollectionCard }>(
        `/api/store/${encodeURIComponent(slug)}/collection`,
        {
          method: "POST",
          body: JSON.stringify({ frontImageUrl: url }),
        },
      );
      setAdded((prev) => [card, ...prev]);
      setFrontUrl(null);
      setStep("saved");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not identify that card.",
      );
      setStep("front");
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

  if (!customer.emailVerified) {
    return (
      <CustomerAuthShell>
        <h1 className={authHeading}>Verify your email</h1>
        <p className={`mt-3 ${authSubtext}`}>
          Check your inbox for the verification link before scanning cards
          into your collection.
        </p>
        <Link href={`/s/${slug}/collection`} className={`mt-6 block text-center ${authLink}`}>
          Back to collection
        </Link>
      </CustomerAuthShell>
    );
  }

  if (step === "front") {
    return (
      <div className="fixed inset-0 z-10 flex flex-col bg-white px-3 pb-[env(safe-area-inset-bottom)] pt-[max(0.5rem,env(safe-area-inset-top))]">
        <div className="mb-2 flex shrink-0 items-center justify-between">
          <div>
            <p className="text-xs text-gray-500">My collection</p>
            <h1 className="text-lg font-bold">Front photo</h1>
          </div>
          <span className="rounded-full bg-indigo-100 px-3 py-1 text-xs font-medium text-indigo-800">
            {added.length} added
          </span>
        </div>
        <div className="mb-3 border border-neutral-800 bg-neutral-950 px-3 py-3">
          <p className="text-sm text-white">Scan from the store app</p>
          <p className="mt-1 text-xs text-neutral-400">
            Live matching stays on the phone. This page is the fallback for
            desktop and cards the app cannot index.
          </p>
          <a href={collectionScannerAppHref(slug)} className={`mt-3 block ${authButton} no-underline`}>
            Open Collection Scanner
          </a>
        </div>

        {error ? (
          <p className="mb-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </p>
        ) : null}

        <div className="min-h-0 flex-1">
          <CameraCapture
            key={frontUrl ?? "front"}
            side="front"
            captureMode="raw"
            label="Place the front of the card in the frame."
            onCapture={(url) => void identifyFront(url)}
            onRetake={() => setFrontUrl(null)}
            previewUrl={frontUrl}
          />
        </div>
      </div>
    );
  }

  if (step === "identifying" && frontUrl) {
    return (
      <CustomerAuthShell>
        <h1 className={authHeading}>Finding this card…</h1>
        <p className={`mt-3 ${authSubtext}`}>
          Reading the name and set from the front.
        </p>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={frontUrl}
          alt="Card front"
          className="mt-6 w-full border border-neutral-800 object-contain"
        />
      </CustomerAuthShell>
    );
  }

  return (
    <CustomerAuthShell>
      <h1 className={authHeading}>Added to your collection</h1>

      {error && <p className={`mt-6 ${authError}`}>{error}</p>}

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
              className="h-40 w-[7.15rem] shrink-0 object-cover"
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

      <Link
        href={`/s/${slug}/collection`}
        className={`mt-8 block text-center ${authLink}`}
      >
        Back to collection
      </Link>
    </CustomerAuthShell>
  );
}
