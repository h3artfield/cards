"use client";

import { FormEvent, Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api-client";
import {
  authButton,
  authError,
  authHeading,
  authInput,
  authLabel,
  authLink,
  authSubtext,
} from "@/lib/customer-auth-ui";
import { SignInShell } from "@/app/sign-in/SignInShell";

const MIN_PASSWORD_LENGTH = 8;

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }
    setLoading(true);
    try {
      await apiFetch("/api/customers/reset-password", {
        method: "POST",
        body: JSON.stringify({ token, password }),
      });
      router.push("/sign-in?return=1");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reset failed");
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <SignInShell>
        <p className={authError}>Invalid reset link.</p>
        <Link href="/forgot-password" className={`mt-4 block ${authLink}`}>
          Request a new link
        </Link>
      </SignInShell>
    );
  }

  return (
    <SignInShell>
      <h1 className={authHeading}>Reset password</h1>
      <p className={`mt-3 ${authSubtext}`}>Choose a new password.</p>
      {error && <p className={`mt-4 ${authError}`}>{error}</p>}
      <form onSubmit={handleSubmit} className="mt-8 space-y-4">
        <label className="block">
          <span className={authLabel}>New password</span>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={authInput}
          />
        </label>
        <label className="block">
          <span className={authLabel}>Confirm password</span>
          <input
            type="password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className={authInput}
          />
        </label>
        <button type="submit" className={authButton} disabled={loading}>
          {loading ? "Saving…" : "Reset password"}
        </button>
      </form>
    </SignInShell>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<SignInShell><p className={authSubtext}>Loading…</p></SignInShell>}>
      <ResetPasswordForm />
    </Suspense>
  );
}
