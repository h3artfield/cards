"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Button } from "@/components/Button";
import { useAdmin } from "@/context/AdminContext";
import { adminFetch } from "@/lib/api-client";

type Member = {
  id: string;
  name: string;
  role: "owner" | "clerk";
  active: boolean;
  lastSignedInAt?: string;
};

const inputClass = "mt-1 w-full rounded-lg border px-3 py-2";
const pinInputProps = {
  type: "password",
  inputMode: "numeric" as const,
  autoComplete: "off",
  pattern: "\\d{4,6}",
  maxLength: 6,
};

function lastSeen(iso?: string): string {
  if (!iso) return "never signed in";
  return `last in ${new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`;
}

/** Owner-only list of who can sign in at the counter. */
export function StaffManagementPanel() {
  const { staff, refresh } = useAdmin();
  const [members, setMembers] = useState<Member[] | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pinFor, setPinFor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    () =>
      adminFetch("/api/admin/staff")
        .then((r) => r.json())
        .then((d: { members?: Member[] }) => setMembers(d.members ?? [])),
    [],
  );

  useEffect(() => {
    void load();
  }, [load]);

  async function send(path: string, method: "POST" | "PATCH", body: unknown, done: string) {
    setBusy(true);
    setMessage(null);
    try {
      const res = await adminFetch(path, { method, body: JSON.stringify(body) });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setMessage({ ok: false, text: data.error ?? "Could not save" });
        return false;
      }
      setMessage({ ok: true, text: done });
      await load();
      await refresh();
      return true;
    } finally {
      setBusy(false);
    }
  }

  async function onAdd(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const name = String(f.get("name") ?? "");
    const ok = await send(
      "/api/admin/staff",
      "POST",
      { name, role: f.get("role"), pin: f.get("pin") },
      `${name} can now sign in.`,
    );
    if (ok) form.reset();
  }

  async function onPin(e: FormEvent<HTMLFormElement>, m: Member) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const ok = await send(`/api/admin/staff/${m.id}`, "PATCH", { pin: f.get("pin") }, `New PIN set for ${m.name}.`);
    if (ok) setPinFor(null);
  }

  const active = members?.filter((m) => m.active) ?? [];
  const inactive = members?.filter((m) => !m.active) ?? [];

  return (
    <section className="mt-4 max-w-lg rounded-xl border bg-white p-6">
      <h3 className="font-semibold text-slate-900">Staff</h3>
      <p className="mt-1 text-sm text-slate-600">
        After the store login, each person picks their name and enters their PIN. Clerks can use
        everything except Settings, Buy %, billing and this list. The counter locks after 30 minutes
        without use.
      </p>

      {!members ? (
        <p className="mt-4 text-sm text-slate-500">Loading…</p>
      ) : (
        <ul className="mt-4 divide-y divide-slate-100">
          {active.map((m) => (
            <li key={m.id} className="py-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="font-medium text-slate-900">{m.name}</span>
                  {m.id === staff?.staffId ? <span className="text-slate-500"> (you)</span> : null}
                  <span className="block text-xs text-slate-500">{lastSeen(m.lastSignedInAt)}</span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={m.role}
                    disabled={busy}
                    onChange={(e) =>
                      void send(`/api/admin/staff/${m.id}`, "PATCH", { role: e.target.value }, `${m.name} is now ${e.target.value === "owner" ? "an owner" : "a clerk"}.`)
                    }
                    className="rounded-lg border px-2 py-1"
                    aria-label={`Role for ${m.name}`}
                  >
                    <option value="clerk">Clerk</option>
                    <option value="owner">Owner</option>
                  </select>
                  <button type="button" className="text-indigo-600 hover:underline" onClick={() => setPinFor(pinFor === m.id ? null : m.id)}>
                    New PIN
                  </button>
                  {m.id !== staff?.staffId ? (
                    <button
                      type="button"
                      disabled={busy}
                      className="text-red-600 hover:underline"
                      onClick={() => {
                        if (window.confirm(`Remove ${m.name}? They won't be able to sign in.`)) {
                          void send(`/api/admin/staff/${m.id}`, "PATCH", { active: false }, `${m.name} removed.`);
                        }
                      }}
                    >
                      Remove
                    </button>
                  ) : null}
                </div>
              </div>
              {pinFor === m.id ? (
                <form onSubmit={(e) => void onPin(e, m)} className="mt-2 flex items-end gap-2">
                  <label className="block flex-1 text-xs">
                    New PIN for {m.name} (4–6 digits)
                    <input name="pin" required autoFocus {...pinInputProps} className={inputClass} />
                  </label>
                  <Button type="submit" disabled={busy}>Save</Button>
                </form>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {inactive.length ? (
        <details className="mt-2 text-sm">
          <summary className="cursor-pointer text-slate-500">Removed ({inactive.length})</summary>
          <ul className="mt-2 space-y-1">
            {inactive.map((m) => (
              <li key={m.id} className="flex items-center justify-between">
                <span className="text-slate-600">{m.name}</span>
                <button
                  type="button"
                  disabled={busy}
                  className="text-indigo-600 hover:underline"
                  onClick={() => void send(`/api/admin/staff/${m.id}`, "PATCH", { active: true }, `${m.name} can sign in again.`)}
                >
                  Restore
                </button>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      <form onSubmit={(e) => void onAdd(e)} className="mt-4 space-y-3 border-t border-slate-100 pt-4">
        <h4 className="text-sm font-semibold text-slate-900">Add someone</h4>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm">
            Name
            <input name="name" required maxLength={40} className={inputClass} />
          </label>
          <label className="block text-sm">
            Role
            <select name="role" defaultValue="clerk" className={inputClass}>
              <option value="clerk">Clerk</option>
              <option value="owner">Owner</option>
            </select>
          </label>
        </div>
        <label className="block text-sm">
          PIN (4–6 digits; tell them in person)
          <input name="pin" required {...pinInputProps} className={inputClass} />
        </label>
        <Button type="submit" disabled={busy}>Add</Button>
      </form>

      {message ? (
        <p className={`mt-3 text-sm ${message.ok ? "text-green-700" : "text-red-600"}`}>{message.text}</p>
      ) : null}
    </section>
  );
}
