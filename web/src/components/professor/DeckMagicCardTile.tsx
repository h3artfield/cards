"use client";

import { scryfallNamedArtCropUrl } from "@/lib/deck-synthesis/professor-brew-scryfall-images-v1";
import type { CustomerDeckListEntryV1 } from "@/lib/professor-deck-editor/deck-list-v1";
import { CosProfileDecagon } from "./CosProfileDecagon";

/** Every deck in this product is Commander today; the ribbon leaves room for more formats. */
const DECK_FORMAT_LABEL = "Commander";

type HeadlineScore =
  | { kind: "letter"; value: string; title: string }
  | { kind: "cs"; value: number; title: string }
  | { kind: "none"; title: string };

function deckHeadlineScore(deck: CustomerDeckListEntryV1): HeadlineScore {
  const cos = deck.cosSnapshot;

  if (deck.origin === "professor" && deck.grade) {
    return {
      kind: "letter",
      value: deck.grade,
      title:
        "Head Professor letter grade from when this deck was built — a bracket-fit judgment, not a power level percentile.",
    };
  }

  if (cos?.competitiveStrength != null) {
    return {
      kind: "cs",
      value: Math.round(cos.competitiveStrength),
      title:
        "Competitive Strength (0–100) — frozen, deterministic COS score. Same number as Check bracket when the commander is calibrated.",
    };
  }

  return {
    kind: "none",
    title:
      deck.origin === "hand"
        ? "No headline score yet. Complete the list and run Check bracket — or wait for this commander to enter the COS calibration set."
        : "Letter grade appears on Professor builds. Competitive Strength appears once the commander is calibrated.",
  };
}

function formatDeckDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function eventAssignmentBannerLabel(
  assignments: NonNullable<CustomerDeckListEntryV1["eventAssignments"]>,
): string {
  if (assignments.length === 1) {
    return assignments[0].eventTitle;
  }
  const next = assignments[0];
  const eventDate = formatDeckDate(next.startAt);
  return `${assignments.length} events · next ${eventDate}`;
}

export function DeckMagicCardTile({
  deck,
  onRequestDelete,
  suppressNavigation,
  isDragging = false,
}: {
  deck: CustomerDeckListEntryV1;
  onRequestDelete?: (deck: CustomerDeckListEntryV1) => void;
  suppressNavigation?: () => boolean;
  isDragging?: boolean;
}) {
  const artUrl = scryfallNamedArtCropUrl(deck.commanderName, true);
  const bracket = deck.registrationBracket ?? deck.measuredBracket;
  const cos = deck.cosSnapshot;
  const headline = deckHeadlineScore(deck);
  const createdLabel = formatDeckDate(deck.createdAt);
  const eventAssignments = deck.eventAssignments ?? [];

  return (
    <div
      className={[
        "deck-magic-card deck-magic-card--tile group relative",
        isDragging ? "deck-magic-card--dragging" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {eventAssignments.length ? (
        <div
          className="deck-magic-card__event-banner"
          title={
            eventAssignments.length === 1
              ? `Registered for ${eventAssignments[0].eventTitle}`
              : eventAssignments.map((a) => a.eventTitle).join(", ")
          }
        >
          Registered · {eventAssignmentBannerLabel(eventAssignments)}
        </div>
      ) : null}
      {onRequestDelete ? (
        <button
          type="button"
          className="deck-magic-card__delete"
          aria-label={`Delete ${deck.deckName}`}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onRequestDelete(deck);
          }}
        >
          Delete
        </button>
      ) : null}

      <a
        href={deck.href}
        className="block no-underline"
        draggable={false}
        onClick={(event) => {
          if (suppressNavigation?.()) {
            event.preventDefault();
          }
        }}
      >
        <div className="deck-magic-card__frame deck-magic-card__frame--tile">
          <img src={artUrl} alt="" className="deck-magic-card__art" loading="lazy" />
          <div className="deck-magic-card__inner-border" />
          <span className="deck-magic-card__format-ribbon">{DECK_FORMAT_LABEL}</span>
        </div>
        <div className="deck-magic-card__title-block deck-magic-card__title-block--tile">
          <p className="deck-magic-card__deck-name">{deck.deckName}</p>
          <p className="deck-magic-card__commander-name">{deck.commanderName}</p>

          <div className="deck-magic-card__metrics">
            {cos?.profile?.length ? (
              <CosProfileDecagon profile={cos.profile} size={52} className="deck-magic-card__decagon" />
            ) : (
              <div className="deck-magic-card__decagon deck-magic-card__decagon--empty" aria-hidden />
            )}
            <div className="deck-magic-card__scores">
              {headline.kind === "letter" ? (
                <p className="deck-magic-card__cs" title={headline.title}>
                  <span className="deck-magic-card__cs-value deck-magic-card__cs-value--letter">
                    {headline.value}
                  </span>
                </p>
              ) : headline.kind === "cs" ? (
                <p className="deck-magic-card__cs" title={headline.title}>
                  <span className="deck-magic-card__cs-value">{headline.value}</span>
                  <span className="deck-magic-card__cs-denom">/100</span>
                  <span className="deck-magic-card__cs-label">CoS</span>
                </p>
              ) : (
                <p className="deck-magic-card__cs deck-magic-card__cs--muted" title={headline.title}>
                  <span className="deck-magic-card__cs-value">—</span>
                </p>
              )}
            </div>
            {bracket != null ? (
              <p
                className="deck-magic-card__bracket"
                title={
                  deck.registrationBracketStale
                    ? "Edited since bracket was set"
                    : "Commander bracket"
                }
              >
                Bracket {bracket}
                {deck.registrationBracketStale ? "?" : ""}
              </p>
            ) : null}
          </div>

          <div className="deck-magic-card__footer">
            <p className="deck-magic-card__meta">
              {deck.origin === "hand" ? "Built by you" : "Professor build"}
              {deck.libraryCount != null ? ` · ${deck.libraryCount}/99` : ""}
            </p>
            {createdLabel ? (
              <time className="deck-magic-card__date" dateTime={deck.createdAt}>
                {createdLabel}
              </time>
            ) : null}
          </div>
        </div>
      </a>
    </div>
  );
}
