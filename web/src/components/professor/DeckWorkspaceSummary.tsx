"use client";

import {
  DEFAULT_PROFESSOR_PLAYSTYLE_V111,
  PROFESSOR_PLAYSTYLE_CHOICES_V111,
} from "@/lib/deck-synthesis/professor-playstyle-choices-v1-1-1";
import { professorPlaystyleShortLabelV1 } from "@/lib/professor-deck-editor/deck-list-display-v1";
import type { DeckColorBalanceV1 } from "@/lib/professor-deck-editor/color-balance-v1";
import { composeDeckPilotBriefV1 } from "@/lib/professor-deck-editor/compose-pilot-brief-v1";
import type { ReactNode } from "react";
import type { CosProfileDecagonPointV1 } from "./CosProfileDecagon";
import { ColorBalanceStrip } from "./deck-editor/ColorBalanceStrip";
import { DeckProfileWheel, type DeckProfileSpokeV1 } from "./deck-editor/DeckProfileWheel";

export type DeckWorkspaceTab = "deck" | "analysis" | "suggestions" | "changes";

export type { DeckProfileSpokeV1 };

const ARCHITECT_META_LINE =
  /architect allocation|requested count|overlap multiple roles/i;

function firstCustomerSentence(text: string | undefined, max = 180): string {
  if (!text?.trim()) return "";
  const parts = text
    .trim()
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter((part) => part && !ARCHITECT_META_LINE.test(part));
  const sentence = parts[0] ?? "";
  return sentence.length > max ? `${sentence.slice(0, max - 1)}…` : sentence;
}

function playstyleParts(playstyle: string): { label: string; detail: string } {
  const trimmed = playstyle.trim();
  if (!trimmed) return { label: "", detail: "" };
  const resolved =
    trimmed === DEFAULT_PROFESSOR_PLAYSTYLE_V111.id
      ? DEFAULT_PROFESSOR_PLAYSTYLE_V111
      : PROFESSOR_PLAYSTYLE_CHOICES_V111.find((choice) => choice.id === trimmed);
  if (resolved) {
    return { label: resolved.label, detail: resolved.description };
  }
  const dash = trimmed.indexOf(" — ");
  if (dash >= 0) {
    return {
      label: trimmed.slice(0, dash).trim(),
      detail: trimmed.slice(dash + 3).trim(),
    };
  }
  return { label: professorPlaystyleShortLabelV1(trimmed) ?? trimmed, detail: "" };
}

function weaknessLine(text: string | undefined, requiredChange?: string): string {
  const hole = firstCustomerSentence(text);
  if (
    hole &&
    /weak|however|lack|struggle|slow|gap|risk|vulnerable|cannot|doesn't|thin|close games|closing|inefficien/i.test(
      hole,
    )
  ) {
    return hole;
  }
  return firstCustomerSentence(requiredChange);
}

export function DeckWorkspaceSummary({
  commanderName,
  commanderImageUrl,
  playstyle,
  bracket,
  grade,
  libraryCount,
  libraryLegal,
  ownedCount,
  buyHereCount,
  needElsewhereCount,
  inStockCount,
  assessment,
  weakness,
  requiredChange,
  changeCount,
  onOpenReport,
  onOpenChanges,
  reportLabel = "View professor report",
  onAddBuyHereToCart,
  onAddInStockToCart,
  nameSlot,
  overflow,
  profileSpokes,
  focusedProfile,
  onFocusProfile,
  cosProfile,
  colorBalance,
  primaryWinPaths,
  secondaryWinPaths,
  earlyTips,
  midTips,
  comboNames,
}: {
  commanderName: string;
  commanderImageUrl?: string;
  playstyle: string;
  bracket: number | null;
  grade: string | null;
  libraryCount: number;
  libraryLegal: boolean;
  ownedCount?: number;
  buyHereCount?: number;
  needElsewhereCount?: number;
  inStockCount: number;
  onAddBuyHereToCart?: () => void;
  assessment?: string | null;
  weakness?: string | null;
  requiredChange?: string | null;
  changeCount: number;
  onOpenReport?: () => void;
  onOpenChanges?: () => void;
  reportLabel?: string;
  onAddInStockToCart?: () => void;
  nameSlot?: ReactNode;
  overflow?: ReactNode;
  profileSpokes?: readonly DeckProfileSpokeV1[];
  focusedProfile?: string | null;
  onFocusProfile?: (key: string | null) => void;
  cosProfile?: readonly CosProfileDecagonPointV1[] | null;
  colorBalance?: DeckColorBalanceV1 | null;
  primaryWinPaths?: readonly string[];
  secondaryWinPaths?: readonly string[];
  earlyTips?: readonly string[];
  midTips?: readonly string[];
  comboNames?: readonly string[];
}) {
  const { label: styleLabel, detail: styleDetail } = playstyleParts(playstyle);
  const brief = composeDeckPilotBriefV1({
    commanderName,
    playstyleLabel: styleLabel,
    playstyleDetail: styleDetail,
    primaryWinPaths,
    secondaryWinPaths,
    earlyTips,
    midTips,
    comboNames,
  });
  const lead = brief || firstCustomerSentence(assessment ?? undefined) || firstCustomerSentence(styleDetail);
  const hole = weaknessLine(weakness ?? undefined, requiredChange ?? undefined);
  const showWheel = (cosProfile?.length ?? 0) >= 3;
  const buyHere = buyHereCount ?? inStockCount;
  const addBuyHere = onAddBuyHereToCart ?? onAddInStockToCart;
  const showOverlay = ownedCount != null || needElsewhereCount != null;

  return (
    <div className="deck-workspace-summary">
      {commanderImageUrl ? (
        <div className="deck-workspace-summary__thumb">
          <img src={commanderImageUrl} alt="" />
        </div>
      ) : null}
      <div className="deck-workspace-summary__main">
        <h2 className="deck-workspace-summary__commander">{commanderName}</h2>
        {nameSlot}
        <p className="deck-workspace-summary__facts">
          {libraryCount}/99 {libraryLegal ? "legal" : "needs review"}
          {showOverlay ? (
            <>
              {" · "}
              <span className="text-[var(--cool)]">Owned {ownedCount ?? 0}</span>
              {" · "}
              {addBuyHere && buyHere > 0 ? (
                <button
                  type="button"
                  className="text-[var(--ok)] underline underline-offset-2"
                  onClick={addBuyHere}
                >
                  Buy here {buyHere}
                </button>
              ) : (
                <span className="text-[var(--ok)]">Buy here {buyHere}</span>
              )}
              {" · "}
              <span className="text-[var(--warn)]">Need elsewhere {needElsewhereCount ?? 0}</span>
            </>
          ) : buyHere > 0 ? (
            <>
              {" · "}
              {addBuyHere ? (
                <button
                  type="button"
                  className="text-[var(--ok)] underline underline-offset-2"
                  onClick={addBuyHere}
                >
                  {buyHere} in stock · Buy
                </button>
              ) : (
                <span className="text-[var(--ok)]">{buyHere} in stock</span>
              )}
            </>
          ) : null}
        </p>
        {lead && lead !== styleLabel ? <p className="deck-workspace-summary__lead">{lead}</p> : null}
        {hole && hole !== lead ? (
          <p className="deck-workspace-summary__weakness">
            <span className="deck-workspace-summary__weakness-label">Main weakness</span>
            {hole}
          </p>
        ) : null}
        <div className="deck-workspace-summary__actions">
          {onOpenReport ? (
            <button type="button" className="professor-mtg-btn px-3 py-1.5 text-[11px]" onClick={onOpenReport}>
              {reportLabel}
            </button>
          ) : null}
          {changeCount > 0 ? (
            <button
              type="button"
              className="professor-mtg-btn px-3 py-1.5 text-[11px]"
              onClick={onOpenChanges}
            >
              {changeCount} suggested change{changeCount === 1 ? "" : "s"}
            </button>
          ) : null}
          {overflow}
        </div>
      </div>

      <div className="deck-workspace-summary__marks">
        {showWheel ? (
          <>
            <DeckProfileWheel
              spokes={profileSpokes ?? []}
              grade={grade}
              bracket={bracket}
              playstyle={styleLabel}
              focused={focusedProfile}
              onFocus={onFocusProfile}
              cosProfile={cosProfile}
            />
            {colorBalance ? <ColorBalanceStrip balance={colorBalance} compact /> : null}
          </>
        ) : (
          <>
            {grade ? <span className="deck-workspace-summary__grade">{grade}</span> : null}
            {bracket != null ? (
              <span className="deck-workspace-summary__bracket">Bracket {bracket}</span>
            ) : null}
            {styleLabel ? <span className="deck-workspace-summary__style">{styleLabel}</span> : null}
            {colorBalance ? <ColorBalanceStrip balance={colorBalance} compact /> : null}
          </>
        )}
      </div>
    </div>
  );
}

export function DeckWorkspaceTabs({
  active,
  onChange,
  changeCount,
}: {
  active: DeckWorkspaceTab;
  onChange: (tab: DeckWorkspaceTab) => void;
  changeCount: number;
}) {
  const tabs: Array<{ id: DeckWorkspaceTab; label: string }> = [
    { id: "deck", label: "Deck" },
    { id: "analysis", label: "Analysis" },
    { id: "suggestions", label: "Suggestions" },
    {
      id: "changes",
      label: changeCount > 0 ? `Professor changes (${changeCount})` : "Professor changes",
    },
  ];

  return (
    <nav className="deck-workspace-tabs" aria-label="Deck workspace">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          className={`deck-workspace-tab${active === tab.id ? " deck-workspace-tab--on" : ""}`}
          aria-current={active === tab.id ? "page" : undefined}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  );
}
