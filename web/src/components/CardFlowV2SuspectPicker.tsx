"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/Button";
import { adminFetch } from "@/lib/api-client";
import type { CardCandidateBundle, CardFlowV2EvidenceBundle } from "@/lib/card-flow-v2/types";
import type { CardFlowV2MarketBundle } from "@/lib/card-flow-v2/market/types";
import type { V2OfferPreview } from "@/lib/card-flow-v2/offer/types";
import { evidenceToManualEntryDefaults } from "@/lib/card-flow-v2/pokemon-japanese-fallback";
import {
  SuspectVisualComparePanel,
  DesktopHoverCompareDock,
} from "@/components/SuspectVisualCompare";
import {
  buildSuspectPickerRows,
  getVariantStaffExplanations,
  getStaffSelectedSuspect,
  type SuspectPickerRow,
} from "@/lib/card-flow-v2/staff-suspect-selection";

/** Wide screens — split version list + hover compare pane (Directive 011 desktop). */
const DESKTOP_HOVER_COMPARE_MIN_PX = 1024;

function useWideDesktop(minWidth = DESKTOP_HOVER_COMPARE_MIN_PX): boolean {
  const [wide, setWide] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(`(min-width: ${minWidth}px)`);
    const update = () => setWide(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, [minWidth]);

  return wide;
}

export function CardFlowV2SuspectPicker({
  cardId,
  identity,
  market,
  evidence,
  customerFrontImageUrl,
  customerBackImageUrl,
  layout = "default",
  suppressSectionTitle = false,
  compareDockActive = true,
  forceShowPicker = false,
  onManagerReview,
  onConfirmStart,
  onConfirmFailed,
  onSaved,
}: {
  cardId: string;
  identity: CardCandidateBundle;
  market?: CardFlowV2MarketBundle;
  evidence?: CardFlowV2EvidenceBundle;
  /** Customer-uploaded scan for visual compare (Directive 011). */
  customerFrontImageUrl?: string;
  customerBackImageUrl?: string;
  layout?: "default" | "mobile";
  /** Hide inner section title when parent step already labels Step 1. */
  suppressSectionTitle?: boolean;
  /** Hide fixed compare dock when parent leaves version picker (e.g. flip back to summary). */
  compareDockActive?: boolean;
  /** Parent opened review — show full version list (e.g. Select version tap). */
  forceShowPicker?: boolean;
  onManagerReview?: () => void;
  /** Fires synchronously on tap — flip card / optimistic UI before API returns. */
  onConfirmStart?: (suspectId?: string) => void;
  /** Revert optimistic parent state when save fails after confirm tap. */
  onConfirmFailed?: () => void;
  onSaved?: (payload?: {
    identity?: CardCandidateBundle;
    market?: CardFlowV2MarketBundle;
    offerPreview?: V2OfferPreview;
    card?: import("@/lib/types").ScannedCard;
  }) => void;
}) {
  const isMobile = layout === "mobile";
  const rows = useMemo(
    () => buildSuspectPickerRows(identity, market),
    [identity, market],
  );
  const variantExplanations = useMemo(
    () => getVariantStaffExplanations(identity),
    [identity],
  );
  const hasScanDerivedOnly = useMemo(
    () =>
      rows.length > 0 &&
      rows.every((r) => r.scanDerived || r.catalogSource === "scan_derived_fallback"),
    [rows],
  );

  const savedId = identity.staffSelection?.suspectId;
  const confirmedSuspect = getStaffSelectedSuspect(identity);
  /** Bridges API round-trip — avoids blank picker while parent state catches up. */
  const [pendingSavedId, setPendingSavedId] = useState<string | null>(null);
  const effectiveSavedId = savedId ?? pendingSavedId;
  const [activeId, setActiveId] = useState<string | null>(
    savedId ?? rows[0]?.suspectId ?? null,
  );
  const [showPicker, setShowPicker] = useState(!savedId);
  const [notes, setNotes] = useState(identity.staffSelection?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Inline side-by-side compare below the row whose Compare button was pressed. */
  const [inlineCompareId, setInlineCompareId] = useState<string | null>(null);
  /** Desktop hover compare — row under pointer in the left column. */
  const [hoverCompareId, setHoverCompareId] = useState<string | null>(null);

  const compareEnabled = Boolean(customerFrontImageUrl?.trim());
  const isWideDesktop = useWideDesktop();
  const useHoverCompare = compareEnabled && isWideDesktop;
  const inlineCompareEnabled = compareEnabled && !useHoverCompare;

  useEffect(() => {
    if (savedId) {
      setActiveId(savedId);
      setPendingSavedId(null);
      if (!forceShowPicker) {
        setShowPicker(false);
      }
    }
  }, [savedId, forceShowPicker]);

  useEffect(() => {
    if (forceShowPicker) {
      setShowPicker(true);
    }
  }, [forceShowPicker]);

  const savedSuspectMissing = Boolean(
    effectiveSavedId && !rows.some((r) => r.suspectId === effectiveSavedId),
  );

  useEffect(() => {
    if (savedSuspectMissing) {
      setShowPicker(true);
    }
  }, [savedSuspectMissing]);

  const activeRow = rows.find((r) => r.suspectId === activeId) ?? rows[0];
  const confirmedRow = effectiveSavedId
    ? rows.find((r) => r.suspectId === effectiveSavedId)
    : undefined;
  const alternativeRows = effectiveSavedId
    ? rows.filter((r) => r.suspectId !== effectiveSavedId)
    : rows;
  const showVersionList =
    showPicker || !isMobile || !effectiveSavedId || savedSuspectMissing || forceShowPicker;
  const showSelectedSummary =
    isMobile &&
    effectiveSavedId &&
    !showPicker &&
    !savedSuspectMissing &&
    !forceShowPicker &&
    (confirmedRow || confirmedSuspect);

  function selectRow(row: SuspectPickerRow) {
    setActiveId(row.suspectId);
  }

  function toggleCompare(suspectId: string) {
    setActiveId(suspectId);
    setInlineCompareId((current) => (current === suspectId ? null : suspectId));
  }

  function renderInlineCompare(row: SuspectPickerRow, className = "") {
    if (!inlineCompareEnabled || inlineCompareId !== row.suspectId || !customerFrontImageUrl) {
      return null;
    }
    return (
      <div className={className}>
        <SuspectVisualComparePanel
          row={row}
          customerFrontImageUrl={customerFrontImageUrl}
          customerBackImageUrl={customerBackImageUrl}
          layout="horizontal"
          size="overlay"
        />
      </div>
    );
  }

  const hoverCompareRow =
    rows.find((r) => r.suspectId === (hoverCompareId ?? activeId)) ?? rows[0];

  function renderSuspectRow(
    row: SuspectPickerRow,
    opts: {
      confirmed: boolean;
      showSelectButton?: boolean;
      oneTapConfirm?: boolean;
      inlineCompareClassName?: string;
    },
  ) {
    return (
      <Fragment key={row.suspectId}>
        <SuspectOption
          row={row}
          selected={activeId === row.suspectId}
          confirmed={opts.confirmed}
          isMobile={isMobile}
          saving={saving}
          compareEnabled={inlineCompareEnabled}
          compareOpen={inlineCompareId === row.suspectId}
          hoverCompareMode={useHoverCompare}
          hoverActive={useHoverCompare && hoverCompareId === row.suspectId}
          onHoverCompare={() => {
            setHoverCompareId(row.suspectId);
            setActiveId(row.suspectId);
          }}
          onSelect={() => selectRow(row)}
          onCompare={() => toggleCompare(row.suspectId)}
          onConfirm={() => {
            setActiveId(row.suspectId);
            void saveSelection(row.suspectId);
          }}
          showSelectButton={opts.showSelectButton}
          oneTapConfirm={opts.oneTapConfirm}
        />
        {renderInlineCompare(row, opts.inlineCompareClassName)}
      </Fragment>
    );
  }

  function renderDesktopCompareDock() {
    if (!compareDockActive || !useHoverCompare || !customerFrontImageUrl) {
      return null;
    }
    return (
      <DesktopHoverCompareDock
        row={hoverCompareRow}
        customerFrontImageUrl={customerFrontImageUrl}
        customerBackImageUrl={customerBackImageUrl}
      />
    );
  }

  async function saveManualEntry(entry: {
    name: string;
    setName?: string;
    setCode?: string;
    cardNumber?: string;
    finish?: string;
    language?: string;
  }) {
    onConfirmStart?.();
    setSaving(true);
    setError(null);
    try {
      const res = await adminFetch(`/api/admin/cards/${cardId}/v2-identity`, {
        method: "PATCH",
        body: JSON.stringify({
          manualEntry: {
            ...entry,
            notes: notes.trim() || undefined,
          },
        }),
      });
      const data = (await res.json()) as {
        error?: string;
        card?: import("@/lib/types").ScannedCard;
        cardFlowV2Identity?: CardCandidateBundle;
        cardFlowV2Market?: CardFlowV2MarketBundle;
        cardFlowV2OfferPreview?: V2OfferPreview;
      };
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      const manualSuspectId = data.cardFlowV2Identity?.staffSelection?.suspectId;
      onSaved?.({
        identity: data.cardFlowV2Identity,
        market: data.cardFlowV2Market,
        offerPreview: data.cardFlowV2OfferPreview,
        card: data.card,
      });
      if (manualSuspectId) {
        setPendingSavedId(manualSuspectId);
        setActiveId(manualSuspectId);
        setShowPicker(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function saveSelection(suspectId: string | null) {
    if (suspectId) {
      onConfirmStart?.(suspectId);
      setPendingSavedId(suspectId);
      setActiveId(suspectId);
      setShowPicker(false);
    }
    setSaving(true);
    setError(null);
    try {
      const res = await adminFetch(`/api/admin/cards/${cardId}/v2-identity`, {
        method: "PATCH",
        body: JSON.stringify({
          suspectId,
          notes: notes.trim() || undefined,
        }),
      });
      const data = (await res.json()) as {
        error?: string;
        card?: import("@/lib/types").ScannedCard;
        cardFlowV2Identity?: CardCandidateBundle;
        cardFlowV2Market?: CardFlowV2MarketBundle;
        cardFlowV2OfferPreview?: V2OfferPreview;
      };
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      onSaved?.({
        identity: data.cardFlowV2Identity,
        market: data.cardFlowV2Market,
        offerPreview: data.cardFlowV2OfferPreview,
        card: data.card,
      });
      if (!suspectId) {
        setPendingSavedId(null);
        setShowPicker(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
      if (suspectId) {
        setPendingSavedId(null);
        setShowPicker(true);
        onConfirmFailed?.();
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className={`rounded-lg border bg-white p-3 ${
        isMobile ? "border-violet-200" : "border-violet-300"
      }`}
    >
      {!isMobile && (
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-violet-800">
              Confirm printing
            </h4>
            <p className="mt-1 text-xs text-gray-600">
              V2 narrowed the options — pick the exact printing.
            </p>
          </div>
          {confirmedSuspect && (
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-900">
              Staff confirmed
            </span>
          )}
        </div>
      )}

      {isMobile && showSelectedSummary && (
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-violet-800">
            Selected printing
          </p>
          <p className="text-sm font-medium text-gray-900">
            {(confirmedRow?.label ?? confirmedSuspect?.label ?? "").split(" · ")[0] ||
              confirmedRow?.label ||
              confirmedSuspect?.label}
          </p>
          <p className="text-xs text-gray-600">
            {confirmedRow
              ? suspectSubtitle(confirmedRow) || confirmedRow.label
              : confirmedSuspect?.label}
          </p>
          <div className="flex flex-col gap-2">
            <Button
              variant="primary"
              className="min-h-11 w-full"
              onClick={() => setShowPicker(false)}
            >
              Looks correct
            </Button>
            <Button
              variant="secondary"
              className="min-h-11 w-full"
              onClick={() => setShowPicker(true)}
            >
              Change
            </Button>
            <Button
              variant="ghost"
              className="min-h-11 w-full"
              onClick={() => onManagerReview?.()}
            >
              Manager review
            </Button>
            <Button
              variant="ghost"
              className="min-h-11 w-full text-gray-500"
              disabled={saving}
              onClick={() => void saveSelection(null)}
            >
              Clear
            </Button>
          </div>

          {alternativeRows.length > 0 && (
            <details className="rounded-lg border border-gray-200 bg-gray-50/60">
              <summary className="cursor-pointer list-none px-3 py-3 text-sm font-medium text-gray-800 [&::-webkit-details-marker]:hidden">
                Other possible versions
                <span className="mt-0.5 block text-xs font-normal text-indigo-600">
                  Show alternatives
                </span>
              </summary>
              <div className="space-y-3 border-t border-gray-200 px-3 py-3">
                {alternativeRows.map((row) =>
                  renderSuspectRow(row, {
                    confirmed: false,
                    oneTapConfirm: false,
                  }),
                )}
              </div>
            </details>
          )}
        </div>
      )}

      {showVersionList && (
        <>
          {savedSuspectMissing && (
            <div className="mb-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950">
              <p className="font-semibold">Saved printing needs re-confirmation</p>
              <p className="mt-1">
                V2 reprocessing updated the candidate list — pick the matching
                version below.
              </p>
            </div>
          )}

          {rows.length === 0 && (
            <div className="mb-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950">
              <p className="font-semibold">No catalog versions available</p>
              <p className="mt-1">
                Use manual entry below or re-run V2 processing on this card.
              </p>
            </div>
          )}
          {isMobile && !suppressSectionTitle && (
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-violet-800">
              Confirm Printing
            </p>
          )}
          {isMobile && suppressSectionTitle && !effectiveSavedId && (
            <p className="mb-3 text-sm font-medium text-gray-900">
              Pick the exact version:
            </p>
          )}

          {variantExplanations.length > 0 && (
            <div className="mb-3 space-y-2">
              {variantExplanations.map((text) => (
                <div
                  key={text.slice(0, 48)}
                  className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950"
                >
                  <p className="font-semibold">Variant note</p>
                  <p className="mt-1">{text}</p>
                </div>
              ))}
            </div>
          )}

          {hasScanDerivedOnly && (
            <div className="mb-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950">
              <p className="font-semibold">Catalog match not found</p>
              <p className="mt-1">
                Review the scan-derived version below.
              </p>
            </div>
          )}

          {compareEnabled && (
            <p className="mb-3 text-xs text-gray-500">
              {useHoverCompare ? (
                <>
                  Hover a version to compare your scan with the catalog reference
                  on the right side of the screen, then{" "}
                  {onConfirmStart ? (
                    <>
                      click <span className="font-medium">Select</span> to confirm
                    </>
                  ) : (
                    <>confirm the printing you want</>
                  )}
                  .
                </>
              ) : (
                <>
                  Use <span className="font-medium">Compare</span> to view your scan
                  next to the catalog reference, then{" "}
                  {onConfirmStart ? (
                    <>
                      click <span className="font-medium">Select</span> to confirm and
                      return to the card front
                    </>
                  ) : (
                    <>confirm the printing you want</>
                  )}
                  .
                </>
              )}
            </p>
          )}

          <div
            className={
              useHoverCompare || isMobile
                ? "space-y-3"
                : "grid gap-3 sm:grid-cols-2"
            }
          >
            {rows.map((row) =>
              renderSuspectRow(row, {
                confirmed: effectiveSavedId === row.suspectId,
                showSelectButton: Boolean(onConfirmStart),
                oneTapConfirm: false,
                inlineCompareClassName: useHoverCompare
                  ? undefined
                  : `col-span-1 ${isMobile ? "" : "sm:col-span-2"}`,
              }),
            )}

            <ManualPrintingEntry
              isMobile={isMobile}
              saving={saving}
              evidence={evidence}
              onSubmit={(entry) => void saveManualEntry(entry)}
            />
          </div>

          {renderDesktopCompareDock()}

          {!isMobile && activeRow && (
            <SuspectDetail
              row={activeRow}
              isConfirmed={savedId === activeRow.suspectId}
            />
          )}

          <div className="mt-3 space-y-2 border-t border-violet-100 pt-3">
            {!isMobile && (
            <>
            <textarea
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
              rows={2}
              placeholder="Notes (optional)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
            {identity.staffSelection?.confirmedAt && (
              <p className="text-xs text-gray-500">
                Last confirmed{" "}
                {new Date(identity.staffSelection.confirmedAt).toLocaleString()}
                {identity.staffSelection.confirmedBy
                  ? ` by ${identity.staffSelection.confirmedBy}`
                  : ""}
              </p>
            )}
            </>
            )}
            {error && <p className="text-xs text-red-600">{error}</p>}
            {!isMobile && (
              <div className="flex flex-wrap gap-2">
                <Button
                  disabled={saving || !activeId}
                  onClick={() => void saveSelection(activeId)}
                >
                  {saving ? "Saving…" : "Confirm this printing"}
                </Button>
                {savedId && (
                  <Button
                    variant="ghost"
                    disabled={saving}
                    onClick={() => void saveSelection(null)}
                  >
                    Clear confirmation
                  </Button>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function ManualPrintingEntry({
  isMobile,
  saving,
  evidence,
  onSubmit,
}: {
  isMobile: boolean;
  saving: boolean;
  evidence?: CardFlowV2EvidenceBundle;
  onSubmit: (entry: {
    name: string;
    setName?: string;
    setCode?: string;
    cardNumber?: string;
    finish?: string;
    language?: string;
  }) => void;
}) {
  const defaults = useMemo(
    () =>
      evidence?.imageEvidence
        ? evidenceToManualEntryDefaults(evidence.imageEvidence)
        : { name: "" },
    [evidence],
  );
  const [open, setOpen] = useState(false);
  const [cardName, setCardName] = useState(defaults.name);
  const [printingSetName, setPrintingSetName] = useState(defaults.setName ?? "");
  const [setCode, setSetCode] = useState(defaults.setCode ?? "");
  const [cardNumber, setCardNumber] = useState(defaults.cardNumber ?? "");
  const [finish, setFinish] = useState(defaults.finish ?? "");
  const [language, setLanguage] = useState(defaults.language ?? "en");

  useEffect(() => {
    setCardName(defaults.name);
    setPrintingSetName(defaults.setName ?? "");
    setSetCode(defaults.setCode ?? "");
    setCardNumber(defaults.cardNumber ?? "");
    setFinish(defaults.finish ?? "");
    setLanguage(defaults.language ?? "en");
  }, [defaults]);

  const canSubmit = cardName.trim().length > 0;

  return (
    <div className="mt-3 rounded-xl border border-dashed border-gray-300 bg-gray-50/80 p-4">
      {isMobile ? (
        <>
          <button
            type="button"
            className="w-full text-left"
            onClick={() => setOpen((v) => !v)}
          >
            <p className="text-sm font-semibold text-gray-900">Manual entry</p>
            <p className="mt-1 text-xs text-gray-600">
              None of these match? Enter the card details yourself.
            </p>
          </button>
          {open && (
            <ManualPrintingFields
              cardName={cardName}
              printingSetName={printingSetName}
              setCode={setCode}
              cardNumber={cardNumber}
              finish={finish}
              language={language}
              onCardNameChange={setCardName}
              onPrintingSetNameChange={setPrintingSetName}
              onSetCodeChange={setSetCode}
              onCardNumberChange={setCardNumber}
              onFinishChange={setFinish}
              onLanguageChange={setLanguage}
            />
          )}
        </>
      ) : (
        <>
          <p className="text-sm font-semibold text-gray-900">Manual entry</p>
          <p className="mt-1 text-xs text-gray-600">
            None of the options match? Enter printing details below.
          </p>
          <ManualPrintingFields
            cardName={cardName}
            printingSetName={printingSetName}
            setCode={setCode}
            cardNumber={cardNumber}
            finish={finish}
            language={language}
            onCardNameChange={setCardName}
            onPrintingSetNameChange={setPrintingSetName}
            onSetCodeChange={setSetCode}
            onCardNumberChange={setCardNumber}
            onFinishChange={setFinish}
            onLanguageChange={setLanguage}
          />
        </>
      )}

      {(open || !isMobile) && (
        <Button
          className={`${isMobile ? "mt-3 min-h-11 w-full" : "mt-3"}`}
          disabled={saving || !canSubmit}
          onClick={() =>
            onSubmit({
              name: cardName.trim(),
              setName: printingSetName.trim() || undefined,
              setCode: setCode.trim() || undefined,
              cardNumber: cardNumber.trim() || undefined,
              finish: finish || undefined,
              language: language.trim() || undefined,
            })
          }
        >
          {saving ? "Saving…" : "Confirm manual printing"}
        </Button>
      )}
    </div>
  );
}

const FINISH_OPTIONS = [
  { value: "", label: "Not specified" },
  { value: "nonfoil", label: "Nonfoil" },
  { value: "foil", label: "Foil" },
  { value: "holofoil", label: "Holofoil" },
  { value: "reverse_holo", label: "Reverse holo" },
];

function ManualPrintingFields({
  cardName,
  printingSetName,
  setCode,
  cardNumber,
  finish,
  language,
  onCardNameChange,
  onPrintingSetNameChange,
  onSetCodeChange,
  onCardNumberChange,
  onFinishChange,
  onLanguageChange,
}: {
  cardName: string;
  printingSetName: string;
  setCode: string;
  cardNumber: string;
  finish: string;
  language: string;
  onCardNameChange: (v: string) => void;
  onPrintingSetNameChange: (v: string) => void;
  onSetCodeChange: (v: string) => void;
  onCardNumberChange: (v: string) => void;
  onFinishChange: (v: string) => void;
  onLanguageChange: (v: string) => void;
}) {
  const fieldClass =
    "mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm";

  return (
    <div className={`grid gap-3 ${"mt-3 sm:grid-cols-2"}`}>
      <label className="block text-xs font-medium text-gray-700 sm:col-span-2">
        Card name *
        <input
          className={fieldClass}
          value={cardName}
          onChange={(e) => onCardNameChange(e.target.value)}
          placeholder="e.g. Ravenous Tyrannosaurus"
        />
      </label>
      <label className="block text-xs font-medium text-gray-700">
        Set name
        <input
          className={fieldClass}
          value={printingSetName}
          onChange={(e) => onPrintingSetNameChange(e.target.value)}
          placeholder="Marvel Universe"
        />
      </label>
      <label className="block text-xs font-medium text-gray-700">
        Set code
        <input
          className={fieldClass}
          value={setCode}
          onChange={(e) => onSetCodeChange(e.target.value)}
          placeholder="MAR"
        />
      </label>
      <label className="block text-xs font-medium text-gray-700">
        Card number
        <input
          className={fieldClass}
          value={cardNumber}
          onChange={(e) => onCardNumberChange(e.target.value)}
          placeholder="93"
        />
      </label>
      <label className="block text-xs font-medium text-gray-700">
        Finish / foil
        <select
          className={fieldClass}
          value={finish}
          onChange={(e) => onFinishChange(e.target.value)}
        >
          {FINISH_OPTIONS.map((opt) => (
            <option key={opt.value || "none"} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-xs font-medium text-gray-700 sm:col-span-2">
        Language
        <input
          className={fieldClass}
          value={language}
          onChange={(e) => onLanguageChange(e.target.value)}
          placeholder="en"
        />
      </label>
    </div>
  );
}

function suspectSubtitle(row: SuspectPickerRow): string {
  const parts = [
    row.setName ?? row.setCode,
    row.collectorNumber,
    row.finish?.replace(/_/g, " "),
  ].filter(Boolean);
  return parts.join(" · ");
}

function SuspectOption({
  row,
  selected,
  confirmed,
  isMobile,
  saving,
  compareEnabled = false,
  compareOpen = false,
  hoverCompareMode = false,
  hoverActive = false,
  onHoverCompare,
  onSelect,
  onCompare,
  onConfirm,
  showSelectButton = false,
  oneTapConfirm = false,
}: {
  row: SuspectPickerRow;
  selected: boolean;
  confirmed: boolean;
  isMobile: boolean;
  saving: boolean;
  compareEnabled?: boolean;
  compareOpen?: boolean;
  hoverCompareMode?: boolean;
  hoverActive?: boolean;
  onHoverCompare?: () => void;
  onSelect: () => void;
  onCompare: () => void;
  onConfirm: () => void;
  /** Flip-card clerk flow — explicit Select confirms and returns to card front. */
  showSelectButton?: boolean;
  /** Mobile clerk flow — tap the card once to confirm (no second button). */
  oneTapConfirm?: boolean;
}) {
  const snap = row.marketSnapshot;
  const shadow = snap?.valueMedian;
  const showConfirmButton = showSelectButton || isMobile;
  const showCompareButton = compareEnabled && !hoverCompareMode;
  const showActionRow =
    !confirmed && !oneTapConfirm && (showCompareButton || showConfirmButton);

  return (
    <div
      className={`rounded-xl border p-4 text-left text-sm transition-colors ${
        confirmed
          ? "border-emerald-400 bg-emerald-50/80 ring-1 ring-emerald-300"
          : hoverActive
            ? "border-violet-500 bg-violet-50 ring-2 ring-violet-400"
            : selected
              ? "border-violet-500 bg-violet-50 ring-1 ring-violet-300"
              : "border-gray-200 bg-white"
      }`}
      onMouseEnter={hoverCompareMode ? onHoverCompare : undefined}
    >
      <button
        type="button"
        className="w-full text-left"
        onClick={() => {
          if (oneTapConfirm && !confirmed && !saving) {
            onConfirm();
            return;
          }
          onSelect();
        }}
      >
        <div className="flex items-start gap-3">
          {!compareEnabled && !hoverCompareMode && row.hasReferenceImage && row.referenceImageUrl && (
            <div className="shrink-0 overflow-hidden rounded-md border border-gray-200 bg-gray-50">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={row.referenceImageUrl}
                alt=""
                className="h-16 w-11 object-contain"
              />
            </div>
          )}
          <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="font-semibold text-gray-900">
            {confirmed ? "✓ " : ""}
            {row.label.split(" · ")[0] ?? row.label}
          </p>
          {confirmed && (
            <span className="shrink-0 rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-bold uppercase text-white">
              Confirmed
            </span>
          )}
        </div>
        <p className="mt-1 text-xs text-gray-600">{suspectSubtitle(row) || row.label}</p>
        {row.language && (
          <p className="mt-1 text-xs text-gray-500">Language: {row.language}</p>
        )}
        {row.scanDerivedBadge && (
          <p className="mt-2 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-900">
            {row.scanDerivedBadge}
          </p>
        )}
        {row.pricingStatusLabel && (
          <p className="mt-1 text-xs font-medium text-amber-800">
            Price: {row.pricingStatusLabel}
          </p>
        )}
        <p className="mt-2 text-xs text-gray-700">
          Confidence: {(row.matchScore * 100).toFixed(0)}%
        </p>
        {snap && shadow != null && (
          <p className="mt-1 text-sm font-medium text-violet-900">
            V2 preview: ${shadow.toFixed(2)}
          </p>
        )}
        {row.reasoning && isMobile && (
          <p className="mt-2 text-xs text-gray-600">
            Why: {row.reasoning}
          </p>
        )}
        {!isMobile && snap?.acceptedComps[0]?.comp.source && (
          <p className="mt-1 text-xs text-gray-600">
            Source: {snap.acceptedComps[0].comp.source.replace(/_/g, " ")}
          </p>
        )}
          </div>
        </div>
      </button>

      {showActionRow && (
        <div
          className={`mt-3 flex gap-2 ${
            showCompareButton && showConfirmButton ? "flex-row" : "flex-col"
          }`}
        >
          {showCompareButton && (
            <Button
              variant={compareOpen ? "secondary" : "ghost"}
              className="min-h-11 flex-1"
              disabled={saving}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onCompare();
              }}
            >
              {compareOpen ? "Hide" : "Compare"}
            </Button>
          )}
          {showConfirmButton && (
            <Button
              className="min-h-11 flex-1"
              disabled={saving}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onConfirm();
              }}
            >
              {saving && selected
                ? "Saving…"
                : showSelectButton
                  ? "Select"
                  : row.scanDerived
                    ? "Confirm this version"
                    : "Confirm this printing"}
            </Button>
          )}
        </div>
      )}

      {confirmed && showCompareButton && (
        <Button
          variant={compareOpen ? "secondary" : "ghost"}
          className="mt-3 min-h-11 w-full"
          disabled={saving}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onCompare();
          }}
        >
          {compareOpen ? "Hide compare" : "Compare"}
        </Button>
      )}

      {confirmed && showSelectButton && (
        <p className="mt-2 text-center text-xs font-medium text-emerald-800">
          Selected
        </p>
      )}

      {isMobile && confirmed && !showSelectButton && (
        <p className="mt-2 text-center text-xs font-medium text-emerald-800">
          This printing is confirmed
        </p>
      )}
    </div>
  );
}

function SuspectDetail({
  row,
  isConfirmed,
}: {
  row: SuspectPickerRow;
  isConfirmed: boolean;
}) {
  const snap = row.marketSnapshot;
  return (
    <div className="mt-3 rounded-lg border border-violet-100 bg-violet-50/40 p-3 text-xs">
      <p className="font-semibold text-violet-900">
        {isConfirmed ? "Confirmed printing" : "Preview"} — {row.label}
      </p>
      {row.reasoning && <p className="mt-2 text-gray-600">{row.reasoning}</p>}
      {snap && snap.valueMedian != null && (
        <p className="mt-2">
          Shadow median: ${snap.valueMedian.toFixed(2)}
        </p>
      )}
    </div>
  );
}
