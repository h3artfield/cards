"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { CommanderBracket } from "@/lib/bracket-policy/commander-bracket-snapshot-v1";
import { bracketLabel } from "@/lib/deck-synthesis/professor-brew-bracket-v4-v1";
import { ProfessorDeckBracketPanel } from "./ProfessorDeckBracketPanel";
import { ProfessorDeckSwapPanel } from "./ProfessorDeckSwapPanel";
import { scryfallNamedImageUrl } from "@/lib/deck-synthesis/professor-brew-scryfall-images-v1";
import type { ProfessorDeckInventoryEntryV43 } from "@/lib/deck-synthesis/professor-brew-inventory-match-v4-3-v1";
import { computeSolDirectedDeckGradeV111, formatProfessorVerdictForCustomer, parseHeadProfessorGradeText, headProfessorClassificationHint, headProfessorDisplayLetter } from "@/lib/deck-synthesis/professor-sol-directed-deck-grade-v1-1-1";
import {
  formatThesisForCustomer,
  resolveCustomerGamePlanV111,
} from "@/lib/deck-synthesis/professor-sol-directed-deck-display-v1-1-1";
import type { SolDirectedHeadProfessorWholeDeckVerdictV111 } from "@/lib/deck-synthesis/professor-sol-directed-head-professor-v1-1-1";
import type { SolDirectedConstructedDeckV11 } from "@/lib/deck-synthesis/professor-sol-directed-types-v1-1";
import type { SolDirectedDeckEnrichmentV111 } from "@/lib/deck-synthesis/professor-sol-directed-deck-enrichment-v1-1-1";
import {
  groupSolDirectedDeckForDisplay,
  formatSolDirectedDeckListText,
  solDirectedDeckListDownloadFilename,
  SOL_DIRECTED_DECK_DISPLAY_SECTION_LABELS,
  type SolDirectedDeckDisplayCategory,
  type SolDirectedDeckDisplayCard,
} from "@/lib/deck-synthesis/professor-sol-directed-deck-display-v1-1-1";
import { downloadSolDirectedDeckReportPdf } from "@/lib/deck-synthesis/professor-sol-directed-deck-report-pdf-v1-1-1";
import { tcgPriceForCardName } from "@/lib/deck-synthesis/professor-brew-scryfall-prices-v1";
import type { CosV1Score } from "@/lib/commander-optimization-score/v1/types";
import { ordinalPercentile } from "@/lib/commander-optimization-score/v1/player-report";
import { howCosWorksPath } from "@/lib/commander-optimization-score/v1/public-path";
import { CosV1PlayerReportView } from "./CosV1PlayerReportView";

type ConstructedDeck = {
  commander?: { name: string; oracleId?: string; typeLine?: string };
  lands?: Array<{ name: string; copies: number; oracleId?: string }>;
  nonlands?: Array<{
    name: string;
    oracleId?: string;
    typeLine?: string;
    primaryArchitectRequirement?: string;
    primaryRole?: string;
    whyInThisDeck?: string;
  }>;
  primaryWinPaths?: string[];
  secondaryWinPaths?: string[];
  expectedPlayPattern?: string;
};

type UserInputs = {
  bracket: number;
  playstyle: string;
  commanderStyle: string;
  deckPreferences?: string;
};

type ValidationSummary = {
  pass: boolean;
  violations: string[];
  architectRequirementRealization?: {
    counts: Record<string, number>;
    expected: Record<string, number>;
    pass: boolean;
    mismatches: string[];
  };
  legacyHeuristicAudit?: {
    ramp: number;
    draw: number;
    interaction: number;
    protection: number;
    tutorsAccess: number;
    averageMv: number;
    note: string;
  };
};

type RetrievalSummary = {
  uniqueCandidateCount: number;
  requirementPoolCounts: Record<string, number>;
  supplyGatePass: boolean;
};

type BuildTelemetry = {
  modelCallCount: number;
  architectTokens: number | null;
  constructorTokens: number | null;
  criticTokens: number | null;
  headProfessorTokens: number | null;
  nonlandCount: number | null;
  landCount: number | null;
  candidateUniqueCount: number | null;
};

type CriticVerdict = {
  summary: string;
  appliedSwaps: Array<{ cut: string; add: string; reason: string }>;
};

const COLUMN_GROUPS: SolDirectedDeckDisplayCategory[][] = [
  ["commander", "planeswalker", "creature"],
  ["instant", "sorcery", "artifact", "enchantment"],
  ["land"],
];

const PREVIEW_W = 220;
const PREVIEW_H = 308;

function downloadTextFile(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function CardNameHoverPreview({
  name,
  imageUrl,
  inStock,
}: {
  name: string;
  imageUrl?: string;
  inStock?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [failedPrimary, setFailedPrimary] = useState(false);
  const [failedFallback, setFailedFallback] = useState(false);

  const primaryUrl = imageUrl ?? scryfallNamedImageUrl(name);
  const fallbackUrl = scryfallNamedImageUrl(name, true);
  const previewUrl = failedPrimary ? fallbackUrl : primaryUrl;
  const showImage = !failedFallback;

  useEffect(() => {
    setFailedPrimary(false);
    setFailedFallback(false);
  }, [name, imageUrl]);

  const updatePos = useCallback((clientX: number, clientY: number) => {
    const pad = 12;
    let x = clientX + 18;
    let y = clientY - PREVIEW_H / 2;
    if (typeof window !== "undefined") {
      if (x + PREVIEW_W + pad > window.innerWidth) x = clientX - PREVIEW_W - 18;
      if (y < pad) y = pad;
      if (y + PREVIEW_H + pad > window.innerHeight) y = window.innerHeight - PREVIEW_H - pad;
    }
    setPos({ x, y });
  }, []);

  const preview =
    visible && typeof document !== "undefined"
      ? createPortal(
          <div
            className="pointer-events-none fixed z-[100] overflow-hidden border border-[var(--mtg-gold-dim)] bg-[var(--mtg-stone-deep)] shadow-[0_0_20px_rgba(201,162,39,0.2)]"
            style={{ left: pos.x, top: pos.y, width: PREVIEW_W, height: PREVIEW_H }}
          >
            {showImage ? (
              <img
                src={previewUrl}
                alt={name}
                className="h-full w-full object-cover"
                loading="lazy"
                onError={() => {
                  if (!failedPrimary) setFailedPrimary(true);
                  else setFailedFallback(true);
                }}
              />
            ) : (
              <div className="flex h-full items-center justify-center bg-[var(--mtg-stone-deep)] p-3 text-center text-xs text-[var(--mtg-parchment-muted)]">
                {name}
              </div>
            )}
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <button
        type="button"
        className={`professor-mtg-card-name min-w-0 flex-1 text-left underline decoration-transparent transition ${
          inStock ? "professor-mtg-card-name--in-stock" : ""
        }`}
        title={name}
        onMouseEnter={(e) => {
          setVisible(true);
          updatePos(e.clientX, e.clientY);
        }}
        onMouseMove={(e) => updatePos(e.clientX, e.clientY)}
        onMouseLeave={() => setVisible(false)}
        onFocus={(e) => {
          setVisible(true);
          updatePos(e.currentTarget.getBoundingClientRect().right, e.currentTarget.getBoundingClientRect().top);
        }}
        onBlur={() => setVisible(false)}
      >
        {name}
      </button>
      {preview}
    </>
  );
}

function DeckCardRow({
  card,
  imageUrl,
  inventory,
  tcgPrice,
}: {
  card: SolDirectedDeckDisplayCard;
  imageUrl?: string;
  inventory?: ProfessorDeckInventoryEntryV43;
  tcgPrice?: number | null;
}) {
  const inStock = Boolean(inventory && inventory.quantity > 0);
  const shopPrice = inStock && inventory?.listPrice != null && inventory.listPrice > 0 ? inventory.listPrice : null;
  return (
    <div className="professor-mtg-card-row group flex items-center gap-2 py-1 sm:gap-2.5 sm:py-1.5 last:border-b-0">
      <span className="professor-mtg-muted w-4 shrink-0 text-right text-[11px] tabular-nums sm:w-5">{card.copies}</span>
      <CardNameHoverPreview name={card.name} imageUrl={imageUrl} inStock={inStock} />
      {shopPrice != null ? (
        <span className="professor-mtg-card-price shrink-0">${shopPrice.toFixed(2)}</span>
      ) : tcgPrice != null && tcgPrice > 0 ? (
        <span className="professor-mtg-card-price professor-mtg-card-price--tcg shrink-0" title="TCGPlayer market">
          TCG ${tcgPrice.toFixed(2)}
        </span>
      ) : null}
    </div>
  );
}

function DeckTypeSection({
  category,
  cards,
  imageUrls,
  inventoryByName,
  tcgPricesByName,
}: {
  category: SolDirectedDeckDisplayCategory;
  cards: SolDirectedDeckDisplayCard[];
  imageUrls: Record<string, string>;
  inventoryByName: Record<string, ProfessorDeckInventoryEntryV43>;
  tcgPricesByName: Record<string, number>;
}) {
  if (!cards.length) return null;
  const cardCount = cards.reduce((sum, card) => sum + card.copies, 0);
  return (
    <section className="mb-6 last:mb-0">
      <div className="mb-2 flex items-baseline justify-between border-b border-[var(--mtg-stone-border)] pb-2">
        <h3 className="professor-mtg-label text-[13px]">{SOL_DIRECTED_DECK_DISPLAY_SECTION_LABELS[category]}</h3>
        <span className="professor-mtg-muted text-xs tabular-nums">{cardCount}</span>
      </div>
      <div>
        {cards.map((card) => (
          <DeckCardRow
            key={`${category}-${card.name}-${card.copies}`}
            card={card}
            imageUrl={imageUrls[card.name]}
            inventory={inventoryByName[card.name]}
            tcgPrice={tcgPriceForCardName(tcgPricesByName, card.name)}
          />
        ))}
      </div>
    </section>
  );
}

function CategoryScoreRow({ label, letter, score }: { label: string; letter: string; score: number }) {
  const width = `${Math.max(8, Math.min(100, score))}%`;
  return (
    <div className="professor-mtg-stat">
      <div className="flex items-baseline justify-between gap-2">
        <p className="professor-mtg-label text-[10px]">{label}</p>
        <p className="professor-mtg-body text-sm font-semibold tabular-nums">
          {letter} <span className="opacity-70">{score}</span>
        </p>
      </div>
      <div className="professor-mtg-bar mt-2">
        <div className="professor-mtg-bar-fill" style={{ width }} />
      </div>
    </div>
  );
}

function AssessmentBlock({ label, text }: { label: string; text: string }) {
  if (!text.trim()) return null;
  return (
    <div>
      <p className="professor-mtg-label">{label}</p>
      <p className="professor-mtg-body mt-2 text-sm leading-relaxed">{text}</p>
    </div>
  );
}

function ScorePlaystyleModal({
  open,
  onClose,
  commanderName,
  userInputs,
  headProfessor,
  thesis,
  gamePlan,
  winPaths,
  validation,
  telemetry,
  validationPass,
  professorRepairApplied,
  cos,
  storeSlug,
}: {
  open: boolean;
  onClose: () => void;
  commanderName: string;
  userInputs: UserInputs;
  headProfessor: SolDirectedHeadProfessorWholeDeckVerdictV111 | null;
  thesis: string;
  gamePlan: { earlyGame?: string[]; midGame?: string[]; lateGame?: string[] } | undefined;
  winPaths: { primary?: string[]; secondary?: string[] };
  validation: ValidationSummary | null;
  telemetry: BuildTelemetry | null;
  validationPass: boolean;
  professorRepairApplied?: boolean;
  cos: CosV1Score | null;
  storeSlug?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const deckGrade = useMemo(() => {
    if (!headProfessor) return null;
    return computeSolDirectedDeckGradeV111({
      headProfessor,
      bracket: userInputs.bracket,
      playstyle: userInputs.playstyle,
      thesis,
      primaryWinPaths: winPaths.primary,
      audit: validation?.legacyHeuristicAudit ?? null,
      landCount: telemetry?.landCount ?? null,
      validationPass,
    });
  }, [headProfessor, userInputs.bracket, userInputs.playstyle, thesis, winPaths.primary, validation, telemetry, validationPass]);

  const gradeParts = headProfessor ? parseHeadProfessorGradeText(headProfessor.grade) : null;
  const displayLetter =
    (headProfessor ? headProfessorDisplayLetter(headProfessor.grade) : null) ??
    deckGrade?.overallLetter ??
    "—";
  const showRequiredChanges =
    headProfessor != null &&
    headProfessor.requiredChanges.length > 0 &&
    !professorRepairApplied;

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <button
        type="button"
        className="absolute inset-0 bg-black/75 backdrop-blur-sm"
        aria-label="Close"
        onClick={onClose}
      />
      <div className="professor-mtg-page professor-mtg-modal professor-mtg-chamber__inner relative z-10 max-h-[85vh] w-full max-w-4xl overflow-y-auto p-6 sm:p-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="professor-mtg-label">Score & playstyle</p>
            <h2 className="professor-mtg-title mt-1 text-xl">{commanderName}</h2>
            <a
              href={howCosWorksPath(storeSlug)}
              target="_blank"
              rel="noreferrer"
              className="professor-mtg-link mt-2 inline-block"
            >
              How COS works
            </a>
          </div>
          <button
            type="button"
            className="professor-mtg-body text-2xl leading-none hover:text-[var(--mtg-gold)]"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {deckGrade && headProfessor ? (
          <div className="mt-6 border-b border-[var(--mtg-stone-border)] pb-6">
            <div className="flex flex-wrap items-end gap-8">
              <div>
                <p className="professor-mtg-label">As built</p>
                <p className="professor-mtg-stat-value text-5xl font-bold">{displayLetter}</p>
                {cos?.competitiveStrength != null ? (
                  <p className="professor-mtg-body text-sm tabular-nums">
                    Competitive Strength {Math.round(cos.competitiveStrength)} / 100
                    <span className="ml-2 opacity-70">Full scoring coverage</span>
                  </p>
                ) : cos?.commanderBaselineStatus === "COMMANDER_BASELINE_UNCALIBRATED" ? (
                  <p className="professor-mtg-body text-sm">
                    Competitive Strength uncalibrated — this commander has no baseline yet
                  </p>
                ) : cos?.failure ? (
                  <p className="professor-mtg-body text-sm">
                    {cos.failure.unresolvedNames?.length
                      ? `Could not resolve: ${cos.failure.unresolvedNames.slice(0, 6).join(", ")}`
                      : cos.failure.message}
                  </p>
                ) : deckGrade ? (
                  <p className="professor-mtg-body text-sm">Scoring Competitive Strength…</p>
                ) : null}
                {cos?.buildOptimization != null ? (
                  <p className="professor-mtg-body text-sm tabular-nums">
                    Build Optimization {Math.round(cos.buildOptimization)}th percentile
                    {cos.buildOptimizationReferenceDepth ? (
                      <span className="ml-2 opacity-70">
                        {cos.buildOptimizationReferenceDepth === "STRONG"
                          ? `${cos.commanderReferenceCount} same-commander reference decks`
                          : cos.buildOptimizationReferenceDepth === "NEW_COMMANDER"
                            ? "New commander · broader COS reference"
                            : `Limited commander history · ${cos.commanderReferenceCount} lists`}
                      </span>
                    ) : null}
                  </p>
                ) : null}
                {cos?.playerReport ? (
                  <div className="mt-3 max-w-xl space-y-2">
                    <p className="professor-mtg-muted text-xs leading-relaxed">
                      {cos.playerReport.competitiveStrengthBlurb}
                    </p>
                    <p className="professor-mtg-muted text-xs leading-relaxed">
                      {cos.playerReport.buildOptimizationBlurb}
                    </p>
                  </div>
                ) : null}
              </div>
              {gradeParts?.potentialRange ? (
                <div>
                  <p className="professor-mtg-label">After suggested fixes</p>
                  <p className="professor-mtg-stat-value text-3xl font-bold">~{gradeParts.potentialRange}</p>
                </div>
              ) : null}
              <div>
                <p className="professor-mtg-label">Classification</p>
                <p className="professor-mtg-body text-sm tracking-wide">
                  {headProfessor.classification.replace(/_/g, " ")}
                </p>
              </div>
              <div>
                <p className="professor-mtg-label">Requested bracket</p>
                <p className="professor-mtg-body text-sm">
                  {userInputs.bracket} · {bracketLabel(userInputs.bracket as CommanderBracket)}
                </p>
              </div>
            </div>
            <p className="professor-mtg-body mt-4 text-sm leading-relaxed">
              {headProfessorClassificationHint(headProfessor.classification, { professorRepairApplied })}
            </p>
            {showRequiredChanges ? (
              <p className="professor-mtg-muted mt-2 text-xs">
                {headProfessor.requiredChanges.length} required change
                {headProfessor.requiredChanges.length === 1 ? "" : "s"} — see below.
              </p>
            ) : null}
          </div>
        ) : null}

        {cos?.playerReport ? (
          <CosV1PlayerReportView report={cos.playerReport} storeSlug={storeSlug} />
        ) : cos?.profile.length ? (
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {cos.profile.map((axis) => (
              <CategoryScoreRow
                key={axis.id}
                label={`${axis.label}${axis.role === "descriptive_only" ? " · descriptive" : ""}`}
                letter={axis.mapping === "within_commander" ? "cmd" : "all"}
                score={Math.round(axis.percentile)}
              />
            ))}
          </div>
        ) : cos?.failure ? (
          <p className="professor-mtg-body mt-6 text-sm">
            Competitive Strength could not be scored for this list.
          </p>
        ) : deckGrade ? (
          <p className="professor-mtg-body mt-6 text-sm">Scoring Competitive Strength…</p>
        ) : null}

        <div className="mt-6 space-y-5 border-t border-[var(--mtg-stone-border)] pt-6">
          <p className="professor-mtg-label">Professor explanation</p>
          {thesis ? (
            <div>
              <p className="professor-mtg-label">Strategy thesis</p>
              <p className="professor-mtg-body mt-2 text-sm leading-relaxed">{thesis}</p>
            </div>
          ) : null}
          {headProfessor?.reasoningSummary ? (
            <div>
              <p className="professor-mtg-label">Professor review</p>
              <p className="professor-mtg-body mt-2 text-sm leading-relaxed">{headProfessor.reasoningSummary}</p>
            </div>
          ) : null}
          {gamePlan?.earlyGame?.length || gamePlan?.midGame?.length || gamePlan?.lateGame?.length ? (
            <div>
              <p className="professor-mtg-label">How the deck plays</p>
              <div className="mt-3 space-y-4">
                {gamePlan?.earlyGame?.length ? (
                  <div>
                    <p className="professor-mtg-muted text-xs uppercase tracking-wide">Early game</p>
                    <ul className="professor-mtg-body mt-2 list-disc space-y-1 pl-5 text-sm">
                      {gamePlan.earlyGame.map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {gamePlan?.midGame?.length ? (
                  <div>
                    <p className="professor-mtg-muted text-xs uppercase tracking-wide">Mid game</p>
                    <ul className="professor-mtg-body mt-2 list-disc space-y-1 pl-5 text-sm">
                      {gamePlan.midGame.map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {gamePlan?.lateGame?.length ? (
                  <div>
                    <p className="professor-mtg-muted text-xs uppercase tracking-wide">Late game</p>
                    <ul className="professor-mtg-body mt-2 list-disc space-y-1 pl-5 text-sm">
                      {gamePlan.lateGame.map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
          {winPaths.primary?.length ? (
            <div>
              <p className="professor-mtg-label">Primary win paths</p>
              <ul className="professor-mtg-body mt-2 list-disc space-y-1 pl-5 text-sm">
                {winPaths.primary.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {headProfessor ? (
            <>
              <AssessmentBlock label="Bracket fit" text={headProfessor.bracketFit} />
              <AssessmentBlock label="Strategy coherence" text={headProfessor.strategyCoherence} />
              <AssessmentBlock label="Mana base" text={headProfessor.manaAssessment} />
              <AssessmentBlock label="Early / mid / late game" text={headProfessor.earlyMidLateGameAssessment} />
              <AssessmentBlock label="Win conditions" text={headProfessor.winConditionAssessment} />
              <AssessmentBlock label="Interaction" text={headProfessor.interactionAssessment} />
              <AssessmentBlock label="Resilience" text={headProfessor.resilienceAssessment} />
              {headProfessor.selfBuildQuestionAnswer ? (
                <AssessmentBlock
                  label="Professor verdict"
                  text={formatProfessorVerdictForCustomer(headProfessor.selfBuildQuestionAnswer)}
                />
              ) : null}
              {showRequiredChanges ? (
                <div>
                  <p className="professor-mtg-label text-red-300">Required changes</p>
                  <ul className="professor-mtg-body mt-2 list-disc space-y-1 pl-5 text-sm">
                    {headProfessor.requiredChanges.map((c) => (
                      <li key={c}>{c}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {headProfessor.optionalChanges.length > 0 ? (
                <div>
                  <p className="professor-mtg-label">Optional tweaks</p>
                  <ul className="professor-mtg-body mt-2 list-disc space-y-1 pl-5 text-sm">
                    {headProfessor.optionalChanges.map((c) => (
                      <li key={c}>{c}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function ProfessorSolDirectedDeckListPanel({
  slug,
  commander,
  constructedDeck,
  userInputs,
  architectPlan,
  critic,
  headProfessor,
  validation,
  retrievalSummary,
  telemetry,
  validationPass,
  deckEnrichment,
  professorRepairApplied,
}: {
  slug: string;
  commander: { name: string; oracleId: string; colorIdentity: string[] };
  constructedDeck: Record<string, unknown> | null;
  userInputs: UserInputs;
  architectPlan: Record<string, unknown> | null;
  critic: CriticVerdict | null;
  headProfessor: SolDirectedHeadProfessorWholeDeckVerdictV111 | null;
  validation: ValidationSummary | null;
  retrievalSummary: RetrievalSummary | null;
  telemetry: BuildTelemetry | null;
  validationPass: boolean;
  deckEnrichment?: SolDirectedDeckEnrichmentV111 | null;
  professorRepairApplied?: boolean;
}) {
  const deck = constructedDeck as ConstructedDeck | null;
  const cosPayload = useMemo(() => {
    const commanderOracleIds = [commander.oracleId, deck?.commander?.oracleId].filter(
      (id, index, all): id is string => Boolean(id) && all.indexOf(id) === index,
    );
    const mainboard = [
      ...(deck?.nonlands ?? []).map((card) => ({
        oracleId: card.oracleId,
        name: card.name,
        quantity: 1,
      })),
      ...(deck?.lands ?? []).map((land) => ({
        oracleId: land.oracleId,
        name: land.name,
        quantity: land.copies ?? 1,
      })),
    ];
    return { commanderOracleIds, mainboard };
  }, [commander.oracleId, deck]);
  const bracketCards = useMemo(
    () => [
      ...(deck?.nonlands ?? []).map((card) => ({ name: card.name, copies: 1 })),
      ...(deck?.lands ?? []).map((land) => ({ name: land.name, copies: land.copies ?? 1 })),
    ],
    [deck],
  );
  const [scoreOpen, setScoreOpen] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [cos, setCos] = useState<CosV1Score | null>(null);
  useEffect(() => {
    if (!cosPayload.commanderOracleIds.length || !cosPayload.mainboard.length) return;
    let cancelled = false;
    void fetch("/api/commander-optimization-score", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        commanderOracleIds: cosPayload.commanderOracleIds,
        mainboard: cosPayload.mainboard,
      }),
    })
      .then(async (res) => {
        const data = (await res.json().catch(() => null)) as CosV1Score | null;
        return data;
      })
      .then((data: CosV1Score | null) => {
        if (!cancelled) setCos(data);
      })
      .catch(() => {
        if (!cancelled) setCos(null);
      });
    return () => {
      cancelled = true;
    };
  }, [cosPayload]);
  const [imageUrls, setImageUrls] = useState<Record<string, string>>(deckEnrichment?.imageUrls ?? {});
  const [inventoryByName, setInventoryByName] = useState<Record<string, ProfessorDeckInventoryEntryV43>>(
    deckEnrichment?.inventoryByName ?? {},
  );
  const [tcgPricesByName, setTcgPricesByName] = useState<Record<string, number>>(
    deckEnrichment?.tcgPricesByName ?? {},
  );
  const tcgRequestedNames = useRef(new Set<string>());
  const tcgRequestedDeckKey = useRef("");

  const gamePlan = useMemo(() => {
    if (!deck?.commander?.name) return undefined;
    const resolved = resolveCustomerGamePlanV111({
      architectGamePlan: architectPlan?.gamePlan as
        | { earlyGame?: string[]; midGame?: string[]; lateGame?: string[] }
        | undefined,
      expectedPlayPattern: deck.expectedPlayPattern,
      deck: {
        commander: {
          name: deck.commander.name,
          oracleId: deck.commander.oracleId ?? commander.oracleId,
          colorIdentity: commander.colorIdentity,
          manaValue: null,
          oracleText: "",
          semanticFunctions: [],
          mechanics: [],
          resourcesProduced: [],
          resourcesConsumed: [],
          triggeredEvents: [],
          zoneRelationships: [],
          exploitOpportunities: [],
          provenance: [],
        },
        landCount: deck.lands?.reduce((sum, land) => sum + (land.copies ?? 1), 0) ?? 0,
        lands: deck.lands ?? [],
        nonlands: (deck.nonlands ?? []).map((card) => ({
          oracleId: card.oracleId ?? "",
          name: card.name,
          typeLine: card.typeLine ?? "",
          primaryArchitectRequirement: card.primaryArchitectRequirement ?? card.primaryRole ?? "flex",
          primaryRole: card.primaryRole ?? "",
          secondaryRoles: [],
          packageMembership: [],
          whyInThisDeck: card.whyInThisDeck ?? "",
          structuralNecessity: "FLEX" as const,
        })),
        primaryWinPaths: deck.primaryWinPaths ?? [],
        secondaryWinPaths: deck.secondaryWinPaths ?? [],
        structuralNecessities: [],
        replaceableFlex: [],
        expectedPlayPattern: deck.expectedPlayPattern ?? "",
      } satisfies SolDirectedConstructedDeckV11,
      deckPreferences: userInputs.deckPreferences,
      professorRepairApplied,
    });
    if (!resolved) return undefined;
    return {
      earlyGame: resolved.earlyGame,
      midGame: resolved.midGame,
      lateGame: resolved.lateGame,
    };
  }, [architectPlan?.gamePlan, commander.colorIdentity, deck, professorRepairApplied, userInputs.deckPreferences]);

  const thesis = useMemo(() => {
    if (!architectPlan) return "";
    const raw = String(architectPlan.strategicThesis ?? architectPlan.deckThesis ?? "");
    return formatThesisForCustomer({
      thesis: raw,
      deckPreferences: userInputs.deckPreferences,
      commanderColorIdentity: commander.colorIdentity,
    });
  }, [architectPlan, commander.colorIdentity, userInputs.deckPreferences]);

  const grouped = useMemo(() => {
    if (!deck?.commander?.name) return null;
    return groupSolDirectedDeckForDisplay({
      commander: {
        name: deck.commander.name,
        oracleId: deck.commander.oracleId,
        typeLine: deck.commander.typeLine,
      },
      constructedDeck: {
        nonlands: deck.nonlands ?? [],
        lands: deck.lands ?? [],
      },
    });
  }, [deck]);

  const allCardNames = useMemo(() => {
    if (!grouped) return [];
    return Object.values(grouped).flatMap((cards) => cards.map((card) => card.name));
  }, [grouped]);

  const instantImageUrls = useMemo(() => {
    const urls: Record<string, string> = { ...deckEnrichment?.imageUrls };
    for (const name of allCardNames) {
      if (!urls[name]) urls[name] = scryfallNamedImageUrl(name);
    }
    return urls;
  }, [allCardNames, deckEnrichment?.imageUrls]);

  const mergedImageUrls = useMemo(
    () => ({ ...instantImageUrls, ...imageUrls }),
    [instantImageUrls, imageUrls],
  );

  useEffect(() => {
    if (deckEnrichment?.imageUrls) setImageUrls(deckEnrichment.imageUrls);
    if (deckEnrichment?.inventoryByName) setInventoryByName(deckEnrichment.inventoryByName);
    if (deckEnrichment?.tcgPricesByName) setTcgPricesByName(deckEnrichment.tcgPricesByName);
  }, [deckEnrichment]);

  useEffect(() => {
    if (!slug || allCardNames.length === 0 || deckEnrichment != null) return;

    let cancelled = false;

    void (async () => {
      try {
        const [imagesRes, inventoryRes, pricesRes] = await Promise.all([
          fetch(`/api/store/${slug}/professor/card-images`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ cardNames: allCardNames }),
          }),
          fetch(`/api/store/${slug}/professor/brew/inventory-match`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ cardNames: allCardNames }),
          }),
          fetch(`/api/store/${slug}/professor/card-prices`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ cardNames: allCardNames }),
          }),
        ]);

        if (cancelled) return;

        if (imagesRes.ok) {
          const imagesData = (await imagesRes.json()) as { imageUrls?: Record<string, string> };
          if (imagesData.imageUrls) {
            setImageUrls((prev) => ({ ...prev, ...imagesData.imageUrls }));
          }
        }

        if (inventoryRes.ok) {
          const inventoryData = (await inventoryRes.json()) as {
            inventoryByName?: Record<string, ProfessorDeckInventoryEntryV43>;
          };
          if (inventoryData.inventoryByName) setInventoryByName(inventoryData.inventoryByName);
        }

        if (pricesRes.ok) {
          const pricesData = (await pricesRes.json()) as { tcgPricesByName?: Record<string, number> };
          if (pricesData.tcgPricesByName) {
            setTcgPricesByName((prev) => ({ ...prev, ...pricesData.tcgPricesByName }));
          }
        }
      } catch {
        /* hover previews fall back to Scryfall redirect URLs */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [slug, allCardNames, deckEnrichment]);

  useEffect(() => {
    if (!slug || allCardNames.length === 0) return;
    const deckKey = allCardNames.join("\u0001");
    if (tcgRequestedDeckKey.current !== deckKey) {
      tcgRequestedDeckKey.current = deckKey;
      tcgRequestedNames.current = new Set(
        allCardNames.filter((name) => tcgPriceForCardName(tcgPricesByName, name) != null),
      );
    }
    const missing = allCardNames.filter((name) => {
      if (tcgRequestedNames.current.has(name)) return false;
      return tcgPriceForCardName(tcgPricesByName, name) == null;
    });
    if (missing.length === 0) return;
    missing.forEach((name) => tcgRequestedNames.current.add(name));
    let cancelled = false;
    void fetch(`/api/store/${slug}/professor/card-prices`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cardNames: missing }),
    })
      .then(async (res) => {
        if (!res.ok) return null;
        return (await res.json()) as { tcgPricesByName?: Record<string, number> };
      })
      .then((data) => {
        if (cancelled || !data?.tcgPricesByName) return;
        setTcgPricesByName((prev) => ({ ...prev, ...data.tcgPricesByName }));
      })
      .catch(() => {
        /* leave unpriced */
      });
    return () => {
      cancelled = true;
    };
  }, [slug, allCardNames, tcgPricesByName]);

  const totalCards = useMemo(() => {
    if (!grouped) return 0;
    return Object.values(grouped).reduce(
      (sum, cards) => sum + cards.reduce((inner, card) => inner + card.copies, 0),
      0,
    );
  }, [grouped]);

  if (!deck || !grouped) return null;

  const inStockCount = Object.keys(inventoryByName).length;

  return (
    <>
      <div className="professor-mtg-chamber mb-8">
        <div className="professor-mtg-chamber__inner professor-mtg-chamber__inner--wide relative overflow-hidden p-0">
        {/* Deck header bar */}
        <div className="professor-mtg-panel-header px-5 py-4 sm:px-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <h1 className="professor-mtg-title text-2xl leading-tight sm:text-3xl">{commander.name}</h1>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className={`professor-mtg-tag shrink-0 ${validationPass ? "professor-mtg-tag--ok" : ""}`}>
                  {validationPass ? "Commander OK" : "Review"}
                </span>
                <span className="professor-mtg-tag shrink-0">B{userInputs.bracket}</span>
                {headProfessor ? (
                  <span className="professor-mtg-tag professor-mtg-tag--grade shrink-0" title={headProfessor.grade}>
                    {headProfessorDisplayLetter(headProfessor.grade) ?? parseHeadProfessorGradeText(headProfessor.grade).shortLabel}
                  </span>
                ) : null}
                {cos?.competitiveStrength != null ? (
                  <span className="professor-mtg-tag shrink-0" title="Competitive Strength">
                    CS {Math.round(cos.competitiveStrength)}
                  </span>
                ) : cos?.commanderBaselineStatus === "COMMANDER_BASELINE_UNCALIBRATED" ? (
                  <span className="professor-mtg-tag shrink-0" title="No calibrated commander intercept">
                    CS uncalibrated
                  </span>
                ) : null}
                {cos?.buildOptimization != null ? (
                  <span
                    className="professor-mtg-tag shrink-0"
                    title={
                      cos.buildOptimizationReferenceDepth === "STRONG"
                        ? `${cos.commanderReferenceCount} same-commander reference decks`
                        : cos.buildOptimizationReferenceDepth === "NEW_COMMANDER"
                          ? "New commander · broader COS reference"
                          : `Limited commander history · ${cos.commanderReferenceCount} lists`
                    }
                  >
                    BO {ordinalPercentile(cos.buildOptimization)}
                  </span>
                ) : null}
              </div>
              <p className="professor-mtg-muted mt-3 text-sm tabular-nums">
                {totalCards} cards
                {inStockCount > 0 ? (
                  <>
                    {" · "}
                    <span className="professor-mtg-card-price">{inStockCount} in shop stock</span>
                  </>
                ) : null}
              </p>
              {pdfError ? <p className="mt-2 text-xs text-red-300">{pdfError}</p> : null}
            </div>
            <div className="flex flex-wrap items-center gap-2 lg:justify-end">
              <button
                type="button"
                className="professor-mtg-btn px-4 py-2 text-[11px]"
                onClick={() => {
                  const text = formatSolDirectedDeckListText(grouped);
                  const filename = solDirectedDeckListDownloadFilename(commander.name);
                  downloadTextFile(filename, text);
                }}
              >
                Download .txt
              </button>
              <button
                type="button"
                className="professor-mtg-btn px-4 py-2 text-[11px]"
                disabled={pdfBusy}
                onClick={() => {
                  setPdfBusy(true);
                  setPdfError(null);
                  void downloadSolDirectedDeckReportPdf({
                    commanderName: commander.name,
                    bracket: userInputs.bracket,
                    playstyle: userInputs.playstyle,
                    headProfessor,
                    grade: headProfessor
                      ? computeSolDirectedDeckGradeV111({
                          headProfessor,
                          bracket: userInputs.bracket,
                          playstyle: userInputs.playstyle,
                          thesis,
                          primaryWinPaths: deck.primaryWinPaths,
                          audit: validation?.legacyHeuristicAudit ?? null,
                          landCount: telemetry?.landCount ?? null,
                          validationPass,
                        })
                      : null,
                    deckListText: formatSolDirectedDeckListText(grouped),
                    cos,
                    thesis,
                    gamePlan,
                    winPaths: {
                      primary: deck.primaryWinPaths,
                      secondary: deck.secondaryWinPaths,
                    },
                    nonlands: (deck.nonlands ?? []).map((card) => ({
                      name: card.name,
                      primaryArchitectRequirement: card.primaryArchitectRequirement,
                      primaryRole: card.primaryRole,
                      typeLine: card.typeLine,
                    })),
                    lands: deck.lands ?? [],
                    grouped,
                  })
                    .catch(() => {
                      setPdfError("Could not build the PDF. Try again.");
                    })
                    .finally(() => {
                      setPdfBusy(false);
                    });
                }}
              >
                {pdfBusy ? "Building PDF…" : "Download PDF report"}
              </button>
              <button
                type="button"
                className="professor-mtg-btn px-4 py-2 text-[11px]"
                onClick={() => setScoreOpen(true)}
              >
                View score & playstyle
              </button>
            </div>
          </div>
        </div>

        <div className="professor-mtg-panel-status flex items-center justify-between gap-3 px-4 py-2 sm:px-5">
          <div className="flex min-w-0 items-center gap-2">
            <span className="text-[var(--mtg-emerald)] text-xs">✦</span>
            <span className="text-xs tracking-wide text-[var(--mtg-emerald)]">Deck complete</span>
            <span className="professor-mtg-muted hidden text-[10px] sm:inline">
              Green = shop stock · TCG = market price
            </span>
          </div>
          <button type="button" className="professor-mtg-link shrink-0 text-[11px]" onClick={() => setScoreOpen(true)}>
            View results
          </button>
        </div>

        <div className="border-t border-[var(--mtg-stone-border)] px-4 py-4 sm:px-5">
          <ProfessorDeckBracketPanel
            storeSlug={slug}
            commanderName={commander.name}
            cards={bracketCards}
            requestedBracket={userInputs.bracket}
          />
        </div>

        <div className="border-t border-[var(--mtg-stone-border)] px-4 py-4 sm:px-5">
          <ProfessorDeckSwapPanel
            storeSlug={slug}
            commanderName={commander.name}
            commanderColorIdentity={commander.colorIdentity}
            cards={bracketCards}
            requestedBracket={userInputs.bracket}
          />
        </div>

        <div className="grid grid-cols-1 gap-0 divide-y divide-[var(--mtg-stone-border)] md:grid-cols-2 md:divide-x md:divide-y-0 xl:grid-cols-3">
          {COLUMN_GROUPS.map((categories, colIndex) => (
            <div key={colIndex} className="min-w-0 px-4 py-4 sm:px-5">
              {categories.map((category) => (
                <DeckTypeSection
                  key={category}
                  category={category}
                  cards={grouped[category]}
                  imageUrls={mergedImageUrls}
                  inventoryByName={inventoryByName}
                  tcgPricesByName={tcgPricesByName}
                />
              ))}
            </div>
          ))}
        </div>

        {critic?.appliedSwaps?.length ? (
          <div className="border-t border-[var(--mtg-stone-border)] px-5 py-4 sm:px-6">
            <p className="professor-mtg-label">
              Professor changed {critic.appliedSwaps.length} card
              {critic.appliedSwaps.length === 1 ? "" : "s"}
            </p>
            {critic.summary ? (
              <p className="professor-mtg-muted mt-2 text-xs leading-relaxed">{critic.summary}</p>
            ) : null}
            <ul className="professor-mtg-body mt-3 space-y-1 text-sm">
              {critic.appliedSwaps.slice(0, 16).map((swap) => (
                <li key={`${swap.cut}->${swap.add}`}>
                  <span className="text-[var(--mtg-parchment-muted)]">{swap.cut}</span>
                  {" → "}
                  <span className="text-[var(--mtg-gold-bright)]">{swap.add}</span>
                  {swap.reason ? (
                    <span className="professor-mtg-muted"> — {swap.reason}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
      </div>

      <ScorePlaystyleModal
        open={scoreOpen}
        onClose={() => setScoreOpen(false)}
        commanderName={commander.name}
        userInputs={userInputs}
        headProfessor={headProfessor}
        thesis={thesis}
        gamePlan={gamePlan}
        winPaths={{
          primary: deck.primaryWinPaths,
          secondary: deck.secondaryWinPaths,
        }}
        validation={validation}
        telemetry={telemetry}
        validationPass={validationPass}
        professorRepairApplied={professorRepairApplied}
        cos={cos}
        storeSlug={slug}
      />
    </>
  );
}
