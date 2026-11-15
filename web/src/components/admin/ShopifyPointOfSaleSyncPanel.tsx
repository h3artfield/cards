"use client";

import { useState } from "react";
import { Button } from "@/components/Button";
import { adminFetch } from "@/lib/api-client";

type Outcome = { displayName: string; error?: string };

type RunTotals = {
  apply: boolean;
  activateInStock: boolean;
  listed: number;
  checked: number;
  needsUpdate: number;
  updated: number;
  alreadyCorrect: number;
  missingFromPos: number;
  inStockDraft: number;
  draftKept: number;
  failed: number;
  failures: Outcome[];
  done: boolean;
};

const MAX_REQUESTS = 200;

/**
 * Puts listings already on Shopify onto the Point of Sale channel (and makes
 * in-stock Drafts Active) so the register can ring up a scanned QR label.
 */
export function ShopifyPointOfSaleSyncPanel() {
  const [running, setRunning] = useState<"preview" | "apply" | null>(null);
  const [totals, setTotals] = useState<RunTotals | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(apply: boolean) {
    if (
      apply &&
      !window.confirm(
        "Add every Shopify listing to Point of Sale so the register can sell it?",
      )
    ) {
      return;
    }
    setRunning(apply ? "apply" : "preview");
    setError(null);
    const acc: RunTotals = {
      apply,
      activateInStock: false,
      listed: 0,
      checked: 0,
      needsUpdate: 0,
      updated: 0,
      alreadyCorrect: 0,
      missingFromPos: 0,
      inStockDraft: 0,
      draftKept: 0,
      failed: 0,
      failures: [],
      done: false,
    };
    setTotals(null);
    try {
      let cursor: number | null = 0;
      for (let i = 0; cursor != null && i < MAX_REQUESTS; i += 1) {
        const res = await adminFetch("/api/admin/shopify/point-of-sale", {
          method: "POST",
          body: JSON.stringify({ apply, cursor }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Point of Sale update failed");
        const s = data.summary as Omit<RunTotals, "apply" | "activateInStock" | "failures" | "done"> & {
          nextCursor: number | null;
          outcomes: Outcome[];
        };
        acc.activateInStock = Boolean(data.activateInStock);
        acc.listed = s.listed;
        acc.checked += s.checked;
        acc.needsUpdate += s.needsUpdate;
        acc.updated += s.updated;
        acc.alreadyCorrect += s.alreadyCorrect;
        acc.missingFromPos += s.missingFromPos;
        acc.inStockDraft += s.inStockDraft;
        acc.draftKept += s.draftKept;
        acc.failed += s.failed;
        acc.failures.push(...s.outcomes.filter((o) => o.error));
        if (s.nextCursor != null && s.nextCursor <= cursor) break;
        cursor = s.nextCursor;
        acc.done = cursor == null;
        setTotals({ ...acc, failures: [...acc.failures] });
      }
    } catch (err) {
      setError(
        `${err instanceof Error ? err.message : "Point of Sale update failed"}${
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
            Make listings sellable at the register
          </h4>
          <p className="text-xs text-slate-600">
            Adds each listing to Shopify&apos;s Point of Sale channel, and makes
            in-stock Draft listings Active when your default status is Active. It
            doesn&apos;t add anything to the online store. Preview first — it
            changes nothing.
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
          <Button onClick={() => void run(true)} disabled={running != null}>
            {running === "apply" ? "Updating…" : "Update listings"}
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
            {totals.missingFromPos.toLocaleString()} not on Point of Sale
            {" · "}
            {totals.inStockDraft.toLocaleString()} in stock but Draft
            {" · "}
            {totals.alreadyCorrect.toLocaleString()} already sellable
            {" · "}
            {totals.failed.toLocaleString()} failed
          </p>
          {totals.draftKept ? (
            <p className="text-amber-800">
              {totals.draftKept.toLocaleString()} in-stock listing
              {totals.draftKept === 1 ? " is" : "s are"} Draft and will stay
              that way, because your default product status is Draft. The
              register can&apos;t sell Draft listings — set the default status
              to Active in Shopify settings, then run this again.
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
