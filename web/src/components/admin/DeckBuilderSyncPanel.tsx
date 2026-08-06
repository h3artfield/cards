"use client";

import { useEffect, useState } from "react";
import { adminFetch } from "@/lib/api-client";
import { useAdmin } from "@/context/AdminContext";
import { Button } from "@/components/Button";
import type { CatalogCoverageReport } from "@/lib/deck-builder/catalog-coverage";
import { CatalogMatchQueuePanel } from "@/components/admin/CatalogMatchQueuePanel";

type DeckBuilderStatus = {
  catalogCards: number;
  catalogOracleCards?: number;
  edhrecCommanders: number;
  inventoryTotal?: number;
  inventoryMagic?: number;
  inventoryEnriched?: number;
  inventoryLinked?: number;
  inventorySkipped?: number;
  inventoryUnresolved?: number;
  crosswalkCount?: number;
  coverage?: CatalogCoverageReport | null;
  matchQueueSummary?: {
    needsReview: number;
    conflictGroups: number;
    unresolved: number;
    fuzzyMatches: number;
    conflicts: number;
  } | null;
};

function CoverageBar({ label, pct }: { label: string; pct: number }) {
  return (
    <div>
      <div className="flex justify-between text-xs text-slate-600">
        <span>{label}</span>
        <span>{pct.toFixed(1)}%</span>
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-200">
        <div
          className="h-full rounded-full bg-indigo-500 transition-all"
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>
    </div>
  );
}

export function DeckBuilderSyncPanel() {
  const { activeStore } = useAdmin();
  const [status, setStatus] = useState<DeckBuilderStatus | null>(null);
  const [queuePreview, setQueuePreview] = useState<
    import("@/lib/deck-builder/catalog-match-queue").CatalogMatchQueueRow[]
  >([]);
  const [showQueue, setShowQueue] = useState(false);
  const [oracleOffset, setOracleOffset] = useState(0);
  const [edhrecOffset, setEdhrecOffset] = useState(0);
  const [scryfallOffset, setScryfallOffset] = useState(0);
  const [log, setLog] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  function appendLog(msg: string) {
    setLog((l) => [msg, ...l].slice(0, 40));
  }

  function refreshStatus() {
    return adminFetch("/api/admin/deck-builder/status")
      .then(async (r) => {
        const data = await r.json();
        if (r.ok) setStatus(data);
      })
      .catch(() => {});
  }

  async function loadMatchQueue() {
    if (!activeStore) return;
    try {
      const res = await adminFetch(
        "/api/admin/inventory/catalog-match-queue?limit=25&reasons=unresolved,fuzzy_match,conflict,missing_printing_id",
      );
      const data = await res.json();
      if (res.ok) {
        setQueuePreview(
          (data.rows ?? []) as import("@/lib/deck-builder/catalog-match-queue").CatalogMatchQueueRow[],
        );
        setShowQueue(true);
      }
    } catch {
      /* ignore */
    }
  }

  async function refreshQueueAndStatus() {
    await refreshStatus();
    if (showQueue) await loadMatchQueue();
  }

  useEffect(() => {
    void refreshStatus();
  }, [activeStore?.id]);

  async function readAdminJson(res: Response): Promise<Record<string, unknown>> {
    const text = await res.text();
    try {
      return JSON.parse(text) as Record<string, unknown>;
    } catch {
      const snippet = text.trim().slice(0, 120) || res.statusText;
      throw new Error(
        res.ok
          ? `Invalid server response: ${snippet}`
          : `Request failed (${res.status}): ${snippet}`,
      );
    }
  }

  async function syncEdhrec() {
    setBusy(true);
    let offset = edhrecOffset;
    let remaining = 1;
    let totalSynced = 0;
    let totalFailed = 0;
    let roundNum = 0;
    const batchSize = 5;
    const limit = 500;
    const maxRounds = 60;

    try {
      do {
        roundNum += 1;
        let data: Record<string, unknown> | null = null;
        let lastErr: Error | null = null;

        for (let attempt = 1; attempt <= 3; attempt += 1) {
          try {
            const res = await adminFetch("/api/admin/deck-builder/sync/edhrec", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ offset, batchSize, limit, runAll: true }),
            });
            data = await readAdminJson(res);
            if (!res.ok) {
              throw new Error(String(data.error ?? "EDHREC sync failed"));
            }
            lastErr = null;
            break;
          } catch (e) {
            lastErr = e instanceof Error ? e : new Error("EDHREC sync failed");
            if (attempt < 3) {
              appendLog(`EDHREC retry ${attempt}/3: ${lastErr.message}`);
              await new Promise((r) => setTimeout(r, 2000 * attempt));
            }
          }
        }
        if (lastErr || !data) throw lastErr ?? new Error("EDHREC sync failed");

        const roundSynced = Number(data.synced ?? 0);
        const roundFailed = Number(data.failed ?? 0);
        totalSynced += roundSynced;
        totalFailed += roundFailed;
        remaining = Number(data.remaining ?? 0);
        offset = Number(data.nextOffset ?? offset + batchSize);
        const batchesRun = Number(data.batchesRun ?? 1);
        setEdhrecOffset(offset);

        appendLog(
          `EDHREC round ${roundNum}: +${roundSynced} commanders (${batchesRun} batches), ${remaining} remaining`,
        );

        if (remaining <= 0) break;
        if (roundSynced === 0) break;
        if (roundNum >= maxRounds) {
          appendLog(`EDHREC paused — click again to continue from offset ${offset}.`);
          break;
        }
      } while (remaining > 0);

      appendLog(
        `EDHREC done — ${totalSynced} commanders synced, ${totalFailed} failed${remaining > 0 ? `, ${remaining} still remaining` : ""}.`,
      );
      await refreshStatus();
    } catch (e) {
      appendLog(e instanceof Error ? e.message : "EDHREC sync failed");
      appendLog(`Stopped at offset ${offset} — click again to resume.`);
      setEdhrecOffset(offset);
    } finally {
      setBusy(false);
    }
  }

  async function syncOracleCards(continueLoop = false) {
    setBusy(true);
    let offset = oracleOffset;
    let totalUpserted = 0;
    let remaining = 1;
    try {
      do {
        const res = await adminFetch("/api/admin/deck-builder/sync/oracle-cards", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ limit: 200, offset }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Oracle card sync failed");
        totalUpserted += Number(data.upserted ?? 0);
        remaining = Number(data.remaining ?? 0);
        offset = Number(data.nextOffset ?? offset + 200);
        setOracleOffset(offset);
        appendLog(
          `Oracle cards: upserted ${data.upserted ?? 0}, ${remaining} printings remaining`,
        );
        if (!continueLoop || remaining <= 0 || (data.processed ?? 0) === 0) break;
      } while (remaining > 0);
      appendLog(`Oracle cards done — ${totalUpserted} upserted this run.`);
      await refreshStatus();
    } catch (e) {
      appendLog(e instanceof Error ? e.message : "Oracle card sync failed");
    } finally {
      setBusy(false);
    }
  }

  async function syncScryfall() {
    setBusy(true);
    try {
      const res = await adminFetch("/api/admin/deck-builder/sync/scryfall", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ offset: scryfallOffset, batchSize: 50 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Scryfall sync failed");
      setScryfallOffset(data.nextOffset ?? scryfallOffset + 50);
      appendLog(
        `Scryfall (${data.mode}): imported ${data.imported ?? data.imported}, remaining ${data.remaining ?? "?"}`,
      );
    } catch (e) {
      appendLog(e instanceof Error ? e.message : "Scryfall sync failed");
    } finally {
      setBusy(false);
    }
  }

  async function syncCrosswalk() {
    if (!activeStore) return;
    setBusy(true);
    try {
      const res = await adminFetch("/api/admin/deck-builder/sync/crosswalk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit: 50 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Crosswalk failed");
      appendLog(
        `Crosswalk: linked ${data.linked}, processed ${data.processed}, remaining ${data.remaining}`,
      );
    } catch (e) {
      appendLog(e instanceof Error ? e.message : "Crosswalk failed");
    } finally {
      setBusy(false);
    }
  }

  async function enrichCatalog(continueLoop = false, forceRelink = false) {
    if (!activeStore) return;
    setBusy(true);
    let remaining = 1;
    let total = 0;
    let batchNum = 0;

    try {
      do {
        batchNum += 1;
        const res = await adminFetch("/api/admin/inventory/enrich-catalog", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ limit: 200, forceRelink }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Catalog enrich failed");
        total += data.enriched ?? 0;
        remaining = data.pendingEstimate ?? data.remaining ?? 0;
        const reasons = data.failureReasons as Record<string, number> | undefined;
        const reasonText = reasons
          ? Object.entries(reasons)
              .filter(([, n]) => n > 0)
              .map(([k, n]) => `${k}:${n}`)
              .join(", ")
          : "";
        const bulkNote =
          data.bulkIndexUsed && data.bulkIndexCards
            ? ` [bulk ${data.bulkIndexCards.toLocaleString()} cards${data.bulkIndexLoadMs ? `, ${data.bulkIndexLoadMs}ms load` : ""}]`
            : "";
        appendLog(
          `Catalog enrich batch ${batchNum}: +${data.enriched} linked, ${data.skippedNonCard ?? data.skipped ?? 0} skipped (non-cards), ${data.unresolved ?? data.failed ?? 0} unresolved${reasonText ? ` (${reasonText})` : ""}, ~${remaining} pending${bulkNote}`,
        );
        if (!continueLoop || remaining <= 0) break;
        if ((data.enriched ?? 0) === 0 && (data.unresolved ?? data.failed ?? 0) >= (data.processed ?? 1)) break;
      } while (remaining > 0);
      appendLog(`Catalog enrich done — ${total} rows updated with color/legality.`);
      await refreshStatus();
    } catch (e) {
      appendLog(e instanceof Error ? e.message : "Catalog enrich failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-8 rounded-xl border bg-white p-4">
      <h3 className="text-lg font-semibold text-slate-900">Deck Builder data sync</h3>
      <p className="mt-1 text-sm text-slate-500">
        Link inventory to Scryfall via TCGplayer ID, write color identity and
        legality onto each row, then sync EDHREC.
      </p>
      {status && (
        <div className="mt-2 space-y-1 text-sm text-slate-600">
          {status.inventoryMagic != null ? (
            <p>
              <strong>{status.inventoryLinked?.toLocaleString() ?? 0}</strong>{" "}
              linked ·{" "}
              <strong>{status.inventorySkipped?.toLocaleString() ?? 0}</strong>{" "}
              skipped (non-cards) ·{" "}
              <strong>{status.inventoryUnresolved?.toLocaleString() ?? 0}</strong>{" "}
              unresolved ·{" "}
              <strong>
                {Math.max(
                  0,
                  status.inventoryMagic -
                    (status.inventoryEnriched ?? 0),
                ).toLocaleString()}
              </strong>{" "}
              pending — of {status.inventoryMagic.toLocaleString()} Magic rows
            </p>
          ) : null}
          <p>
            {status.catalogCards.toLocaleString()} cached printings
            {status.catalogOracleCards != null
              ? ` · ${status.catalogOracleCards.toLocaleString()} oracle cards`
              : ""}{" "}
            · {status.crosswalkCount?.toLocaleString() ?? 0} inventory links
          </p>
          <p className="text-xs text-slate-500">
            {status.edhrecCommanders} EDHREC commander profiles (for deck
            recommendations — run EDHREC batch separately)
          </p>
          {status.coverage ? (
            <div className="mt-3 space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Catalog coverage ({status.coverage.counts.total.toLocaleString()}{" "}
                enrichable Magic singles)
              </p>
              <CoverageBar label="Oracle ID" pct={status.coverage.rates.oracleIdPct} />
              <CoverageBar
                label="Scryfall printing ID"
                pct={status.coverage.rates.scryfallIdPct}
              />
              <CoverageBar
                label="Oracle text"
                pct={status.coverage.rates.oracleTextPct}
              />
              <CoverageBar
                label="Commander eligibility"
                pct={status.coverage.rates.commanderEligibilityPct}
              />
              <CoverageBar
                label="Oracle tags"
                pct={status.coverage.rates.oracleTagsPct}
              />
              <p className="text-xs text-slate-500">
                Fuzzy matches {status.coverage.rates.fuzzyMatchPct}% · Unresolved{" "}
                {status.coverage.rates.unresolvedPct}% · Conflicts{" "}
                {status.coverage.rates.conflictPct}%
                {status.coverage.counts.pending > 0
                  ? ` · ${status.coverage.counts.pending.toLocaleString()} pending enrichment`
                  : ""}
              </p>
            </div>
          ) : null}
          {status.matchQueueSummary ? (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-600">
              <span>
                <strong>{status.matchQueueSummary.needsReview.toLocaleString()}</strong>{" "}
                rows need catalog review
              </span>
              {status.matchQueueSummary.conflictGroups > 0 ? (
                <span>
                  · <strong>{status.matchQueueSummary.conflictGroups}</strong>{" "}
                  TCGplayer conflict groups
                </span>
              ) : null}
              <button
                type="button"
                className="text-indigo-600 underline"
                onClick={() => void loadMatchQueue()}
              >
                Show queue
              </button>
            </div>
          ) : null}
        </div>
      )}
      {showQueue && queuePreview.length > 0 ? (
        <CatalogMatchQueuePanel
          rows={queuePreview}
          onResolved={() => void refreshQueueAndStatus()}
        />
      ) : null}
      <div className="mt-4 flex flex-wrap gap-2">
        <Button disabled={busy} onClick={() => void syncScryfall()}>
          Scryfall batch
        </Button>
        <Button disabled={busy} onClick={() => void syncEdhrec()}>
          {busy ? "EDHREC syncing…" : `EDHREC sync all (from ${edhrecOffset})`}
        </Button>
        <Button disabled={busy} onClick={() => void syncOracleCards(true)}>
          Build oracle cards
        </Button>
        <Button disabled={busy || !activeStore} onClick={() => void enrichCatalog(true)}>
          Enrich inventory catalog (all Magic)
        </Button>
        <Button
          disabled={busy || !activeStore}
          onClick={() => void enrichCatalog(true, true)}
        >
          Force re-link (fix bad matches)
        </Button>
        <Button disabled={busy || !activeStore} onClick={() => void syncCrosswalk()}>
          Legacy crosswalk batch
        </Button>
      </div>
      {log.length > 0 && (
        <ul className="mt-4 space-y-1 text-xs text-slate-600">
          {log.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
