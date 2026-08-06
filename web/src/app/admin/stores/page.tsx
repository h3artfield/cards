"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AdminLayout } from "@/components/AdminLayout";
import { ConfirmDeleteForm } from "@/components/admin/ConfirmDeleteForm";
import { Button } from "@/components/Button";
import { StoreCustomerEntryLink } from "@/components/StoreCustomerEntryLink";
import { ADMIN_DELETE_CONFIRM_WORD } from "@/lib/admin-delete-confirm";
import { useAdmin } from "@/context/AdminContext";
import type { StoreSettings } from "@/lib/types";

async function adminJson<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(path, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...init?.headers },
    ...init,
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error ?? "Request failed");
  }
  return data as T;
}

function StoreDangerZone({
  store,
  onChanged,
}: {
  store: StoreSettings;
  onChanged: (message: string) => void;
}) {
  return (
    <details
      className="border-t border-red-100 bg-red-50/30"
      onClick={(e) => e.stopPropagation()}
    >
      <summary className="cursor-pointer px-5 py-2 text-xs font-semibold text-red-800">
        Delete options
      </summary>
      <div className="space-y-4 border-t border-red-100 px-5 py-4">
        <ConfirmDeleteForm
          label="Delete customer data"
          description={`Removes orders, customers, cards, and inventory for ${store.storeName}. Store settings and owner login are kept.`}
          submitLabel="Delete customer data"
          onConfirm={async () => {
            const data = await adminJson<{ result: Record<string, number> }>(
              "/api/admin/purge",
              {
                method: "POST",
                body: JSON.stringify({
                  confirm: ADMIN_DELETE_CONFIRM_WORD,
                  storeId: store.id,
                }),
              },
            );
            const r = data.result;
            onChanged(
              `${store.storeName}: removed ${r.orders} orders, ${r.customers} customers, ${r.cards} cards.`,
            );
          }}
        />
        <ConfirmDeleteForm
          label="Delete store permanently"
          description={`Removes ${store.storeName}, its owner login, pricing rules, and all customer data. This cannot be undone.`}
          submitLabel="Delete store"
          onConfirm={async () => {
            await adminJson(`/api/admin/stores/${store.id}`, {
              method: "DELETE",
              body: JSON.stringify({ confirm: ADMIN_DELETE_CONFIRM_WORD }),
            });
          }}
          onSuccess={() => onChanged(`${store.storeName} was deleted.`)}
        />
      </div>
    </details>
  );
}

export default function AdminStoresPage() {
  const router = useRouter();
  const { session, enterStore, loading: authLoading, refresh } = useAdmin();
  const [stores, setStores] = useState<StoreSettings[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  async function loadStores() {
    setLoading(true);
    setError(null);
    try {
      const data = await adminJson<{ stores: StoreSettings[] }>(
        "/api/admin/stores",
      );
      setStores(data.stores ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (authLoading || !session) return;
    void loadStores();
  }, [authLoading, session]);

  async function handleCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    const formElement = e.currentTarget;
    const form = new FormData(formElement);
    try {
      const data = await adminJson<{ store: StoreSettings }>("/api/admin/stores", {
        method: "POST",
        body: JSON.stringify({
          storeName: form.get("storeName"),
          storeSlug: form.get("storeSlug"),
          ownerEmail: form.get("ownerEmail"),
          ownerPassword: form.get("ownerPassword"),
        }),
      });
      formElement.reset();
      setShowForm(false);
      await loadStores();
      await enterStore(data.store.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setCreating(false);
    }
  }

  async function handleStoreChanged(message: string) {
    setStatusMessage(message);
    await refresh();
    await loadStores();
  }

  if (session?.role === "store") {
    router.replace("/admin");
    return null;
  }

  return (
    <AdminLayout showStoreTabs={false}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Stores</h2>
          <p className="mt-1 text-sm text-slate-600">
            Platform dashboard — each store has its own customers, orders, and QR
            code.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/admin/feedback"
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Feedback
          </Link>
          <Link
            href="/admin/reports"
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Reports
          </Link>
          {session?.role === "platform" && (
            <Button onClick={() => setShowForm((v) => !v)}>
              {showForm ? "Cancel" : "Create store"}
            </Button>
          )}
        </div>
      </div>

      {showForm && (
        <form
          onSubmit={handleCreate}
          className="mt-6 max-w-lg space-y-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
        >
          <h3 className="font-semibold text-slate-900">New store</h3>
          <label className="block text-sm">
            Store name
            <input
              name="storeName"
              required
              className="mt-1 w-full rounded-lg border px-3 py-2"
              placeholder="The Game Lodge"
            />
          </label>
          <label className="block text-sm">
            URL slug (optional)
            <input
              name="storeSlug"
              className="mt-1 w-full rounded-lg border px-3 py-2 font-mono"
              placeholder="the-game-lodge"
            />
          </label>
          <label className="block text-sm">
            Owner email
            <input
              name="ownerEmail"
              type="email"
              required
              className="mt-1 w-full rounded-lg border px-3 py-2"
            />
            <span className="mt-1 block text-xs text-slate-500">
              Separate from your platform login — the store owner uses this at
              /store/login.
            </span>
          </label>
          <label className="block text-sm">
            Owner password
            <input
              name="ownerPassword"
              type="password"
              required
              minLength={8}
              className="mt-1 w-full rounded-lg border px-3 py-2"
            />
          </label>
          <Button type="submit" disabled={creating}>
            {creating ? "Creating…" : "Create store"}
          </Button>
        </form>
      )}

      {error && (
        <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>
      )}
      {statusMessage && (
        <p className="mt-4 rounded-lg bg-green-50 p-3 text-sm text-green-800">
          {statusMessage}
        </p>
      )}

      {loading ? (
        <p className="mt-8 text-slate-500">Loading stores…</p>
      ) : (
        <ul className="mt-8 grid gap-4 lg:grid-cols-2">
          {stores.map((store) => (
            <li
              key={store.id}
              className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
            >
              <button
                type="button"
                onClick={() => enterStore(store.id)}
                className="w-full p-5 text-left transition hover:bg-indigo-50/50"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-lg font-semibold text-slate-900">
                      {store.storeName}
                    </p>
                    <p className="mt-0.5 font-mono text-sm text-slate-500">
                      /s/{store.storeSlug}
                    </p>
                    <p className="mt-1 text-xs text-slate-400">{store.ownerEmail}</p>
                  </div>
                  <span className="shrink-0 rounded-full bg-indigo-100 px-3 py-1 text-xs font-semibold text-indigo-700">
                    Manage →
                  </span>
                </div>
              </button>
              <div className="border-t border-slate-100 px-5 py-3">
                <StoreCustomerEntryLink
                  storeSlug={store.storeSlug}
                  storeName={store.storeName}
                />
              </div>
              {session?.role === "platform" && (
                <StoreDangerZone
                  store={store}
                  onChanged={handleStoreChanged}
                />
              )}
            </li>
          ))}
        </ul>
      )}

      {session?.role === "platform" && stores.length > 0 && (
        <details className="mt-10 rounded-xl border border-red-200 bg-red-50/50 p-4">
          <summary className="cursor-pointer text-sm font-semibold text-red-900">
            Danger zone — delete all customer data (every store)
          </summary>
          <p className="mt-2 text-xs text-red-800">
            Removes all orders, customers, cards, inventory, and purchase history
            from every store. Store settings and admin accounts are kept. Order
            numbers restart at BB-000001 per store.
          </p>
          <div className="mt-3">
            <ConfirmDeleteForm
              label="Delete all customer data"
              submitLabel="Delete all customer data"
              onConfirm={async () => {
                const data = await adminJson<{ result: Record<string, unknown> }>(
                  "/api/admin/purge",
                  {
                    method: "POST",
                    body: JSON.stringify({
                      confirm: ADMIN_DELETE_CONFIRM_WORD,
                    }),
                  },
                );
                const r = data.result;
                setStatusMessage(
                  `Removed ${r.orders} orders, ${r.customers} customers, ${r.cards} cards across all stores.`,
                );
              }}
            />
          </div>
        </details>
      )}

      <div className="mt-8 rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
        <p className="font-medium text-slate-800">Sign-in URLs</p>
        <ul className="mt-2 space-y-1">
          <li>
            Store owners:{" "}
            <Link href="/store/login" className="text-indigo-600 hover:underline">
              /store/login
            </Link>
          </li>
          <li>
            Platform admin:{" "}
            <Link href="/admin/login" className="text-indigo-600 hover:underline">
              /admin/login
            </Link>
          </li>
        </ul>
      </div>
    </AdminLayout>
  );
}
