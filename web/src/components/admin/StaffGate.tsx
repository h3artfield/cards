"use client";

import { FormEvent, useEffect, useState } from "react";
import { Button } from "@/components/Button";
import { useAdmin } from "@/context/AdminContext";
import { adminFetch } from "@/lib/api-client";

type Member = { id: string; name: string; role: "owner" | "clerk"; active: boolean };
type Mode = "pick" | "recover";

const inputClass = "mt-1 w-full rounded-lg border px-3 py-2";
const pinInputProps = {
  type: "password",
  inputMode: "numeric" as const,
  autoComplete: "off",
  pattern: "\\d{4,6}",
  maxLength: 6,
};

async function postJson(path: string, body: unknown): Promise<string | null> {
  const res = await adminFetch(path, { method: "POST", body: JSON.stringify(body) });
  if (res.ok) return null;
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  return data.error ?? "Something went wrong";
}

/** Shown instead of the admin pages until someone picks their name and enters their PIN. */
export function StaffGate() {
  const { staffSetupNeeded, refresh, logout, activeStore } = useAdmin();
  const [members, setMembers] = useState<Member[] | null>(null);
  const [mode, setMode] = useState<Mode>("pick");
  const [staffId, setStaffId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (staffSetupNeeded) return;
    adminFetch("/api/admin/staff")
      .then((r) => r.json())
      .then((d: { members?: Member[] }) => setMembers((d.members ?? []).filter((m) => m.active)))
      .catch(() => setMembers([]));
  }, [staffSetupNeeded]);

  async function run(path: string, body: unknown) {
    setBusy(true);
    setError(null);
    try {
      const failed = await postJson(path, body);
      if (failed) setError(failed);
      else await refresh();
    } finally {
      setBusy(false);
    }
  }

  function onSetup(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    if (f.get("pin") !== f.get("pin2")) return setError("The two PINs don't match");
    void run("/api/admin/staff", {
      setup: true,
      name: f.get("name"),
      pin: f.get("pin"),
      storePassword: f.get("storePassword"),
    });
  }

  function onSignIn(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    if (!staffId) return setError("Pick your name");
    void run("/api/admin/staff/sign-in", { staffId, pin: f.get("pin") });
  }

  function onRecover(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    if (f.get("pin") !== f.get("pin2")) return setError("The two PINs don't match");
    void run("/api/admin/staff/recover", {
      staffId,
      pin: f.get("pin"),
      storePassword: f.get("storePassword"),
    });
  }

  const selected = members?.find((m) => m.id === staffId);
  const errorLine = error ? <p className="text-sm text-red-600">{error}</p> : null;

  return (
    <div className="mx-auto mt-10 max-w-sm">
      {staffSetupNeeded ? (
        <form onSubmit={onSetup} className="space-y-4 rounded-xl border bg-white p-6">
          <h2 className="text-lg font-semibold text-slate-900">Set up staff sign-in</h2>
          <p className="text-sm text-slate-600">
            Each person signs in with their name and a PIN. Start with your owner profile; you can add
            clerks afterwards in Settings.
          </p>
          <label className="block text-sm">
            <span className="font-medium">Your name</span>
            <input name="name" required maxLength={40} className={inputClass} />
          </label>
          <label className="block text-sm">
            <span className="font-medium">Choose a PIN (4–6 digits)</span>
            <input name="pin" required {...pinInputProps} className={inputClass} />
          </label>
          <label className="block text-sm">
            <span className="font-medium">PIN again</span>
            <input name="pin2" required {...pinInputProps} className={inputClass} />
          </label>
          <label className="block text-sm">
            <span className="font-medium">Store login password</span>
            <input name="storePassword" type="password" required autoComplete="current-password" className={inputClass} />
            <span className="mt-1 block text-xs text-slate-500">Proves you are the owner.</span>
          </label>
          {errorLine}
          <Button type="submit" disabled={busy} fullWidth>
            {busy ? "Saving…" : "Create owner profile"}
          </Button>
        </form>
      ) : mode === "recover" && selected ? (
        <form onSubmit={onRecover} className="space-y-4 rounded-xl border bg-white p-6">
          <h2 className="text-lg font-semibold text-slate-900">New PIN for {selected.name}</h2>
          <label className="block text-sm">
            <span className="font-medium">Store login password</span>
            <input name="storePassword" type="password" required autoComplete="current-password" className={inputClass} />
          </label>
          <label className="block text-sm">
            <span className="font-medium">New PIN (4–6 digits)</span>
            <input name="pin" required {...pinInputProps} className={inputClass} />
          </label>
          <label className="block text-sm">
            <span className="font-medium">PIN again</span>
            <input name="pin2" required {...pinInputProps} className={inputClass} />
          </label>
          {errorLine}
          <div className="flex gap-2">
            <Button type="submit" disabled={busy}>
              {busy ? "Saving…" : "Set PIN and sign in"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => { setMode("pick"); setError(null); }}>
              Back
            </Button>
          </div>
        </form>
      ) : (
        <form onSubmit={onSignIn} className="space-y-4 rounded-xl border bg-white p-6">
          <h2 className="text-lg font-semibold text-slate-900">Who&apos;s working?</h2>
          {activeStore ? <p className="text-sm text-slate-600">{activeStore.storeName}</p> : null}
          <label className="block text-sm">
            <span className="font-medium">Your name</span>
            <select
              value={staffId}
              onChange={(e) => { setStaffId(e.target.value); setError(null); }}
              className={inputClass}
              disabled={!members}
            >
              <option value="">{members ? "Pick your name" : "Loading…"}</option>
              {members?.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}{m.role === "owner" ? " (owner)" : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="font-medium">PIN</span>
            <input key={staffId} name="pin" required autoFocus={Boolean(staffId)} {...pinInputProps} className={inputClass} />
          </label>
          {errorLine}
          <Button type="submit" disabled={busy || !staffId} fullWidth>
            {busy ? "Checking…" : "Sign in"}
          </Button>
          <div className="flex justify-between text-xs">
            {selected?.role === "owner" ? (
              <button type="button" className="text-indigo-600 hover:underline" onClick={() => { setMode("recover"); setError(null); }}>
                Forgot owner PIN?
              </button>
            ) : (
              <span className="text-slate-500">Forgot your PIN? Ask the owner.</span>
            )}
            <button type="button" className="text-slate-500 hover:underline" onClick={() => void logout()}>
              Sign out of store
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
