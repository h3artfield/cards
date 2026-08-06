"use client";

import { FormEvent, useState } from "react";
import { Button } from "@/components/Button";
import { adminFetch } from "@/lib/api-client";

type AccountInfo = {
  email: string;
  role: "platform" | "store";
  storeId?: string;
};

export function AdminAccountForms({
  account,
  onAccountUpdated,
  showNotificationNote = false,
}: {
  account: AccountInfo | null;
  onAccountUpdated: (account: AccountInfo) => void;
  showNotificationNote?: boolean;
}) {
  const [accountMessage, setAccountMessage] = useState<string | null>(null);
  const [accountError, setAccountError] = useState<string | null>(null);
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  async function changeEmail(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setAccountMessage(null);
    setAccountError(null);
    const formElement = e.currentTarget;
    const form = new FormData(formElement);
    const res = await adminFetch("/api/admin/account", {
      method: "PATCH",
      body: JSON.stringify({
        newEmail: form.get("newEmail"),
        currentPassword: form.get("currentPassword"),
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setAccountError(data.error ?? "Could not update email");
      return;
    }
    onAccountUpdated(data.account);
    formElement.reset();
    setAccountMessage("Login email updated.");
  }

  async function changePassword(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPasswordMessage(null);
    setPasswordError(null);
    const formElement = e.currentTarget;
    const form = new FormData(formElement);
    const newPassword = String(form.get("newPassword") ?? "");
    const confirmPassword = String(form.get("confirmPassword") ?? "");
    if (newPassword !== confirmPassword) {
      setPasswordError("New passwords do not match.");
      return;
    }
    const res = await adminFetch("/api/admin/account", {
      method: "PATCH",
      body: JSON.stringify({
        newPassword,
        currentPassword: form.get("currentPassword"),
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setPasswordError(data.error ?? "Could not update password");
      return;
    }
    formElement.reset();
    setPasswordMessage("Password updated.");
  }

  return (
    <div className="space-y-6">
      <form
        onSubmit={changeEmail}
        className="space-y-4 rounded-xl border bg-white p-6"
      >
        <p className="text-sm font-medium text-gray-900">Change login email</p>
        <p className="text-xs text-gray-500">
          Current: {account?.email ?? "—"}
          {showNotificationNote ? " (also used for store notifications)" : ""}
        </p>
        <label className="block text-sm">
          <span className="font-medium">New email</span>
          <input
            name="newEmail"
            type="email"
            required
            autoComplete="email"
            className="mt-1 w-full rounded-lg border px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium">Current password</span>
          <input
            name="currentPassword"
            type="password"
            required
            autoComplete="current-password"
            className="mt-1 w-full rounded-lg border px-3 py-2"
          />
        </label>
        {accountError ? (
          <p className="text-sm text-red-600">{accountError}</p>
        ) : null}
        {accountMessage ? (
          <p className="text-sm text-green-700">{accountMessage}</p>
        ) : null}
        <Button type="submit">Update email</Button>
      </form>

      <form
        onSubmit={changePassword}
        className="space-y-4 rounded-xl border bg-white p-6"
      >
        <p className="text-sm font-medium text-gray-900">Change password</p>
        <label className="block text-sm">
          <span className="font-medium">Current password</span>
          <input
            name="currentPassword"
            type="password"
            required
            autoComplete="current-password"
            className="mt-1 w-full rounded-lg border px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium">New password</span>
          <input
            name="newPassword"
            type="password"
            required
            autoComplete="new-password"
            className="mt-1 w-full rounded-lg border px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium">Confirm new password</span>
          <input
            name="confirmPassword"
            type="password"
            required
            autoComplete="new-password"
            className="mt-1 w-full rounded-lg border px-3 py-2"
          />
        </label>
        {passwordError ? (
          <p className="text-sm text-red-600">{passwordError}</p>
        ) : null}
        {passwordMessage ? (
          <p className="text-sm text-green-700">{passwordMessage}</p>
        ) : null}
        <Button type="submit">Update password</Button>
      </form>
    </div>
  );
}
