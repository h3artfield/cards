"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/Button";
import { adminFetch } from "@/lib/api-client";
import type { StoreEvent, StoreEventSignup } from "@/lib/store-calendar/types";

type SignupSummary = {
  signups: StoreEventSignup[];
  signupCount: number;
  spotsRemaining: number | null;
  capacity: number | null;
};

export function EventSignupsPanel({
  event,
  onChanged,
}: {
  event: StoreEvent;
  onChanged?: () => void;
}) {
  const [data, setData] = useState<SignupSummary | null>(null);
  const [announceMessage, setAnnounceMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await adminFetch(
      `/api/admin/store-events/${encodeURIComponent(event.id)}/signups`,
    );
    const json = await res.json();
    if (res.ok) setData(json);
  }, [event.id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function removeSignup(signupId: string) {
    if (!window.confirm("Remove this signup?")) return;
    setBusy(true);
    const res = await adminFetch(
      `/api/admin/store-events/${encodeURIComponent(event.id)}/signups/${encodeURIComponent(signupId)}`,
      { method: "DELETE" },
    );
    setBusy(false);
    if (!res.ok) {
      const json = await res.json();
      setMessage(json.error ?? "Could not remove signup");
      return;
    }
    await load();
    onChanged?.();
    setMessage("Signup removed.");
  }

  async function announceEvent() {
    setBusy(true);
    setMessage(null);
    const res = await adminFetch(
      `/api/admin/store-events/${encodeURIComponent(event.id)}/announce`,
      {
        method: "POST",
        body: JSON.stringify({
          message: announceMessage.trim() || undefined,
        }),
      },
    );
    const json = await res.json();
    setBusy(false);
    if (!res.ok) {
      setMessage(json.error ?? "Could not send emails");
      return;
    }
    setMessage(`Sent ${json.sent} of ${json.total} customer emails.`);
  }

  const capacityLabel =
    data?.capacity != null
      ? `${data.signupCount} / ${data.capacity} signed up`
      : `${data?.signupCount ?? 0} signed up`;

  return (
    <div className="rounded-xl border bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Signups</h3>
          <p className="mt-1 text-xs text-gray-600">{event.title}</p>
        </div>
        <p className="text-xs font-medium text-gray-700">{capacityLabel}</p>
      </div>

      {data?.spotsRemaining === 0 ? (
        <p className="mt-2 text-xs font-medium text-amber-700">Event is full</p>
      ) : data?.spotsRemaining != null ? (
        <p className="mt-2 text-xs text-gray-600">
          {data.spotsRemaining} spot{data.spotsRemaining === 1 ? "" : "s"} left
        </p>
      ) : null}

      {data?.signups.length ? (
        <ul className="mt-3 max-h-48 divide-y overflow-y-auto rounded-lg border">
          {data.signups.map((signup) => (
            <li
              key={signup.id}
              className="flex items-start justify-between gap-2 px-3 py-2 text-sm"
            >
              <div>
                <p className="font-medium text-gray-900">
                  {signup.firstName} {signup.lastName}
                </p>
                <p className="text-xs text-gray-600">{signup.email}</p>
                {signup.phone ? (
                  <p className="text-xs text-gray-500">{signup.phone}</p>
                ) : null}
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={() => void removeSignup(signup.id)}
                className="shrink-0 text-xs font-semibold text-red-600 hover:underline disabled:opacity-50"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-gray-500">No signups yet.</p>
      )}

      <div className="mt-4 border-t pt-4">
        <p className="text-xs font-medium text-gray-700">
          Email store customers about this event
        </p>
        <p className="mt-1 text-[10px] text-gray-500">
          Sends to customers who created buyback accounts at your store.
        </p>
        <textarea
          value={announceMessage}
          onChange={(e) => setAnnounceMessage(e.target.value)}
          rows={3}
          placeholder="Optional message to include in the email…"
          className="mt-2 w-full rounded-lg border px-3 py-2 text-sm"
        />
        <Button
          type="button"
          variant="secondary"
          disabled={busy}
          className="mt-2 !py-2 !text-xs"
          onClick={() => void announceEvent()}
        >
          {busy ? "Sending…" : "Email customers"}
        </Button>
      </div>

      {message ? (
        <p
          className={`mt-3 text-xs ${
            message.includes("Could not") || message.includes("No customers")
              ? "text-red-600"
              : "text-green-700"
          }`}
        >
          {message}
        </p>
      ) : null}
    </div>
  );
}
