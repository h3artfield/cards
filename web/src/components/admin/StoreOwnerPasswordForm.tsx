"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/Button";
import { adminFetch } from "@/lib/api-client";

export function StoreOwnerPasswordForm({
  ownerEmail,
  platformEmail,
}: {
  ownerEmail: string;
  platformEmail?: string;
}) {
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMessage(null);
    setError(null);
    setSaving(true);
    const formElement = e.currentTarget;
    const form = new FormData(formElement);
    try {
      const res = await adminFetch("/api/admin/settings/owner-password", {
        method: "POST",
        body: JSON.stringify({
          newPassword: form.get("newPassword"),
          confirmPassword: form.get("confirmPassword"),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not set password");
      formElement.reset();
      setMessage(
        `Password updated for ${data.ownerEmail ?? ownerEmail}. They sign in at /store/login.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  const ownerEmailNormalized = ownerEmail.trim().toLowerCase();
  const ownerEmailIssue =
    !ownerEmailNormalized
      ? "Set and save an owner login email above first."
      : platformEmail &&
          ownerEmailNormalized === platformEmail.trim().toLowerCase()
        ? "Owner email cannot be your platform admin login — use a separate email for the store owner."
        : null;

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-4 max-w-md space-y-4 rounded-xl border border-slate-200 bg-white p-6"
    >
      <div>
        <h3 className="font-semibold text-gray-900">Store owner password</h3>
        <p className="mt-1 text-xs text-gray-600">
          Set or reset the password for{" "}
          <span className="font-medium">{ownerEmail}</span>. Share this with the
          owner so they can sign in at{" "}
          <Link href="/store/login" className="text-indigo-600 hover:underline">
            /store/login
          </Link>
          . They can change it later in Settings → Your account.
        </p>
      </div>
      {ownerEmailIssue ? (
        <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          {ownerEmailIssue}
        </p>
      ) : null}
      <label className="block text-sm">
        <span className="font-medium">New password</span>
        <input
          name="newPassword"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          className="mt-1 w-full rounded-lg border px-3 py-2"
        />
      </label>
      <label className="block text-sm">
        <span className="font-medium">Confirm password</span>
        <input
          name="confirmPassword"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          className="mt-1 w-full rounded-lg border px-3 py-2"
        />
      </label>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {message ? <p className="text-sm text-green-700">{message}</p> : null}
      <Button type="submit" disabled={saving || Boolean(ownerEmailIssue)}>
        {saving ? "Saving…" : "Set owner password"}
      </Button>
    </form>
  );
}
