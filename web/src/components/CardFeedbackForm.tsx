"use client";

import { FormEvent, useState } from "react";
import { Button } from "@/components/Button";
import { adminFetch } from "@/lib/api-client";
import type { ScannedCard } from "@/lib/types";

export function CardFeedbackForm({
  card,
  onClose,
  onSubmitted,
}: {
  card: ScannedCard;
  onClose: () => void;
  onSubmitted?: () => void;
}) {
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const trimmed = message.trim();
    if (!trimmed) {
      setError("Please describe what looks wrong or what we should improve.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await adminFetch(`/api/admin/cards/${card.id}/feedback`, {
        method: "POST",
        body: JSON.stringify({ message: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not send feedback");
        return;
      }
      setSent(true);
      onSubmitted?.();
    } finally {
      setSaving(false);
    }
  }

  if (sent) {
    return (
      <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
        <p className="font-medium">Feedback sent</p>
        <p className="mt-1 text-emerald-800">
          The buyback report and your note were sent to the platform team.
        </p>
        <Button variant="ghost" className="mt-2" onClick={onClose}>
          Close
        </Button>
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => void submit(e)}
      className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-3"
    >
      <p className="text-sm font-semibold text-gray-900">Send feedback</p>
      <p className="mt-1 text-xs text-gray-600">
        Includes this card&apos;s full buyback report, identity check, and pricing.
      </p>
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        rows={4}
        className="mt-2 w-full rounded-lg border px-3 py-2 text-sm"
        placeholder="What looks wrong? Wrong ID, bad price, report issue…"
        disabled={saving}
      />
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
      <div className="mt-2 flex flex-wrap gap-2">
        <Button type="submit" variant="secondary" disabled={saving}>
          {saving ? "Sending…" : "Submit feedback"}
        </Button>
        <Button type="button" variant="ghost" disabled={saving} onClick={onClose}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
