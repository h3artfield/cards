"use client";

import { FormEvent, Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api-client";
import {
  authButton,
  authHeading,
  authInput,
  authLabel,
  authLink,
  authSubtext,
} from "@/lib/customer-auth-ui";
import { SignInShell } from "@/app/sign-in/SignInShell";
import { CustomerOAuthButtons } from "@/components/CustomerOAuthButtons";
import { STORE_SLUG_SESSION_KEY } from "@/lib/store-slug";

function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [storeSlug, setStoreSlug] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(STORE_SLUG_SESSION_KEY);
      if (stored) setStoreSlug(stored);
    } catch {
      /* ignore */
    }
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    try {
      const data = await apiFetch<{ message: string }>(
        "/api/customers/forgot-password",
        {
          method: "POST",
          body: JSON.stringify({ email: email.trim() }),
        },
      );
      setMessage(data.message);
    } catch (err) {
      setMessage(
        err instanceof Error ? err.message : "Something went wrong",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <SignInShell>
      <h1 className={authHeading}>Forgot password</h1>
      <p className={`mt-3 ${authSubtext}`}>
        Enter your email and we&apos;ll send reset instructions if an account
        exists.
      </p>
      {message && <p className="mt-4 text-sm text-neutral-300">{message}</p>}
      <form onSubmit={handleSubmit} className="mt-8 space-y-4">
        <label className="block">
          <span className={authLabel}>Email</span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={authInput}
          />
        </label>
        <button type="submit" className={authButton} disabled={loading}>
          {loading ? "Sending…" : "Send reset link"}
        </button>
      </form>
      <CustomerOAuthButtons storeSlug={storeSlug} className="mt-4" />
      <p className="mt-6 text-center">
        <Link
          href={
            storeSlug
              ? `/sign-in?store=${encodeURIComponent(storeSlug)}&return=1`
              : "/sign-in?return=1"
          }
          className={authLink}
        >
          Back to sign in
        </Link>
      </p>
    </SignInShell>
  );
}

export default function ForgotPasswordPage() {
  return (
    <Suspense fallback={<SignInShell><p className={authSubtext}>Loading…</p></SignInShell>}>
      <ForgotPasswordForm />
    </Suspense>
  );
}
