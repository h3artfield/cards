"use client";

import { FormEvent, useState } from "react";
import { Button } from "@/components/Button";
import { ADMIN_DELETE_CONFIRM_WORD } from "@/lib/admin-delete-confirm";

export function ConfirmDeleteForm({
  label,
  description,
  submitLabel,
  busyLabel = "Deleting…",
  onConfirm,
  onSuccess,
}: {
  label: string;
  description?: string;
  submitLabel: string;
  busyLabel?: string;
  onConfirm: () => Promise<void>;
  onSuccess?: () => void;
}) {
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const confirmed = confirm.trim().toLowerCase() === ADMIN_DELETE_CONFIRM_WORD;

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!confirmed) return;
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
      setConfirm("");
      onSuccess?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <p className="text-xs font-medium text-red-900">{label}</p>
      {description ? (
        <p className="text-xs text-red-800">{description}</p>
      ) : null}
      <label className="block text-xs">
        Type{" "}
        <code className="rounded bg-red-100 px-1">{ADMIN_DELETE_CONFIRM_WORD}</code>
        <input
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className="mt-1 w-full rounded-lg border border-red-200 px-3 py-2 text-sm"
          placeholder={ADMIN_DELETE_CONFIRM_WORD}
          autoComplete="off"
        />
      </label>
      {error ? <p className="text-xs text-red-700">{error}</p> : null}
      <Button
        type="submit"
        disabled={busy || !confirmed}
        className="!bg-red-600 hover:!bg-red-700"
      >
        {busy ? busyLabel : submitLabel}
      </Button>
    </form>
  );
}
