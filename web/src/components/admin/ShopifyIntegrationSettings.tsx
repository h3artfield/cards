"use client";

import { FormEvent, useEffect, useState } from "react";
import { Button } from "@/components/Button";
import { adminFetch } from "@/lib/api-client";
import type {
  ShopifyAuthMethod,
  ShopifyIntegrationPublic,
} from "@/lib/shopify/types";

type Location = { id: string; name: string; isActive: boolean };

function validateDomainClient(input: string): string | null {
  const raw = input.trim();
  if (!raw) return "Shopify shop domain is required.";
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)) {
    return "Enter your Shopify .myshopify.com domain, not an email address.";
  }
  if (raw.includes("@") && !raw.includes(".myshopify.com")) {
    return "Enter your Shopify .myshopify.com domain, not an email address.";
  }
  const normalized = raw
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .includes(".")
    ? raw.toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "")
    : `${raw.toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "")}.myshopify.com`;
  if (!normalized.endsWith(".myshopify.com")) {
    return "Enter a valid Shopify shop domain ending in .myshopify.com.";
  }
  return null;
}

export function ShopifyIntegrationSettings() {
  const [shopify, setShopify] = useState<ShopifyIntegrationPublic | null>(null);
  const [soldDetectionWebhookUrl, setSoldDetectionWebhookUrl] = useState<
    string | null
  >(null);
  const [webhookStatus, setWebhookStatus] = useState<string | null>(null);
  const [authMethod, setAuthMethod] =
    useState<ShopifyAuthMethod>("client_credentials");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [domainError, setDomainError] = useState<string | null>(null);
  const [clientSecret, setClientSecret] = useState("");
  const [legacyAccessToken, setLegacyAccessToken] = useState("");
  const [locations, setLocations] = useState<Location[]>([]);
  const [showAdvanced, setShowAdvanced] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await adminFetch("/api/admin/shopify/settings");
      const data = await res.json();
      if (res.ok) {
        setShopify(data.shopify ?? null);
        setSoldDetectionWebhookUrl(
          data.soldDetectionWebhookUrl ?? data.ordersPaidWebhookUrl ?? null,
        );
        setAuthMethod(
          data.shopify?.authMethod === "legacy_admin_token"
            ? "legacy_admin_token"
            : "client_credentials",
        );
      }
      if (data.shopify?.enabled) {
        const locRes = await adminFetch("/api/admin/shopify/locations");
        const locData = await locRes.json();
        if (locRes.ok) setLocations(locData.locations ?? []);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function readForm(): Record<string, unknown> {
    const form = document.getElementById(
      "shopify-settings-form",
    ) as HTMLFormElement;
    const formData = new FormData(form);
    return {
      enabled: formData.get("enabled") === "on",
      authMethod,
      shopDomain: formData.get("shopDomain"),
      clientId: formData.get("clientId"),
      defaultLocationId: formData.get("defaultLocationId") || undefined,
      defaultProductStatus: formData.get("defaultProductStatus"),
      publishOnlineStore: formData.get("publishOnlineStore") === "on",
      publishShopChannel: formData.get("publishShopChannel") === "on",
      defaultVendor: formData.get("defaultVendor") || undefined,
      defaultProductType: formData.get("defaultProductType") || undefined,
      defaultTags: String(formData.get("defaultTags") ?? "")
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      priceStrategy: formData.get("priceStrategy"),
      markupPercent: Number(formData.get("markupPercent") ?? 0),
      requireStaffConfirmedOnly: formData.get("requireStaffConfirmedOnly") === "on",
    };
  }

  function validateBeforeSubmit(shopDomain: string): boolean {
    const dErr = validateDomainClient(shopDomain);
    setDomainError(dErr);
    if (dErr) {
      setError(dErr);
      return false;
    }
    return true;
  }

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    setError(null);
    const payload = readForm();
    const shopDomain = String(payload.shopDomain ?? "");
    if (!validateBeforeSubmit(shopDomain)) {
      setSaving(false);
      return;
    }
    if (authMethod === "client_credentials" && clientSecret.trim()) {
      payload.clientSecret = clientSecret.trim();
    }
    if (authMethod === "legacy_admin_token" && legacyAccessToken.trim()) {
      payload.legacyAccessToken = legacyAccessToken.trim();
    }

    const res = await adminFetch("/api/admin/shopify/settings", {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      setError(data.error ?? "Could not save Shopify settings");
      return;
    }
    setShopify(data.shopify);
    setClientSecret("");
    setLegacyAccessToken("");
    setMessage("Shopify settings saved.");
    void load();
  }

  async function testConnection() {
    setTesting(true);
    setError(null);
    setMessage(null);
    setDomainError(null);
    const form = document.getElementById(
      "shopify-settings-form",
    ) as HTMLFormElement;
    const formData = new FormData(form);
    const shopDomain = String(formData.get("shopDomain") ?? "");
    const dErr = validateDomainClient(shopDomain);
    if (dErr) {
      setDomainError(dErr);
      setError(dErr);
      setTesting(false);
      return;
    }

    const res = await adminFetch("/api/admin/shopify/test-connection", {
      method: "POST",
      body: JSON.stringify({
        shopDomain,
        authMethod,
        clientId: formData.get("clientId"),
        clientSecret: clientSecret.trim() || undefined,
        legacyAccessToken: legacyAccessToken.trim() || undefined,
        saveCredentials: true,
      }),
    });
    const data = await res.json();
    setTesting(false);
    if (!res.ok) {
      setError(data.error ?? "Connection test failed");
      return;
    }
    setLocations(data.locations ?? []);
    setShopify(data.shopify ?? shopify);
    if (data.soldDetectionWebhookUrl ?? data.ordersPaidWebhookUrl) {
      setSoldDetectionWebhookUrl(
        data.soldDetectionWebhookUrl ?? data.ordersPaidWebhookUrl ?? null,
      );
    }
    if (data.webhookRegistration?.ok) {
      const inv = data.webhookRegistration.inventoryLevels;
      setWebhookStatus(
        inv?.created
          ? "inventory_levels/update webhook registered"
          : "inventory_levels/update webhook already registered",
      );
    } else if (data.webhookRegistration?.error) {
      setWebhookStatus(data.webhookRegistration.error);
    } else if (data.shopify?.inventoryLevelsWebhookRegisteredAt) {
      setWebhookStatus("inventory_levels/update webhook registered");
    } else {
      setWebhookStatus(null);
    }
    setClientSecret("");
    setLegacyAccessToken("");
    const scopeNote =
      data.grantedScopes?.length > 0
        ? ` Scopes: ${data.grantedScopes.join(", ")}.`
        : "";
    setMessage(
      `Connected to ${data.shopName} (${data.domain}). ${data.locations?.length ?? 0} location(s). Product write access verified.${scopeNote}`,
    );
  }

  if (loading) {
    return <p className="text-sm text-gray-600">Loading Shopify settings…</p>;
  }

  const s = shopify;
  const isDevDashboard = authMethod === "client_credentials";

  return (
    <section className="mt-8 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <h3 className="text-lg font-semibold text-gray-900">
        Integrations → Shopify
      </h3>
      <p className="mt-1 text-sm text-gray-600">
        Connect using credentials from the Shopify Dev Dashboard (Client ID +
        Client Secret). Card Scanner exchanges them for an access token
        automatically — no Admin API token hunt required.
      </p>

      <form id="shopify-settings-form" className="mt-6 space-y-5" onSubmit={save}>
        <label className="flex items-center justify-between gap-4 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
          <span className="text-sm font-medium text-gray-900">
            Enable Shopify integration
          </span>
          <input
            type="checkbox"
            name="enabled"
            defaultChecked={s?.enabled}
            className="h-5 w-9 cursor-pointer appearance-none rounded-full bg-gray-300 transition checked:bg-emerald-600"
            role="switch"
          />
        </label>

        <fieldset className="space-y-3 rounded-lg border border-gray-200 p-4">
          <legend className="px-1 text-sm font-semibold text-gray-900">
            Authentication method
          </legend>
          <label className="flex cursor-pointer items-start gap-3 text-sm">
            <input
              type="radio"
              name="authMethodUi"
              checked={isDevDashboard}
              onChange={() => setAuthMethod("client_credentials")}
              className="mt-1"
            />
            <span>
              <span className="font-medium text-gray-900">
                Shopify Dev Dashboard credentials (recommended)
              </span>
              <span className="mt-0.5 block text-xs text-gray-600">
                Client ID + Client Secret from Dev Dashboard → App → Settings →
                Credentials
              </span>
            </span>
          </label>
          <label className="flex cursor-pointer items-start gap-3 text-sm">
            <input
              type="radio"
              name="authMethodUi"
              checked={!isDevDashboard}
              onChange={() => setAuthMethod("legacy_admin_token")}
              className="mt-1"
            />
            <span>
              <span className="font-medium text-gray-900">
                Legacy Admin API access token
              </span>
              <span className="mt-0.5 block text-xs text-gray-600">
                For older custom apps that issued a long-lived shpat_ token
              </span>
            </span>
          </label>
        </fieldset>

        <label className="block text-sm">
          Shopify store domain
          <input
            name="shopDomain"
            className={`mt-1 w-full rounded border px-3 py-2 font-mono text-sm ${
              domainError ? "border-red-400" : "border-gray-300"
            }`}
            placeholder="the-game-lodge.myshopify.com"
            defaultValue={s?.shopDomain ?? ""}
            autoComplete="off"
            onBlur={(e) => setDomainError(validateDomainClient(e.target.value))}
          />
          <span className="mt-1 block text-xs text-gray-500">
            Your .myshopify.com shop URL — not an email address.
          </span>
          {domainError && (
            <span className="mt-1 block text-xs text-red-600">{domainError}</span>
          )}
        </label>

        {isDevDashboard ? (
          <>
            <label className="block text-sm">
              Shopify Client ID
              <input
                name="clientId"
                className="mt-1 w-full rounded border border-gray-300 px-3 py-2 font-mono text-sm"
                placeholder="From Dev Dashboard → App → Settings → Credentials"
                defaultValue={s?.clientId ?? ""}
                autoComplete="off"
              />
            </label>

            <label className="block text-sm">
              Shopify Client Secret
              <input
                type="password"
                className="mt-1 w-full rounded border border-gray-300 px-3 py-2 font-mono text-sm"
                placeholder={
                  s?.hasClientSecret
                    ? "Leave blank to keep saved secret"
                    : "From Dev Dashboard → App → Settings → Credentials"
                }
                value={clientSecret}
                onChange={(e) => setClientSecret(e.target.value)}
                autoComplete="new-password"
              />
              {s?.hasClientSecret && (
                <span className="mt-1 block text-xs text-emerald-700">
                  Client secret saved securely (never shown after save)
                </span>
              )}
            </label>
          </>
        ) : (
          <label className="block text-sm">
            Legacy Admin API access token
            <input
              type="password"
              className="mt-1 w-full rounded border border-gray-300 px-3 py-2 font-mono text-sm"
              placeholder={
                s?.hasLegacyAccessToken
                  ? "Leave blank to keep saved token"
                  : "shpat_…"
              }
              value={legacyAccessToken}
              onChange={(e) => setLegacyAccessToken(e.target.value)}
              autoComplete="new-password"
            />
            {s?.hasLegacyAccessToken && (
              <span className="mt-1 block text-xs text-emerald-700">
                Access token saved securely (never shown after save)
              </span>
            )}
          </label>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="secondary"
            disabled={testing}
            onClick={() => void testConnection()}
          >
            {testing ? "Testing…" : "Test connection"}
          </Button>
          {s?.lastTestResult && (
            <span
              className={`text-xs font-medium ${
                s.lastTestResult === "success"
                  ? "text-emerald-700"
                  : "text-red-600"
              }`}
            >
              Last test: {s.lastTestResult}
              {s.lastTestedAt
                ? ` · ${new Date(s.lastTestedAt).toLocaleString()}`
                : ""}
            </span>
          )}
          {s?.hasValidAccessToken && isDevDashboard && (
            <span className="text-xs text-gray-500">
              OAuth token cached
              {s.oauthAccessTokenExpiresAt
                ? ` · expires ${new Date(s.oauthAccessTokenExpiresAt).toLocaleString()}`
                : ""}
            </span>
          )}
        </div>

        {s?.canWriteProducts === false && s?.lastTestResult === "failed" && (
          <p className="text-xs text-amber-800">
            Last test failed scope check — ensure your Shopify app has{" "}
            <code className="rounded bg-amber-100 px-1">write_products</code>{" "}
            and related product scopes enabled.
          </p>
        )}

        <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-4">
          <p className="text-sm font-medium text-slate-900">Sold detection (Phase 1)</p>
          <p className="mt-1 text-xs text-slate-600">
            When Shopify inventory hits 0 (sale), Card Scanner marks matching
            inventory as sold. Uses{" "}
            <code className="rounded bg-white px-1">inventory_levels/update</code>{" "}
            — no protected customer data approval required. Add{" "}
            <code className="rounded bg-white px-1">read_inventory</code> to app
            scopes, then test connection.
          </p>
          {soldDetectionWebhookUrl ? (
            <p className="mt-2 break-all text-xs text-slate-700">
              Webhook URL:{" "}
              <code className="rounded bg-white px-1">{soldDetectionWebhookUrl}</code>
            </p>
          ) : null}
          {s?.canReadInventory === false &&
            !s?.inventoryLevelsWebhookRegisteredAt &&
            s?.lastTestResult === "success" && (
            <p className="mt-2 text-xs text-amber-800">
              Missing <code className="rounded bg-amber-100 px-1">read_inventory</code>{" "}
              scope — add it in Shopify Dev Dashboard, then test connection again.
            </p>
          )}
          {(s?.canReadInventory !== false || s?.inventoryLevelsWebhookRegisteredAt) &&
            s?.lastTestResult === "success" && (
            <p className="mt-2 text-xs text-slate-600">
              Inventory access OK
              {s?.inventoryLevelsWebhookRegisteredAt
                ? " — sold detection webhook active"
                : s?.canReadInventory !== false
                  ? " (read_inventory or write_inventory)"
                  : ""}
              .
            </p>
          )}
          {webhookStatus && webhookStatus.includes("registered") ? (
            <p className="mt-2 text-xs text-emerald-700">{webhookStatus}</p>
          ) : s?.inventoryLevelsWebhookRegisteredAt ? (
            <p className="mt-2 text-xs text-emerald-700">
              inventory_levels/update webhook registered{" "}
              {new Date(s.inventoryLevelsWebhookRegisteredAt).toLocaleString()}
            </p>
          ) : null}
          {(webhookStatus && !webhookStatus.includes("registered")) ||
          s?.soldDetectionWebhookLastError ? (
            <p className="mt-2 text-xs text-red-700">
              Webhook registration:{" "}
              {webhookStatus && !webhookStatus.includes("registered")
                ? webhookStatus
                : s?.soldDetectionWebhookLastError}
            </p>
          ) : null}
          {s?.ordersPaidWebhookLastError ? (
            <p className="mt-2 text-xs text-slate-500">
              orders/paid skipped (optional): {s.ordersPaidWebhookLastError}
            </p>
          ) : null}
          {!webhookStatus &&
            !s?.inventoryLevelsWebhookRegisteredAt &&
            !s?.soldDetectionWebhookLastError &&
            s?.canReadInventory !== false &&
            s?.lastTestResult === "success" && (
              <p className="mt-2 text-xs text-amber-800">
                Webhook not registered yet — click Test connection again after deploy.
              </p>
            )}
        </div>

        <button
          type="button"
          className="text-sm font-medium text-indigo-600 hover:underline"
          onClick={() => setShowAdvanced((v) => !v)}
        >
          {showAdvanced ? "Hide" : "Show"} export defaults
        </button>

        {showAdvanced && (
          <div className="space-y-4 rounded-lg border border-gray-200 bg-gray-50/50 p-4">
            <label className="block text-sm sm:max-w-md">
              Default inventory location
              <select
                name="defaultLocationId"
                className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
                defaultValue={s?.defaultLocationId ?? ""}
              >
                <option value="">— Select after test connection —</option>
                {locations.map((loc) => (
                  <option key={loc.id} value={loc.id}>
                    {loc.name}
                    {!loc.isActive ? " (inactive)" : ""}
                  </option>
                ))}
              </select>
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm">
                Default product status
                <select
                  name="defaultProductStatus"
                  className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
                  defaultValue={s?.defaultProductStatus ?? "DRAFT"}
                >
                  <option value="DRAFT">Draft</option>
                  <option value="ACTIVE">Active</option>
                </select>
              </label>
              <label className="block text-sm">
                Default price source
                <select
                  name="priceStrategy"
                  className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
                  defaultValue={s?.priceStrategy ?? "marketPrice"}
                >
                  <option value="marketPrice">Market price</option>
                  <option value="marketPlusMarkup">Market price + markup</option>
                  <option value="manual">Manual (required at export)</option>
                </select>
              </label>
            </div>

            <label className="block text-sm sm:max-w-xs">
              Markup percent (if using market + markup)
              <input
                name="markupPercent"
                type="number"
                min={0}
                step={1}
                className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
                defaultValue={s?.markupPercent ?? 0}
              />
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm">
                Default vendor
                <input
                  name="defaultVendor"
                  className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
                  defaultValue={s?.defaultVendor ?? ""}
                />
              </label>
              <label className="block text-sm">
                Default product type
                <input
                  name="defaultProductType"
                  className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
                  defaultValue={s?.defaultProductType ?? "Trading Card"}
                />
              </label>
            </div>

            <label className="block text-sm">
              Default tags (comma-separated)
              <input
                name="defaultTags"
                className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
                defaultValue={(s?.defaultTags ?? []).join(", ")}
              />
            </label>

            <div className="flex flex-wrap gap-4 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  name="publishOnlineStore"
                  defaultChecked={s?.publishOnlineStore}
                  className="rounded"
                />
                Publish to Online Store (when Active)
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  name="publishShopChannel"
                  defaultChecked={s?.publishShopChannel}
                  className="rounded"
                />
                Publish to Shop channel (when Active)
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  name="requireStaffConfirmedOnly"
                  defaultChecked={s?.requireStaffConfirmedOnly}
                  className="rounded"
                />
                Require staff-confirmed printing (V2)
              </label>
            </div>
          </div>
        )}

        {message && <p className="text-sm text-emerald-700">{message}</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}

        <Button type="submit" disabled={saving}>
          {saving ? "Saving…" : "Save Shopify settings"}
        </Button>
      </form>
    </section>
  );
}
