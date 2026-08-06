"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { AdminLayout } from "@/components/AdminLayout";
import { AdminAccountForms } from "@/components/admin/AdminAccountForms";
import { StoreOwnerPasswordForm } from "@/components/admin/StoreOwnerPasswordForm";
import { Button } from "@/components/Button";
import { StoreQrCode } from "@/components/StoreQrCode";
import { StoreCalendarEmbedPanel } from "@/components/StoreCalendarEmbedPanel";
import { StoreLogoUpload } from "@/components/StoreLogoUpload";
import { ShopifyIntegrationSettings } from "@/components/admin/ShopifyIntegrationSettings";
import { adminFetch } from "@/lib/api-client";
import { useAdmin } from "@/context/AdminContext";
import { slugifyStoreName } from "@/lib/store-slug";
import { getConfiguredAppUrl } from "@/lib/app-url";
import type { StoreSettings } from "@/lib/types";

type AccountInfo = {
  email: string;
  role: "platform" | "store";
  storeId?: string;
};

export default function AdminSettingsPage() {
  const { loading: authLoading, activeStore, session, refresh } = useAdmin();
  const [settings, setSettings] = useState<StoreSettings | null>(null);
  const [storeSlug, setStoreSlug] = useState("");
  const [account, setAccount] = useState<AccountInfo | null>(null);
  const [storeMessage, setStoreMessage] = useState<string | null>(null);

  const isStoreOwner = session?.role === "store";
  const isPlatformAdmin = session?.role === "platform";

  useEffect(() => {
    if (authLoading || !activeStore) return;
    adminFetch("/api/admin/settings")
      .then((r) => r.json())
      .then((d) => {
        setSettings(d.settings);
        setStoreSlug(d.settings.storeSlug);
      });
    if (isStoreOwner) {
      adminFetch("/api/admin/account")
        .then((r) => r.json())
        .then((d) => setAccount(d.account ?? null));
    }
  }, [authLoading, activeStore, isStoreOwner]);

  async function saveStoreSettings(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStoreMessage(null);
    const form = new FormData(e.currentTarget);
    const payload: Record<string, unknown> = {
      storeName: form.get("storeName"),
      storeSlug: form.get("storeSlug") || storeSlug,
      emailNotificationsEnabled: form.get("emailNotificationsEnabled") === "on",
      smsNotificationsEnabled: form.get("smsNotificationsEnabled") === "on",
    };
    if (!isStoreOwner) {
      payload.ownerEmail = form.get("ownerEmail");
    }
    const res = await adminFetch("/api/admin/settings", {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      setStoreMessage(data.error ?? "Could not save settings");
      return;
    }
    setSettings(data.settings);
    setStoreSlug(data.settings.storeSlug);
    setStoreMessage("Store settings saved.");
  }

  if (!settings) return <AdminLayout><p>Loading...</p></AdminLayout>;

  return (
    <AdminLayout>
      <div>
        <h2 className="text-2xl font-bold text-slate-900">{settings.storeName}</h2>
        <p className="mt-1 text-sm text-slate-600">Store settings</p>
      </div>

      <div className="mt-4 max-w-lg">
        <StoreCalendarEmbedPanel
          storeSlug={settings.storeSlug}
          storeName={settings.storeName}
          calendarPublished={settings.calendarSettings?.published}
          embedEnabled={settings.calendarSettings?.embedEnabled}
        />
      </div>

      <div className="mt-4 max-w-lg">
        <StoreQrCode storeSlug={settings.storeSlug} storeName={settings.storeName} />
        <p className="mt-2 text-xs text-slate-500">
          Customer page:{" "}
          <code className="rounded bg-slate-100 px-1">/s/{settings.storeSlug}</code>
        </p>
      </div>

      <div className="mt-4 max-w-lg">
        <StoreLogoUpload
          logoUrl={settings.storeLogoUrl}
          storeName={settings.storeName}
          onUpdated={(storeLogoUrl) =>
            setSettings((prev) => (prev ? { ...prev, storeLogoUrl } : prev))
          }
        />
      </div>

      <form
        onSubmit={saveStoreSettings}
        className="mt-4 max-w-md space-y-4 rounded-xl border bg-white p-6"
      >
        <h3 className="font-semibold text-gray-900">Store details</h3>
        <label className="block text-sm">
          <span className="font-medium">Store name</span>
          <input
            name="storeName"
            defaultValue={settings.storeName}
            onBlur={(e) => {
              if (!storeSlug || storeSlug === slugifyStoreName(settings.storeName)) {
                setStoreSlug(slugifyStoreName(e.target.value));
              }
            }}
            className="mt-1 w-full rounded-lg border px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium">Store URL slug</span>
          <input
            name="storeSlug"
            value={storeSlug}
            onChange={(e) => setStoreSlug(e.target.value)}
            pattern="[a-z0-9-]+"
            className="mt-1 w-full rounded-lg border px-3 py-2 font-mono text-sm"
          />
          <span className="mt-1 block text-xs text-gray-500">
            Customer link: /s/{storeSlug || "your-slug"}
          </span>
        </label>
        {!isStoreOwner ? (
          <label className="block text-sm">
            <span className="font-medium">Owner login email</span>
            <input
              name="ownerEmail"
              type="email"
              defaultValue={settings.ownerEmail}
              key={settings.ownerEmail}
              className="mt-1 w-full rounded-lg border px-3 py-2"
            />
            <span className="mt-1 block text-xs text-gray-500">
              Store owner signs in at /store/login with this email. Must be
              different from your platform admin email and not used by another
              store.
            </span>
          </label>
        ) : (
          <p className="text-sm text-gray-600">
            Login email:{" "}
            <span className="font-medium text-gray-900">
              {account?.email ?? settings.ownerEmail}
            </span>
            . Change it in your account section below.
          </p>
        )}
        <label className="flex items-center gap-2 text-sm">
          <input
            name="emailNotificationsEnabled"
            type="checkbox"
            defaultChecked={settings.emailNotificationsEnabled}
          />
          Email notifications enabled
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            name="smsNotificationsEnabled"
            type="checkbox"
            defaultChecked={settings.smsNotificationsEnabled}
          />
          SMS notifications (V2 — stores phone only for now)
        </label>
        {storeMessage ? (
          <p
            className={`text-sm ${storeMessage.includes("saved") ? "text-green-700" : "text-red-600"}`}
          >
            {storeMessage}
          </p>
        ) : null}
        <Button type="submit">Save store settings</Button>
      </form>

      {isPlatformAdmin && (
        <StoreOwnerPasswordForm
          ownerEmail={settings.ownerEmail}
          platformEmail={session?.email}
        />
      )}

      <div className="mt-4 max-w-lg rounded-xl border bg-white p-4 text-sm">
        <p className="font-medium text-gray-900">Customer app URL</p>
        <p className="mt-1 text-xs text-gray-600">
          QR codes point customers to this URL.
        </p>
        <p className="mt-2 break-all font-mono text-xs text-indigo-800">
          {getConfiguredAppUrl()}
        </p>
      </div>

      <ShopifyIntegrationSettings />

      {isStoreOwner && (
        <div className="mt-8 max-w-md">
          <h3 className="text-lg font-semibold text-gray-900">Your account</h3>
          <p className="mt-1 text-xs text-gray-500">
            Change your email or password for{" "}
            <Link href="/store/login" className="text-indigo-600 hover:underline">
              /store/login
            </Link>
          </p>
          <div className="mt-4">
            <AdminAccountForms
              account={account}
              showNotificationNote
              onAccountUpdated={async (next) => {
                setAccount(next);
                await refresh();
                const settingsRes = await adminFetch("/api/admin/settings");
                const settingsData = await settingsRes.json();
                if (settingsData.settings) {
                  setSettings(settingsData.settings);
                }
              }}
            />
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
