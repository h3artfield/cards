"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { StoreBrandMark } from "@/components/StoreBrandMark";
import { useCustomer } from "@/context/CustomerContext";
import { apiFetch } from "@/lib/api-client";
import { PRIVACY_MESSAGE } from "@/lib/constants";
import {
  authButton,
  authButtonSecondary,
  authError,
  authHeading,
  authInput,
  authLabel,
  authLink,
  authSubtext,
} from "@/lib/customer-auth-ui";
import { STORE_SLUG_SESSION_KEY } from "@/lib/store-slug";
import type { BuybackOrder, Customer } from "@/lib/types";
import { SignInShell } from "./SignInShell";

const DRAFT_KEY = "buyback_signin_draft";
const EMPTY_DRAFT = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
};

type SignInDraft = typeof EMPTY_DRAFT;
const MIN_PASSWORD_LENGTH = 8;

function loadDraft(): SignInDraft {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    if (raw) return { ...EMPTY_DRAFT, ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  return { ...EMPTY_DRAFT };
}

function saveDraft(draft: SignInDraft) {
  try {
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    /* ignore */
  }
}

function StoreLogo({
  storeName,
  storeLogoUrl,
  subtitle,
}: {
  storeName: string | null;
  storeLogoUrl: string | null;
  subtitle?: string;
}) {
  if (!storeName) return null;
  return (
    <StoreBrandMark
      storeName={storeName}
      logoUrl={storeLogoUrl}
      variant="auth"
      subtitle={subtitle}
    />
  );
}

export function SignInForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const storeSlugParam = searchParams.get("store");
  const isReturn = searchParams.get("return") === "1";
  const { setCustomer, refresh } = useCustomer();

  const [storeSlug, setStoreSlug] = useState<string | null>(storeSlugParam);
  const [storeName, setStoreName] = useState<string | null>(null);
  const [storeLogoUrl, setStoreLogoUrl] = useState<string | null>(null);
  const [draft, setDraft] = useState<SignInDraft>(EMPTY_DRAFT);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [returnEmail, setReturnEmail] = useState("");
  const [returnPassword, setReturnPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [returnFound, setReturnFound] = useState<Customer | null>(null);
  const [pendingVerifyEmail, setPendingVerifyEmail] = useState<string | null>(null);
  const [resendMessage, setResendMessage] = useState<string | null>(null);
  const submittingRef = useRef(false);

  useEffect(() => {
    if (storeSlugParam) {
      setStoreSlug(storeSlugParam);
      try {
        sessionStorage.setItem(STORE_SLUG_SESSION_KEY, storeSlugParam);
      } catch {
        /* ignore */
      }
    } else {
      try {
        const stored = sessionStorage.getItem(STORE_SLUG_SESSION_KEY);
        if (stored) setStoreSlug(stored);
      } catch {
        /* ignore */
      }
    }
  }, [storeSlugParam]);

  useEffect(() => {
    if (!storeSlug) return;
    fetch(`/api/store/${encodeURIComponent(storeSlug)}`)
      .then(async (r) => {
        const data = await r.json();
        if (r.ok) {
          setStoreName(data.store.name);
          setStoreLogoUrl(data.store.logoUrl ?? null);
        }
      })
      .catch(() => {});
  }, [storeSlug]);

  function updateField(name: keyof SignInDraft, value: string) {
    setDraft((prev) => {
      const next = { ...prev, [name]: value };
      saveDraft(next);
      return next;
    });
  }

  async function loginReturningCustomer(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setReturnFound(null);
    try {
      const email = returnEmail.trim();
      const pwd = returnPassword;
      if (!email || !pwd) {
        setError("Enter your email and password");
        return;
      }
      const { customer: found } = await apiFetch<{ customer: Customer }>(
        "/api/customers/login",
        {
          method: "POST",
          body: JSON.stringify({ email, password: pwd }),
        },
      );
      setReturnFound(found);
      setCustomer(found);
      await refresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Invalid email or password",
      );
    } finally {
      setLoading(false);
    }
  }

  async function startNewOrderForCustomer(existing: Customer) {
    setLoading(true);
    try {
      const { order } = await apiFetch<{ order: BuybackOrder }>("/api/orders", {
        method: "POST",
        body: JSON.stringify({
          ...(storeSlug ? { storeSlug } : {}),
        }),
      });
      window.location.assign(`/order/${order.id}/scan`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create order");
      setLoading(false);
    }
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submittingRef.current) return;
    submittingRef.current = true;
    setLoading(true);
    setError(null);

    const payload = {
      firstName: draft.firstName.trim(),
      lastName: draft.lastName.trim(),
      email: draft.email.trim(),
      phone: draft.phone.trim(),
    };

    saveDraft(payload);
    setDraft(payload);

    if (
      !payload.firstName ||
      !payload.lastName ||
      !payload.email ||
      !payload.phone
    ) {
      setError("All fields are required");
      setLoading(false);
      submittingRef.current = false;
      return;
    }

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
      setLoading(false);
      submittingRef.current = false;
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      setLoading(false);
      submittingRef.current = false;
      return;
    }

    try {
      const result = await apiFetch<{
        customer: Customer;
        emailVerificationSent?: boolean;
        requiresVerification?: boolean;
      }>("/api/customers", {
        method: "POST",
        body: JSON.stringify({
          ...payload,
          password,
          storeSlug: storeSlug ?? undefined,
        }),
      });

      if (result.requiresVerification || result.emailVerificationSent) {
        setPendingVerifyEmail(result.customer.email);
        setCustomer(null);
        try {
          sessionStorage.removeItem(DRAFT_KEY);
        } catch {
          /* ignore */
        }
        submittingRef.current = false;
        setLoading(false);
        return;
      }

      setCustomer(result.customer);
      await refresh();

      const { order } = await apiFetch<{ order: BuybackOrder }>("/api/orders", {
        method: "POST",
        body: JSON.stringify({
          ...(storeSlug ? { storeSlug } : {}),
        }),
      });

      window.location.assign(`/order/${order.id}/scan`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      submittingRef.current = false;
      setLoading(false);
    }
  }

  async function resendVerification() {
    if (!pendingVerifyEmail) return;
    setResendMessage(null);
    setLoading(true);
    try {
      await apiFetch("/api/customers/resend-verification", {
        method: "POST",
        body: JSON.stringify({ email: pendingVerifyEmail }),
      });
      setResendMessage("Verification email sent.");
    } catch (err) {
      setResendMessage(
        err instanceof Error ? err.message : "Could not resend email",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setDraft(loadDraft());
    setReady(true);
  }, []);

  const storeQuery = storeSlug ? `?store=${encodeURIComponent(storeSlug)}` : "";
  const returnQuery = storeSlug
    ? `?store=${encodeURIComponent(storeSlug)}&return=1`
    : "?return=1";

  if (ready && !storeSlug) {
    return (
      <SignInShell>
        <h1 className={authHeading}>Customer sign in</h1>
        <p className={`mt-3 ${authSubtext}`}>
          Open the link or scan the QR code at your local card shop.
        </p>
      </SignInShell>
    );
  }

  if (pendingVerifyEmail) {
    return (
      <SignInShell>
        <StoreLogo storeName={storeName} storeLogoUrl={storeLogoUrl} />
        <h1 className={authHeading}>Check your email</h1>
        <p className={`mt-3 ${authSubtext}`}>
          We sent a verification link to{" "}
          <span className="text-white">{pendingVerifyEmail}</span>. Open the
          link to sign in and start scanning your cards.
        </p>
        {resendMessage && (
          <p className="mt-4 text-sm text-neutral-300">{resendMessage}</p>
        )}
        <div className="mt-8 space-y-3">
          <button
            type="button"
            className={authButton}
            disabled={loading}
            onClick={() => void resendVerification()}
          >
            {loading ? "Sending…" : "Resend verification email"}
          </button>
          {storeSlug && (
            <Link
              href={`/s/${encodeURIComponent(storeSlug)}`}
              className={`block text-center ${authLink}`}
            >
              Back to store
            </Link>
          )}
        </div>
      </SignInShell>
    );
  }

  if (isReturn) {
    return (
      <SignInShell>
        <StoreLogo storeName={storeName} storeLogoUrl={storeLogoUrl} subtitle="Sign in" />
        {error && <p className={`mb-4 ${authError}`}>{error}</p>}

        {!returnFound ? (
          <form onSubmit={loginReturningCustomer} className="space-y-4">
            <Field label="Email" type="email" value={returnEmail} onChange={setReturnEmail} required />
            <Field label="Password" type="password" value={returnPassword} onChange={setReturnPassword} required />
            <button type="submit" className={authButton} disabled={loading}>
              {loading ? "Signing in…" : "Sign in"}
            </button>
            <p className="text-center">
              <Link href="/forgot-password" className={authLink}>
                Forgot password?
              </Link>
            </p>
          </form>
        ) : (
          <div className="space-y-3">
            <p className={authSubtext}>
              Signed in as{" "}
              <span className="text-white">
                {returnFound.firstName} {returnFound.lastName}
              </span>
            </p>
            {!returnFound.emailVerified ? (
              <>
                <p className={authSubtext}>
                  Verify your email before scanning cards. Check your inbox for
                  the verification link.
                </p>
                <button
                  type="button"
                  className={authButtonSecondary}
                  disabled={loading}
                  onClick={() => {
                    setPendingVerifyEmail(returnFound.email);
                    setReturnFound(null);
                  }}
                >
                  Resend verification email
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  className={authButton}
                  disabled={loading}
                  onClick={() => void startNewOrderForCustomer(returnFound)}
                >
                  Start scanning cards
                </button>
                <button
                  type="button"
                  className={authButtonSecondary}
                  onClick={() => router.push("/orders")}
                >
                  View my orders
                </button>
              </>
            )}
          </div>
        )}

        <p className="mt-8 text-center">
          <Link href={`/sign-in${storeQuery}`} className={authLink}>
            New customer? Create account
          </Link>
        </p>
      </SignInShell>
    );
  }

  return (
    <SignInShell>
      <StoreLogo storeName={storeName} storeLogoUrl={storeLogoUrl} subtitle="Create account" />
      {error && <p className={`mb-4 ${authError}`}>{error}</p>}

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <Field label="First name" value={ready ? draft.firstName : ""} onChange={(v) => updateField("firstName", v)} required />
        <Field label="Last name" value={ready ? draft.lastName : ""} onChange={(v) => updateField("lastName", v)} required />
        <Field label="Email" type="email" value={ready ? draft.email : ""} onChange={(v) => updateField("email", v)} required />
        <Field label="Phone" type="tel" value={ready ? draft.phone : ""} onChange={(v) => updateField("phone", v)} required />
        <Field label="Password" type="password" value={password} onChange={setPassword} required />
        <Field label="Confirm password" type="password" value={confirmPassword} onChange={setConfirmPassword} required />
        <p className={`text-xs ${authSubtext}`}>
          Password must be at least {MIN_PASSWORD_LENGTH} characters. {PRIVACY_MESSAGE}
        </p>
        <button type="submit" className={authButton} disabled={loading || !ready}>
          {loading ? "Creating account…" : "Create account"}
        </button>
      </form>

      <p className="mt-8 text-center">
        <Link href={`/sign-in${returnQuery}`} className={authLink}>
          Already have an account? Sign in
        </Link>
      </p>
    </SignInShell>
  );
}

function Field({
  label,
  type = "text",
  value,
  onChange,
  required,
}: {
  label: string;
  type?: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className={authLabel}>{label}</span>
      <input
        type={type}
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={authInput}
      />
    </label>
  );
}
