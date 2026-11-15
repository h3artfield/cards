"use client";

import { useState } from "react";
import { Button } from "@/components/Button";
import { adminFetch } from "@/lib/api-client";

type Outcome = {
  displayName: string;
  from?: string;
  to?: string;
  error?: string;
};

type RunTotals = {
  apply: boolean;
  listed: number;
  checked: number;
  needsUpdate: number;
  updated: number;
  alreadyCorrect: number;
  noCardLink: number;
  failed: number;
  failures: Outcome[];
  sample?: Outcome;
  done: boolean;
};

/** A stuck cursor would otherwise loop forever. */
const MAX_REQUESTS = 200;

/**
 * Re-points Shopify barcodes at each card's link so scanning a QR label at the
 * register finds the product. Listings made before the store's domain changed
 * still carry the old link.
 */
export function ShopifyBarcodeSyncPanel() {
  const [running, setRunning] = useState<"preview" | "apply" | null>(null);
  const [totals, setTotals] = useState<RunTotals | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(apply: boolean) {
    if (
      apply &&
      !window.confirm(
        "Update the barcode on every Shopify listing that doesn't match its card link?",
      )
    ) {
      return;
    }
    setRunning(apply ? "apply" : "preview");
    setError(null);
    const acc: RunTotals = {
      apply,
      listed: 0,
      checked: 0,
      needsUpdate: 0,
      updated: 0,
      alreadyCorrect: 0,
      noCardLink: 0,
      failed: 0,
      failures: [],
      done: false,
    };
    setTotals(null);
    try {
      let cursor: number | null = 0;
      for (let i = 0; cursor != null && i < MAX_REQUESTS; i += 1) {
        const res = await adminFetch("/api/admin/shopify/barcodes", {
          method: "POST",
          body: JSON.stringify({ apply, cursor }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Barcode update failed");
        const s = data.summary as {
          listed: number;
          checked: number;
          needsUpdate: number;
          updated: number;
          alreadyCorrect: number;
          noCardLink: number;
          failed: number;
          nextCursor: number | null;
          outcomes: Outcome[];
        };
        acc.listed = s.listed;
        acc.checked += s.checked;
        acc.needsUpdate += s.needsUpdate;
        acc.updated += s.updated;
        acc.alreadyCorrect += s.alreadyCorrect;
        acc.noCardLink += s.noCardLink;
        acc.failed += s.failed;
        acc.failures.push(...s.outcomes.filter((o) => o.error));
        acc.sample ??= s.outcomes.find((o) => !o.error && o.from !== undefined);
        if (s.nextCursor != null && s.nextCursor <= cursor) break;
        cursor = s.nextCursor;
        acc.done = cursor == null;
        setTotals({ ...acc, failures: [...acc.failures] });
      }
    } catch (err) {
      setError(
        `${err instanceof Error ? err.message : "Barcode update failed"}${
          acc.checked ? " — press the button again to finish the rest." : ""
        }`,
      );
    } finally {
      setTotals({ ...acc, failures: [...acc.failures] });
      setRunning(null);
    }
  }

  return (
    <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h4 className="text-sm font-semibold text-slate-900">
            Update Shopify barcodes to card links
          </h4>
          <p className="text-xs text-slate-600">
            Makes each listing&apos;s barcode match its QR label so the register
            finds the card when you scan it. Preview first — it changes nothing.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            onClick={() => void run(false)}
            disabled={running != null}
          >
            {running === "preview" ? "Checking…" : "Preview changes"}
          </Button>
          <Button
            onClick={() => void run(true)}
            disabled={running != null}
          >
            {running === "apply" ? "Updating…" : "Update barcodes"}
          </Button>
        </div>
      </div>

      {totals ? (
        <div className="mt-3 space-y-1 text-xs text-slate-700">
          <p>
            {totals.apply ? "Update" : "Preview"}
            {totals.done ? "" : running ? " in progress" : " stopped early"}:
            checked {totals.checked.toLocaleString()} of{" "}
            {totals.listed.toLocaleString()} Shopify listing
            {totals.listed === 1 ? "" : "s"}.
          </p>
          <p>
            {totals.apply ? (
              <>
                <strong>{totals.updated.toLocaleString()}</strong> updated
              </>
            ) : (
              <>
                <strong>{totals.needsUpdate.toLocaleString()}</strong> would change
              </>
            )}
            {" · "}
            {totals.alreadyCorrect.toLocaleString()} already correct
            {totals.noCardLink
              ? ` · ${totals.noCardLink.toLocaleString()} skipped (no card link)`
              : ""}
            {" · "}
            {totals.failed.toLocaleString()} failed
          </p>
          {!totals.apply && totals.sample ? (
            <p className="break-all text-slate-500">
              Example: {totals.sample.displayName} — “{totals.sample.from || "(blank)"}” →
              “{totals.sample.to}”
            </p>
          ) : null}
          {totals.failures.length ? (
            <details className="mt-2">
              <summary className="cursor-pointer font-medium text-slate-700">
                {totals.failures.length} row{totals.failures.length === 1 ? "" : "s"} failed
              </summary>
              <ul className="mt-1 space-y-1">
                {totals.failures.slice(0, 20).map((f, i) => (
                  <li key={`${f.displayName}-${i}`}>
                    <span className="text-slate-800">{f.displayName}</span>
                    <span className="text-red-700"> — {f.error}</span>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </div>
      ) : null}

      {error ? <p className="mt-2 text-xs text-red-700">{error}</p> : null}
    </div>
  );
}
