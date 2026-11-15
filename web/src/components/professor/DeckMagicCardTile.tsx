"use client";

import { useState } from "react";
import { scryfallNamedArtCropUrl } from "@/lib/deck-synthesis/professor-brew-scryfall-images-v1";
import type { CustomerDeckListEntryV1 } from "@/lib/professor-deck-editor/deck-list-v1";
import { CosProfileDecagon } from "./CosProfileDecagon";

/** Every deck in this product is Commander today; the ribbon leaves room for more formats. */
const DECK_FORMAT_LABEL = "Commander";

function deckHeadlineScore(deck: CustomerDeckListEntryV1): { title: string } {
  return {
    title:
      deck.registrationBracket != null || deck.measuredBracket != null
        ? "Commander bracket for this list."
        : "Check bracket to measure this list.",
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
  const [tableState, setTableState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [tableMessage, setTableMessage] = useState<string | null>(null);

  const useAtTable = async (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setTableState("busy");
    setTableMessage(null);
    try {
      const res = await fetch("/api/challenger/decks", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deckId: deck.deckId }),
      });
      const data = (await res.json().catch(() => null)) as { error?: string; bracket?: number } | null;
      if (!res.ok) {
        setTableState("error");
        setTableMessage(data?.error ?? "Could not submit this deck.");
        return;
      }
      setTableState("done");
      setTableMessage(
        `Submitted for bracket ${data?.bracket ?? bracket}. Go back to the lobby and join the queue with it.`,
      );
    } catch {
      setTableState("error");
      setTableMessage("Could not reach the server.");
    }
  };

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
          {deck.deckRating ? <p className="deck-magic-card__commander-name">{deck.deckRating}</p> : null}

          <div className="deck-magic-card__metrics">
            {cos?.profile?.length ? (
              <CosProfileDecagon profile={cos.profile} size={52} className="deck-magic-card__decagon" />
            ) : (
              <div className="deck-magic-card__decagon deck-magic-card__decagon--empty" aria-hidden />
            )}
            <div className="deck-magic-card__scores" title={headline.title} />
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
      <button
        type="button"
        className="deck-magic-card__table"
        disabled={tableState === "busy"}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => void useAtTable(event)}
      >
        {tableState === "busy" ? "Submitting…" : tableState === "done" ? "Submitted" : "Use at the table"}
      </button>
      {tableMessage ? (
        <p className={tableState === "error" ? "deck-magic-card__table-note deck-magic-card__table-note--bad" : "deck-magic-card__table-note"}>
          {tableMessage}
        </p>
      ) : null}
    </div>
  );
}
