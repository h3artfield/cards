"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/Button";
import { AdminSectionTabs } from "@/components/admin/AdminSectionTabs";
import { useAdmin } from "@/context/AdminContext";
import {
  applyStoreSenderHints,
  defaultShippingDefaults,
  loadShippingDefaults,
  saveShippingDefaults,
} from "@/lib/shipping/defaults-storage";
import {
  isSenderComplete,
  senderMissingFields,
} from "@/lib/shipping/sender-profile";
import { downloadCsv, formatOz } from "@/lib/shipping/csv-utils";
import { exportAddressLabelsCsv } from "@/lib/shipping/address-labels-export";
import { PACKAGING_PROFILES, getPackagingProfile } from "@/lib/shipping/packaging-profiles";
import { applyShippingPreset, SHIPPING_PRESETS } from "@/lib/shipping/shipping-presets";
import type { ShippingPresetId } from "@/lib/shipping/shipping-presets";
import {
  normalizeServicePackage,
  VALID_SERVICE_PACKAGE,
} from "@/lib/shipping/usps-service-packages";
import { effectiveRow, prepareShippingRows } from "@/lib/shipping/prepare-rows";
import { parseTcgplayerShippingCsv } from "@/lib/shipping/tcgplayer-import";
import {
  buildTcgplayerTrackingCsv,
  matchTrackingToOrders,
  mergeTrackingIntoTcgplayerExport,
  parseTrackingResultsCsv,
} from "@/lib/shipping/tracking-import";
import {
  exportUspsClickNShipCsv,
  exportValidationErrorReport,
  verifyUspsExportHeaders,
} from "@/lib/shipping/usps-export";
import type {
  PreparedShippingRow,
  ShippingDefaults,
  TcgplayerOrderRow,
  UspsPackageType,
  UspsServiceType,
} from "@/lib/shipping/types";

const WORKFLOW_TABS = [
  { id: "convert", label: "TCG → USPS" },
  { id: "envelope", label: "Address labels" },
  { id: "tracking", label: "Tracking → TCG" },
] as const;

type WorkflowTab = (typeof WORKFLOW_TABS)[number]["id"];

const SERVICE_OPTIONS: UspsServiceType[] = [
  "USPS Ground Advantage",
  "Priority Mail",
  "Priority Mail Express",
  "First-Class Mail",
];

const PACKAGE_OPTIONS: UspsPackageType[] = [
  "Letter",
  "Large Envelope",
  "Choose Your Own Box",
  "Custom Packaging",
  "Flat Rate Envelope",
  "Flat Rate Legal Envelope",
  "Small Flat Rate Box",
  "Medium Flat Rate Box",
  "Small Flat Rate Envelope",
  "Large Flat Rate Box",
  "Padded Flat Rate Envelope",
  "Window Flat Rate Envelope",
];

function packageOptionsForService(service: UspsServiceType): UspsPackageType[] {
  return [...(VALID_SERVICE_PACKAGE[service] ?? ["Choose Your Own Box"])];
}

const ORDERS_STORAGE_KEY = "cs9k-shipping-orders";

function loadPersistedOrders(storeId: string): {
  fileName: string | null;
  orders: TcgplayerOrderRow[];
} {
  if (typeof window === "undefined") return { fileName: null, orders: [] };
  try {
    const raw = sessionStorage.getItem(`${ORDERS_STORAGE_KEY}:${storeId}`);
    if (!raw) return { fileName: null, orders: [] };
    const parsed = JSON.parse(raw) as {
      fileName?: string;
      orders?: TcgplayerOrderRow[];
    };
    return {
      fileName: parsed.fileName ?? null,
      orders: parsed.orders ?? [],
    };
  } catch {
    return { fileName: null, orders: [] };
  }
}

function persistOrders(
  storeId: string,
  fileName: string | null,
  orders: TcgplayerOrderRow[],
): void {
  if (typeof window === "undefined") return;
  if (!orders.length) {
    sessionStorage.removeItem(`${ORDERS_STORAGE_KEY}:${storeId}`);
    return;
  }
  sessionStorage.setItem(
    `${ORDERS_STORAGE_KEY}:${storeId}`,
    JSON.stringify({ fileName, orders }),
  );
}

function statusBadge(status: PreparedShippingRow["status"]) {
  if (status === "ready") {
    return "bg-emerald-100 text-emerald-800";
  }
  if (status === "warning") {
    return "bg-amber-100 text-amber-800";
  }
  return "bg-red-100 text-red-800";
}

export function ReportsShippingSection() {
  const { activeStore } = useAdmin();
  const storeId = activeStore?.id ?? "default";

  const [workflow, setWorkflow] = useState<WorkflowTab>("convert");
  const [defaults, setDefaults] = useState<ShippingDefaults>(() =>
    defaultShippingDefaults(),
  );
  const [originalFileName, setOriginalFileName] = useState<string | null>(null);
  const [orders, setOrders] = useState<TcgplayerOrderRow[]>([]);
  const [prepared, setPrepared] = useState<PreparedShippingRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [trackingImportText, setTrackingImportText] = useState<string | null>(null);
  const [trackingMessage, setTrackingMessage] = useState<string | null>(null);

  useEffect(() => {
    const loaded = applyStoreSenderHints(loadShippingDefaults(storeId), {
      storeName: activeStore?.storeName,
    });
    setDefaults(loaded);
    const persisted = loadPersistedOrders(storeId);
    if (persisted.orders.length) {
      setOriginalFileName(persisted.fileName);
      setOrders(persisted.orders);
      setPrepared(prepareShippingRows(persisted.orders, loaded));
    } else {
      setOriginalFileName(null);
      setOrders([]);
      setPrepared([]);
    }
  }, [storeId, activeStore?.storeName]);

  const refreshPrepared = useCallback(
    (nextOrders: TcgplayerOrderRow[], nextDefaults: ShippingDefaults) => {
      setPrepared(prepareShippingRows(nextOrders, nextDefaults));
    },
    [],
  );

  function updateDefaults(next: ShippingDefaults) {
    setDefaults(next);
    saveShippingDefaults(storeId, next);
    if (orders.length) refreshPrepared(orders, next);
  }

  function handleTcgUpload(file: File) {
    setError(null);
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = String(reader.result ?? "");
        const parsed = parseTcgplayerShippingCsv(text);
        if (!parsed.length) {
          setError("No orders found — check that the file is a TCGplayer shipping export.");
          return;
        }
        setOriginalFileName(file.name);
        setOrders(parsed);
        persistOrders(storeId, file.name, parsed);
        refreshPrepared(parsed, defaults);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not parse CSV");
      }
    };
    reader.readAsText(file);
  }

  const readyCount = useMemo(
    () => prepared.filter((r) => effectiveRow(r).status === "ready").length,
    [prepared],
  );
  const warnCount = useMemo(
    () => prepared.filter((r) => effectiveRow(r).status === "warning").length,
    [prepared],
  );
  const errorCount = useMemo(
    () => prepared.filter((r) => effectiveRow(r).status === "error").length,
    [prepared],
  );

  const senderReady = isSenderComplete(defaults.sender);

  function exportUsps() {
    if (!senderReady) {
      setError(
        `Fill in return address before export — missing: ${senderMissingFields(defaults.sender).join(", ")}.`,
      );
      return;
    }
    const { csv, exportedCount, skippedCount } = exportUspsClickNShipCsv(
      prepared,
      defaults,
    );
    downloadCsv(
      `usps-cnsv2-${new Date().toISOString().slice(0, 10)}.csv`,
      csv,
    );
    const missingHeaders = verifyUspsExportHeaders(csv);
    setError(
      skippedCount > 0
        ? `Exported ${exportedCount} label(s); skipped ${skippedCount} row(s). Download validation report for details.`
        : missingHeaders.length
          ? `Exported ${exportedCount} label(s), but header check failed: ${missingHeaders.join(", ")}`
          : `Exported ${exportedCount} label(s). Before uploading to USPS, open the CSV in Notepad and confirm row 1 includes "Recipient Address Town/City" and "Sender First Name" — not "Recipient City" or "Sender Name".`,
    );
  }

  function exportAddressLabels() {
    const { csv, exportedCount, skippedCount } = exportAddressLabelsCsv(prepared);
    downloadCsv(
      `address-labels-${new Date().toISOString().slice(0, 10)}.csv`,
      csv,
    );
    setError(
      skippedCount > 0
        ? `Exported ${exportedCount} address label(s); skipped ${skippedCount} invalid row(s).`
        : null,
    );
  }

  function clearOrders() {
    setOriginalFileName(null);
    setOrders([]);
    setPrepared([]);
    persistOrders(storeId, null, []);
    setError(null);
  }

  function applyPreset(presetId: ShippingPresetId) {
    updateDefaults(applyShippingPreset(presetId, defaults));
  }

  function selectPackagingProfile(profileId: ShippingDefaults["packagingProfileId"]) {
    const profile = getPackagingProfile(profileId);
    const normalized = normalizeServicePackage(defaults.uspsService, profile.defaultPackageType);
    updateDefaults({
      ...defaults,
      packagingProfileId: profileId,
      customPackagingTareOz: profile.tareOz,
      uspsPackageType: normalized.packageType,
    });
  }

  function updateService(nextService: UspsServiceType) {
    const normalized = normalizeServicePackage(nextService, defaults.uspsPackageType);
    updateDefaults({
      ...defaults,
      uspsService: normalized.service,
      uspsPackageType: normalized.packageType,
    });
  }

  function downloadErrorReport() {
    downloadCsv(
      `shipping-validation-${new Date().toISOString().slice(0, 10)}.csv`,
      exportValidationErrorReport(prepared),
    );
  }

  function updateRowOverride(
    index: number,
    patch: PreparedShippingRow["overrides"],
  ) {
    setPrepared((rows) =>
      rows.map((row, i) => {
        if (i !== index) return row;
        let nextPatch = patch;
        if (row.serviceLocked && patch) {
          const { uspsService: _s, uspsPackageType: _p, ...allowed } = patch;
          if (
            Object.keys(allowed).length === 0 &&
            (_s !== undefined || _p !== undefined)
          ) {
            return row;
          }
          nextPatch = allowed;
        }
        return { ...row, overrides: { ...row.overrides, ...nextPatch } };
      }),
    );
  }

  function handleTrackingUpload(file: File) {
    setTrackingMessage(null);
    const reader = new FileReader();
    reader.onload = () => {
      setTrackingImportText(String(reader.result ?? ""));
    };
    reader.readAsText(file);
  }

  function exportTrackingToTcg() {
    if (!trackingImportText) return;
    const tracking = parseTrackingResultsCsv(trackingImportText);
    const { matched, unmatched } = matchTrackingToOrders(orders, tracking);

    if (!matched.length) {
      setTrackingMessage(
        unmatched.length
          ? `No tracking rows matched original orders. ${unmatched.length} unmatched.`
          : "No tracking numbers found in upload.",
      );
      return;
    }

    const minimal = buildTcgplayerTrackingCsv(matched);
    downloadCsv(
      `tcgplayer-tracking-${new Date().toISOString().slice(0, 10)}.csv`,
      minimal,
    );

    if (orders.length) {
      const full = mergeTrackingIntoTcgplayerExport(orders, tracking);
      downloadCsv(
        `tcgplayer-full-${new Date().toISOString().slice(0, 10)}.csv`,
        full,
      );
    }

    setTrackingMessage(
      `Matched ${matched.length} order(s)${unmatched.length ? `; ${unmatched.length} unmatched reference(s)` : ""}.`,
    );
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-slate-600">
        Convert TCGplayer shipping exports to USPS Click-N-Ship bulk upload format,
        export printable address labels for stamped envelopes, then import tracking
        numbers back into TCGplayer.
      </p>

      <AdminSectionTabs
        sections={[...WORKFLOW_TABS]}
        active={workflow}
        onChange={(id) => setWorkflow(id as WorkflowTab)}
      />

      {error && (
        <p
          className={`rounded-lg p-3 text-sm ${
            error.startsWith("Exported")
              ? "bg-emerald-50 text-emerald-900"
              : "bg-amber-50 text-amber-900"
          }`}
        >
          {error}
        </p>
      )}

      {workflow === "convert" ? (
        <>
          <div className="rounded-xl border bg-white p-4 shadow-sm">
            <h4 className="font-medium text-slate-900">1. Upload TCGplayer export</h4>
            <p className="mt-1 text-xs text-slate-500">
              Expected columns: Order #, FirstName, LastName, Address1, City, State,
              PostalCode, Product Weight, Shipping Method, Value Of Products, etc.
            </p>
            <input
              type="file"
              accept=".csv,text/csv"
              className="mt-3 block w-full text-sm"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleTcgUpload(f);
              }}
            />
            {originalFileName ? (
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <p className="text-xs text-slate-600">
                  Loaded {orders.length} order(s) from {originalFileName}
                </p>
                <button
                  type="button"
                  className="text-xs text-red-600 hover:underline"
                  onClick={clearOrders}
                >
                  Clear
                </button>
              </div>
            ) : null}
          </div>

          <div className="rounded-xl border bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h4 className="font-medium text-slate-900">2. Return address (sender)</h4>
                <p className="mt-1 text-xs text-slate-500">
                  Required on every USPS label — saved per store for future batches.
                </p>
              </div>
              <Button
                type="button"
                variant="secondary"
                onClick={() => saveShippingDefaults(storeId, defaults)}
              >
                Save sender
              </Button>
            </div>
            {!senderReady && (
              <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
                Complete the return address below — exported USPS CSV rows will have
                blank sender fields until this is filled in.
              </p>
            )}
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <label className="block text-sm">
                First name
                <input
                  required
                  className="mt-1 w-full rounded border px-2 py-1.5"
                  placeholder="John"
                  value={defaults.sender.firstName}
                  onChange={(e) =>
                    updateDefaults({
                      ...defaults,
                      sender: { ...defaults.sender, firstName: e.target.value },
                    })
                  }
                />
              </label>
              <label className="block text-sm">
                Last name
                <input
                  required
                  className="mt-1 w-full rounded border px-2 py-1.5"
                  placeholder="Smith"
                  value={defaults.sender.lastName}
                  onChange={(e) =>
                    updateDefaults({
                      ...defaults,
                      sender: { ...defaults.sender, lastName: e.target.value },
                    })
                  }
                />
              </label>
              <label className="block text-sm">
                Company / store name
                <input
                  className="mt-1 w-full rounded border px-2 py-1.5"
                  placeholder="The Game Lodge"
                  value={defaults.sender.company ?? ""}
                  onChange={(e) =>
                    updateDefaults({
                      ...defaults,
                      sender: { ...defaults.sender, company: e.target.value },
                    })
                  }
                />
              </label>
              <label className="block text-sm">
                Phone <span className="text-slate-400">(required by USPS)</span>
                <input
                  required
                  type="tel"
                  className="mt-1 w-full rounded border px-2 py-1.5"
                  placeholder="555-555-5555"
                  value={defaults.sender.phone}
                  onChange={(e) =>
                    updateDefaults({
                      ...defaults,
                      sender: { ...defaults.sender, phone: e.target.value },
                    })
                  }
                />
              </label>
              <label className="block text-sm sm:col-span-2">
                Email <span className="text-slate-400">(required by USPS)</span>
                <input
                  required
                  type="email"
                  className="mt-1 w-full rounded border px-2 py-1.5"
                  placeholder="shipping@yourstore.com"
                  value={defaults.sender.email}
                  onChange={(e) =>
                    updateDefaults({
                      ...defaults,
                      sender: { ...defaults.sender, email: e.target.value },
                    })
                  }
                />
              </label>
              <label className="block text-sm sm:col-span-2">
                Street address
                <input
                  required
                  className="mt-1 w-full rounded border px-2 py-1.5"
                  placeholder="123 Main St"
                  value={defaults.sender.address1}
                  onChange={(e) =>
                    updateDefaults({
                      ...defaults,
                      sender: { ...defaults.sender, address1: e.target.value },
                    })
                  }
                />
              </label>
              <label className="block text-sm sm:col-span-2">
                Address line 2 <span className="text-slate-400">(optional)</span>
                <input
                  className="mt-1 w-full rounded border px-2 py-1.5"
                  placeholder="Suite, unit, etc."
                  value={defaults.sender.address2 ?? ""}
                  onChange={(e) =>
                    updateDefaults({
                      ...defaults,
                      sender: { ...defaults.sender, address2: e.target.value },
                    })
                  }
                />
              </label>
              <label className="block text-sm">
                City
                <input
                  required
                  className="mt-1 w-full rounded border px-2 py-1.5"
                  value={defaults.sender.city}
                  onChange={(e) =>
                    updateDefaults({
                      ...defaults,
                      sender: { ...defaults.sender, city: e.target.value },
                    })
                  }
                />
              </label>
              <label className="block text-sm">
                State
                <input
                  required
                  className="mt-1 w-full rounded border px-2 py-1.5"
                  placeholder="TX"
                  maxLength={2}
                  value={defaults.sender.state}
                  onChange={(e) =>
                    updateDefaults({
                      ...defaults,
                      sender: {
                        ...defaults.sender,
                        state: e.target.value.toUpperCase(),
                      },
                    })
                  }
                />
              </label>
              <label className="block text-sm">
                ZIP code
                <input
                  required
                  className="mt-1 w-full rounded border px-2 py-1.5"
                  placeholder="78040"
                  value={defaults.sender.postalCode}
                  onChange={(e) =>
                    updateDefaults({
                      ...defaults,
                      sender: {
                        ...defaults.sender,
                        postalCode: e.target.value,
                      },
                    })
                  }
                />
              </label>
            </div>
          </div>

          <div className="rounded-xl border bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="font-medium text-slate-900">3. Shipping defaults</h4>
              <Button
                type="button"
                variant="secondary"
                onClick={() => saveShippingDefaults(storeId, defaults)}
              >
                Save defaults
              </Button>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {SHIPPING_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-left text-sm hover:bg-indigo-100"
                  onClick={() => applyPreset(preset.id)}
                >
                  <span className="font-medium text-indigo-900">{preset.label}</span>
                  <span className="mt-0.5 block text-xs text-indigo-700">
                    {preset.description}
                  </span>
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-slate-500">
              Letter mail: First-Class + Letter (~$0.78) for 1 oz singles. Tracked:
              Ground Advantage + Choose Your Own Box. Orders ≥ $
              {defaults.thresholds.trackingRequiredMin} auto-upgrade to tracked.
            </p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <label className="block text-sm">
                Ship date
                <input
                  type="date"
                  className="mt-1 w-full rounded border px-2 py-1.5"
                  value={defaults.shipDate}
                  onChange={(e) =>
                    updateDefaults({ ...defaults, shipDate: e.target.value })
                  }
                />
              </label>
              <label className="block text-sm">
                USPS service
                <select
                  className="mt-1 w-full rounded border px-2 py-1.5"
                  value={defaults.uspsService}
                  onChange={(e) =>
                    updateService(e.target.value as UspsServiceType)
                  }
                >
                  {SERVICE_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                Package type
                <select
                  className="mt-1 w-full rounded border px-2 py-1.5"
                  value={defaults.uspsPackageType}
                  onChange={(e) =>
                    updateDefaults({
                      ...defaults,
                      uspsPackageType: e.target.value as UspsPackageType,
                    })
                  }
                >
                  {packageOptionsForService(defaults.uspsService).map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                Packaging profile
                <select
                  className="mt-1 w-full rounded border px-2 py-1.5"
                  value={defaults.packagingProfileId}
                  onChange={(e) =>
                    selectPackagingProfile(
                      e.target.value as ShippingDefaults["packagingProfileId"],
                    )
                  }
                >
                  {PACKAGING_PROFILES.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label} (+{p.tareOz} oz)
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                Custom tare (oz)
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  className="mt-1 w-full rounded border px-2 py-1.5"
                  value={defaults.customPackagingTareOz}
                  onChange={(e) =>
                    updateDefaults({
                      ...defaults,
                      customPackagingTareOz: Number(e.target.value) || 0,
                    })
                  }
                />
              </label>
              <label className="flex items-center gap-2 text-sm sm:col-span-2">
                <input
                  type="checkbox"
                  checked={defaults.includePackageValue}
                  onChange={(e) =>
                    updateDefaults({
                      ...defaults,
                      includePackageValue: e.target.checked,
                    })
                  }
                />
                Include package value in USPS export
              </label>
            </div>

            <details className="mt-4">
              <summary className="cursor-pointer text-sm font-medium text-indigo-600">
                Advanced: dimensions, insurance &amp; rules
              </summary>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <label className="block text-sm">
                  Length (in)
                  <input
                    type="number"
                    min={0}
                    step={0.1}
                    className="mt-1 w-full rounded border px-2 py-1.5"
                    value={defaults.lengthIn ?? ""}
                    onChange={(e) =>
                      updateDefaults({
                        ...defaults,
                        lengthIn: e.target.value ? Number(e.target.value) : undefined,
                      })
                    }
                  />
                </label>
                <label className="block text-sm">
                  Width (in)
                  <input
                    type="number"
                    min={0}
                    step={0.1}
                    className="mt-1 w-full rounded border px-2 py-1.5"
                    value={defaults.widthIn ?? ""}
                    onChange={(e) =>
                      updateDefaults({
                        ...defaults,
                        widthIn: e.target.value ? Number(e.target.value) : undefined,
                      })
                    }
                  />
                </label>
                <label className="block text-sm">
                  Height (in)
                  <input
                    type="number"
                    min={0}
                    step={0.1}
                    className="mt-1 w-full rounded border px-2 py-1.5"
                    value={defaults.heightIn ?? ""}
                    onChange={(e) =>
                      updateDefaults({
                        ...defaults,
                        heightIn: e.target.value ? Number(e.target.value) : undefined,
                      })
                    }
                  />
                </label>
                <label className="block text-sm">
                  Tracking recommended ≥ $
                  <input
                    type="number"
                    className="mt-1 w-full rounded border px-2 py-1.5"
                    value={defaults.thresholds.trackingRecommendedMin}
                    onChange={(e) =>
                      updateDefaults({
                        ...defaults,
                        thresholds: {
                          ...defaults.thresholds,
                          trackingRecommendedMin: Number(e.target.value) || 0,
                        },
                      })
                    }
                  />
                </label>
                <label className="block text-sm">
                  Tracking required ≥ $
                  <input
                    type="number"
                    className="mt-1 w-full rounded border px-2 py-1.5"
                    value={defaults.thresholds.trackingRequiredMin}
                    onChange={(e) =>
                      updateDefaults({
                        ...defaults,
                        thresholds: {
                          ...defaults.thresholds,
                          trackingRequiredMin: Number(e.target.value) || 0,
                        },
                      })
                    }
                  />
                </label>
                <label className="block text-sm">
                  Signature required ≥ $
                  <input
                    type="number"
                    className="mt-1 w-full rounded border px-2 py-1.5"
                    value={defaults.thresholds.signatureRequiredMin}
                    onChange={(e) =>
                      updateDefaults({
                        ...defaults,
                        thresholds: {
                          ...defaults.thresholds,
                          signatureRequiredMin: Number(e.target.value) || 0,
                        },
                      })
                    }
                  />
                </label>
                <label className="block text-sm">
                  Low-value max ($)
                  <input
                    type="number"
                    className="mt-1 w-full rounded border px-2 py-1.5"
                    value={defaults.lowValueMax}
                    onChange={(e) =>
                      updateDefaults({
                        ...defaults,
                        lowValueMax: Number(e.target.value) || 0,
                      })
                    }
                  />
                </label>
                <label className="block text-sm">
                  Low-value service
                  <select
                    className="mt-1 w-full rounded border px-2 py-1.5"
                    value={defaults.lowValueService}
                    onChange={(e) =>
                      updateDefaults({
                        ...defaults,
                        lowValueService: e.target.value as UspsServiceType,
                      })
                    }
                  >
                    {SERVICE_OPTIONS.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm">
                  Low-value package
                  <select
                    className="mt-1 w-full rounded border px-2 py-1.5"
                    value={defaults.lowValuePackageType}
                    onChange={(e) =>
                      updateDefaults({
                        ...defaults,
                        lowValuePackageType: e.target.value as UspsPackageType,
                      })
                    }
                  >
                    {packageOptionsForService(defaults.lowValueService).map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={defaults.insuranceEnabled}
                    onChange={(e) =>
                      updateDefaults({
                        ...defaults,
                        insuranceEnabled: e.target.checked,
                      })
                    }
                  />
                  Add insurance when value ≥
                </label>
                <label className="block text-sm">
                  Insurance threshold ($)
                  <input
                    type="number"
                    className="mt-1 w-full rounded border px-2 py-1.5"
                    value={defaults.insuranceThreshold}
                    onChange={(e) =>
                      updateDefaults({
                        ...defaults,
                        insuranceThreshold: Number(e.target.value) || 0,
                      })
                    }
                  />
                </label>
              </div>

              <div className="mt-4">
                <p className="text-sm font-medium text-slate-800">TCG method → USPS rules</p>
                <p className="text-xs text-slate-500">
                  Match buyer-facing TCGplayer shipping method text to a USPS service.
                </p>
                <div className="mt-2 space-y-2">
                  {defaults.tcgMethodRules.map((rule, ruleIndex) => (
                    <div
                      key={ruleIndex}
                      className="flex flex-wrap items-end gap-2 rounded border bg-slate-50 p-2"
                    >
                      <label className="block min-w-[8rem] flex-1 text-xs">
                        Contains text
                        <input
                          className="mt-1 w-full rounded border px-2 py-1"
                          value={rule.tcgMethodPattern}
                          onChange={(e) => {
                            const tcgMethodRules = [...defaults.tcgMethodRules];
                            tcgMethodRules[ruleIndex] = {
                              ...rule,
                              tcgMethodPattern: e.target.value,
                            };
                            updateDefaults({ ...defaults, tcgMethodRules });
                          }}
                        />
                      </label>
                      <label className="block text-xs">
                        Service
                        <select
                          className="mt-1 rounded border px-2 py-1"
                          value={rule.uspsService}
                          onChange={(e) => {
                            const tcgMethodRules = [...defaults.tcgMethodRules];
                            tcgMethodRules[ruleIndex] = {
                              ...rule,
                              uspsService: e.target.value as UspsServiceType,
                            };
                            updateDefaults({ ...defaults, tcgMethodRules });
                          }}
                        >
                          {SERVICE_OPTIONS.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="block text-xs">
                        Package
                        <select
                          className="mt-1 rounded border px-2 py-1"
                          value={rule.uspsPackageType}
                          onChange={(e) => {
                            const tcgMethodRules = [...defaults.tcgMethodRules];
                            tcgMethodRules[ruleIndex] = {
                              ...rule,
                              uspsPackageType: e.target.value as UspsPackageType,
                            };
                            updateDefaults({ ...defaults, tcgMethodRules });
                          }}
                        >
                          {PACKAGE_OPTIONS.map((p) => (
                            <option key={p} value={p}>
                              {p}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                  ))}
                </div>
              </div>
            </details>
          </div>

          {prepared.length > 0 && (
            <div className="rounded-xl border bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h4 className="font-medium text-slate-900">4. Preview</h4>
                  <p className="text-xs text-slate-500">
                    {readyCount} ready · {warnCount} warning · {errorCount} blocked
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="secondary" onClick={downloadErrorReport}>
                    Validation report
                  </Button>
                  <Button
                    type="button"
                    disabled={!senderReady}
                    onClick={exportUsps}
                  >
                    Export USPS CSV
                  </Button>
                </div>
              </div>

              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead>
                    <tr className="border-b text-xs uppercase text-slate-500">
                      <th className="px-2 py-2">Status</th>
                      <th className="px-2 py-2">Order</th>
                      <th className="px-2 py-2">Recipient</th>
                      <th className="px-2 py-2">Destination</th>
                      <th className="px-2 py-2">Product wt.</th>
                      <th className="px-2 py-2">Packed wt.</th>
                      <th className="px-2 py-2">Service</th>
                      <th className="px-2 py-2">Package</th>
                      <th className="px-2 py-2">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {prepared.map((row, index) => {
                      const eff = effectiveRow(row);
                      const o = eff.order;
                      return (
                        <tr key={`${o.orderNumber}-${index}`} className="border-b align-top">
                          <td className="px-2 py-2">
                            <span
                              className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${statusBadge(eff.status)}`}
                            >
                              {eff.status}
                            </span>
                            {eff.messages.length > 0 && (
                              <p className="mt-1 max-w-[12rem] text-xs text-slate-500">
                                {eff.messages.join("; ")}
                              </p>
                            )}
                          </td>
                          <td className="px-2 py-2 font-mono text-xs">{o.orderNumber}</td>
                          <td className="px-2 py-2">
                            {o.firstName} {o.lastName}
                          </td>
                          <td className="px-2 py-2">
                            {o.city}, {o.state} {o.postalCode}
                          </td>
                          <td className="px-2 py-2">{formatOz(eff.productWeightOz)}</td>
                          <td className="px-2 py-2">
                            <input
                              type="number"
                              min={0}
                              step={0.01}
                              className="w-16 rounded border px-1 py-0.5 text-xs"
                              value={eff.packedWeightOz ?? ""}
                              onChange={(e) => {
                                const val = Number(e.target.value);
                                updateRowOverride(index, {
                                  packedWeightOz: Number.isFinite(val) ? val : undefined,
                                });
                              }}
                            />
                          </td>
                          <td className="px-2 py-2">
                            {row.serviceLocked ? (
                              <span
                                className="text-xs text-slate-700"
                                title={`Order ≥ $${defaults.thresholds.trackingRequiredMin} — Ground Advantage required`}
                              >
                                {eff.uspsService ?? defaults.uspsService}
                                <span className="ml-1 text-slate-400" aria-hidden>
                                  🔒
                                </span>
                              </span>
                            ) : (
                              <select
                                className="max-w-[10rem] rounded border px-1 py-0.5 text-xs"
                                value={eff.uspsService ?? defaults.uspsService}
                                onChange={(e) =>
                                  updateRowOverride(index, {
                                    uspsService: e.target.value as UspsServiceType,
                                  })
                                }
                              >
                                {SERVICE_OPTIONS.map((s) => (
                                  <option key={s} value={s}>
                                    {s}
                                  </option>
                                ))}
                              </select>
                            )}
                          </td>
                          <td className="px-2 py-2">
                            {row.serviceLocked ? (
                              <span
                                className="text-xs text-slate-700"
                                title={`Order ≥ $${defaults.thresholds.trackingRequiredMin} — tracked package required`}
                              >
                                {eff.uspsPackageType ?? defaults.uspsPackageType}
                              </span>
                            ) : (
                              <select
                                className="max-w-[9rem] rounded border px-1 py-0.5 text-xs"
                                value={eff.uspsPackageType ?? defaults.uspsPackageType}
                                onChange={(e) =>
                                  updateRowOverride(index, {
                                    uspsPackageType: e.target.value as UspsPackageType,
                                  })
                                }
                              >
                                {packageOptionsForService(
                                  eff.uspsService ?? defaults.uspsService,
                                ).map((p) => (
                                  <option key={p} value={p}>
                                    {p}
                                  </option>
                                ))}
                              </select>
                            )}
                          </td>
                          <td className="px-2 py-2">${o.valueOfProducts.toFixed(2)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      ) : workflow === "envelope" ? (
        <div className="space-y-4">
          <div className="rounded-xl border bg-sky-50/80 p-4 text-sm text-sky-950">
            For stamped <strong>First-Class Mail</strong> in plain envelopes — no
            Click-N-Ship tracking label. Export a printable address list, affix
            stamps, and mark shipped in TCGplayer without tracking (carrier only).
          </div>
          {!prepared.length ? (
            <div className="rounded-xl border bg-white p-4 shadow-sm">
              <p className="text-sm text-slate-600">
                Upload a TCGplayer export in the <strong>TCG → USPS</strong> tab
                first.
              </p>
            </div>
          ) : (
            <div className="rounded-xl border bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h4 className="font-medium text-slate-900">Address labels</h4>
                  <p className="text-xs text-slate-500">
                    {orders.length} order(s) from {originalFileName ?? "upload"}
                  </p>
                </div>
                <Button type="button" onClick={exportAddressLabels}>
                  Export address CSV
                </Button>
              </div>
              <p className="mt-3 text-xs text-slate-500">
                CSV includes order #, recipient name, full address, and value. Use
                with your label printer or mail merge for envelope addressing.
              </p>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-xl border bg-amber-50/80 p-4 text-sm text-amber-950">
            After purchasing labels in USPS Click-N-Ship, export or download the
            results file with <strong>Reference Number 1</strong> and{" "}
            <strong>Tracking Number</strong>. We match reference numbers to your
            original TCGplayer Order # and produce a tracking CSV for TCGplayer
            upload.
          </div>
          <div className="rounded-xl border bg-white p-4 shadow-sm">
            <h4 className="font-medium text-slate-900">Upload USPS / label results</h4>
            <input
              type="file"
              accept=".csv,text/csv"
              className="mt-3 block w-full text-sm"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleTrackingUpload(f);
              }}
            />
            {orders.length === 0 && (
              <p className="mt-2 text-xs text-amber-700">
                Tip: import TCGplayer orders in the TCG → USPS tab first so we can
                also produce a full-file update with tracking filled in.
              </p>
            )}
            <div className="mt-4">
              <Button
                type="button"
                disabled={!trackingImportText}
                onClick={exportTrackingToTcg}
              >
                Export TCGplayer tracking CSV
              </Button>
            </div>
            {trackingMessage && (
              <p className="mt-3 text-sm text-slate-600">{trackingMessage}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
