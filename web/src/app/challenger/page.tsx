"use client";

import { FormEvent, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { CustomerOAuthButtons } from "@/components/CustomerOAuthButtons";
import { apiFetch } from "@/lib/api-client";
import { googleAuthErrorMessage } from "@/lib/customer-auth-config";
import {
  authButton,
  authButtonSecondary,
  authContainer,
  authError,
  authHeading,
  authInput,
  authLabel,
  authPage,
  authSubtext,
} from "@/lib/customer-auth-ui";

type Profile = { displayName: string | null; emailVerified: boolean };

const DECKS = "/challenger/decks";

function deckDestination(raw: string | null): string | null {
  if (!raw || raw.includes("://") || raw.startsWith("//")) return null;
  if (raw === "/challenger/decks" || raw.startsWith("/s/the-game-lodge/")) return raw;
  return null;
}

export default function ChallengerPage() {
  return (
    <Suspense fallback={<main className={authPage}><div className={authContainer}><p className={authSubtext}>Loading…</p></div></main>}>
      <ChallengerAccount />
    </Suspense>
  );
}

function ChallengerAccount() {
  const searchParams = useSearchParams();
  const afterAccount = deckDestination(searchParams.get("next"));
  const [profile, setProfile] = useState<Profile | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [age13, setAge13] = useState(false);
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [editingName, setEditingName] = useState(false);

  useEffect(() => {
    let active = true;
    apiFetch<Profile>("/api/challenger/profile")
      .then((next) => {
        if (!active) return;
        setProfile(next);
        if (afterAccount) window.location.assign(afterAccount);
      })
      .catch(() => {
        if (active) setProfile(null);
      })
      .finally(() => {
        if (active) setReady(true);
      });
    return () => {
      active = false;
    };
  }, [afterAccount]);

  async function onRename(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const next = await apiFetch<Profile>("/api/challenger/profile", {
        method: "POST",
        body: JSON.stringify({ displayName, age13, consent }),
      });
      setProfile(next);
      setDisplayName("");
      setEditingName(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the name");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className={authPage}>
      <div className={authContainer}>
        <h1 className={authHeading}>{profile ? "Your account" : "Sign in"}</h1>
        <p className={`${authSubtext} mt-3`}>
          {profile
            ? "This is your Lodge account. Your decks live here. The stream only sees your display name."
            : "Use the Google account you already have. A new Google sign-in creates the account. The stream only sees the display name you choose next."}
        </p>

        {!ready ? (
          <p className={`${authSubtext} mt-8`}>Loading…</p>
        ) : null}

        {ready && (error || searchParams.get("auth_error")) && (
          <p className={`${authError} mt-6`}>
            {error ??
              (searchParams.get("auth_error") === "google_failed"
                ? "Google sign-in failed. Try again."
                : googleAuthErrorMessage(searchParams.get("auth_error") ?? ""))}
          </p>
        )}
        {notice && <p className={`${authSubtext} mt-6`}>{notice}</p>}

        {ready && profile ? (
          <div className="mt-8">
            {profile.displayName && !editingName ? (
              <>
                <p className="text-2xl font-semibold tracking-tight text-[var(--text-hi)]">
                  Playing as {profile.displayName}
                </p>
                {!profile.emailVerified && (
                  <p className={`${authSubtext} mt-3`}>
                    Verify your email before joining a game.
                  </p>
                )}
                <a className={`${authButton} mt-8 block`} href={DECKS}>
                  Select a deck
                </a>
                {profile.emailVerified && (
                  <a className={`${authButtonSecondary} mt-4 block`} href="/api/challenger/handoff">
                    Join the table
                  </a>
                )}
                <button
                  type="button"
                  className="mt-4 text-sm text-[var(--text)] underline underline-offset-4"
                  onClick={() => {
                    setDisplayName(profile.displayName ?? "");
                    setAge13(true);
                    setConsent(true);
                    setError(null);
                    setEditingName(true);
                  }}
                >
                  Change name
                </button>
              </>
            ) : (
              <>
                <p className={authSubtext}>
                  {profile.displayName
                    ? `Playing as ${profile.displayName}`
                    : "Choose the name that appears on the stream."}
                </p>
                <form onSubmit={onRename} className="mt-6 space-y-4">
                  <label className={authLabel}>
                    Display name
                    <input
                      className={authInput}
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      minLength={3}
                      maxLength={24}
                      required
                    />
                  </label>
                  <Check checked={age13} onChange={setAge13} label="I am 13 or older." />
                  <Check
                    checked={consent}
                    onChange={setConsent}
                    label="My display name, commander, and match result may be shown on the stream and on the Hall of Champions."
                  />
                  <button className={authButton} type="submit" disabled={loading}>
                    Save name
                  </button>
                  {profile.displayName && (
                    <button
                      type="button"
                      className="text-sm text-[var(--text)] underline underline-offset-4"
                      onClick={() => {
                        setEditingName(false);
                        setError(null);
                      }}
                    >
                      Cancel
                    </button>
                  )}
                </form>
              </>
            )}
          </div>
        ) : (
          <CustomerOAuthButtons
            storeSlug="the-game-lodge"
            prominent
            className="mt-8"
            redirectPath={
              afterAccount
                ? `/challenger?next=${encodeURIComponent(afterAccount)}`
                : "/challenger"
            }
          />
        )}
      </div>
    </main>
  );
}

function Check({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex items-start gap-3 text-sm leading-relaxed text-[var(--text)]">
      <input
        type="checkbox"
        className="mt-1"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        required
      />
      <span>{label}</span>
    </label>
  );
}
