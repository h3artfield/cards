"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { DeckBoardV1, DeckMarkerV1 } from "@/lib/professor-deck-editor/types-v1";
import type { DeckEditorCard } from "./types";

/**
 * Picking a card up.
 *
 * A deck editor is a pile of cards on a table, and the two things you do with
 * a card in your hand are look at it and put it somewhere. So a tap looks —
 * the click handler on the tile still runs and opens the reveal — and a press
 * that is held lifts the card out of the list and offers the places it can go.
 *
 * The two gestures have to be told apart from the same pointer stream, which
 * is what the press/held split below is for. Getting it wrong in either
 * direction is unpleasant: a click that grabs makes the deck feel sticky, and
 * a grab that clicks throws a modal in your face mid-drag.
 *
 * Mouse and pen only lift once the pointer actually moves. A still press that
 * lasts a beat used to lift on a timer, which meant an ordinary click also
 * spawned the grab ghost — a filtered, will-changed layer on top of a
 * ninety-nine-image board — and then opened the reveal. Chrome on Windows
 * kills that tab.
 *
 * Touch still lifts on a hold: a finger that moves is scrolling, so movement
 * cannot be the grab signal there.
 */

/** How long a still finger-press has to be held before the card comes up. */
const HOLD_MS = 280;

/**
 * How far a pointer may drift during a press and still count as a click.
 *
 * Nobody presses a mouse button without moving it a pixel or two, and on a
 * touchscreen a "tap" is more like four or five.
 */
const SLOP_PX = 8;

/**
 * The one attribute the hit-test reads carries both board names and marker
 * ids, and a marker id is a slug of whatever the customer typed — so markers
 * are prefixed. Without it a tag called "cut" would move the card instead of
 * tagging it.
 */
const MARKER_BUCKET_PREFIX = "marker:";

type MarkerBucketIdV1 = `marker:${string}`;

/**
 * The bucket that makes a tag instead of applying one.
 *
 * A plain id for the same reason the boards have one: every id a customer can
 * invent is prefixed, so a tag called "new tag" arrives as `marker:d:new-tag`
 * and cannot be mistaken for this. The drop handler can therefore tell "make me
 * a tag" from "put that tag on" without looking at what any tag is called.
 */
const NEW_TAG_BUCKET_ID = "new-tag";

/** Where a held card can be dropped: the shop cart, a board, a tag, or a new tag. */
type BucketIdV1 = "cart" | typeof NEW_TAG_BUCKET_ID | DeckBoardV1 | MarkerBucketIdV1;

type BucketV1 = {
  id: BucketIdV1;
  label: string;
  hint: string;
  tone?: "cart" | "cut" | "marker" | "new-tag";
  /** Tags only: the card already carries this one, so a drop takes it off. */
  applied?: boolean;
};

function isMarkerBucketV1(id: BucketIdV1): id is MarkerBucketIdV1 {
  return id.startsWith(MARKER_BUCKET_PREFIX);
}

const BOARD_BUCKETS: Record<DeckBoardV1, BucketV1> = {
  mainboard: { id: "mainboard", label: "Deck", hint: "play it" },
  // "Bench" rather than Considering: during a drag you read the label in
  // peripheral vision, and a bench is a place you can picture putting a card.
  considering: { id: "considering", label: "Bench", hint: "decide later" },
  cut: { id: "cut", label: "Cut", hint: "take it out", tone: "cut" },
};

const CART_BUCKET: BucketV1 = { id: "cart", label: "Cart", hint: "buy it here", tone: "cart" };

const NEW_TAG_BUCKET: BucketV1 = {
  id: NEW_TAG_BUCKET_ID,
  label: "+ New tag",
  hint: "name it, tag it",
  tone: "new-tag",
};

/**
 * How many of the customer's tags the column offers.
 *
 * A column cannot be scrolled with a card already in hand, so past this many
 * the Mark menu on the row is the way in. Three boards plus this many tags is
 * a column that still fits a laptop window.
 */
const MARKER_BUCKET_LIMIT = 6;

/** The two boards a card is not currently on — always exactly two. */
function boardDestinations(board: DeckBoardV1): DeckBoardV1[] {
  switch (board) {
    case "mainboard":
      return ["considering", "cut"];
    case "considering":
      return ["mainboard", "cut"];
    case "cut":
      return ["mainboard", "considering"];
  }
}

/**
 * The customer's own tags, as buckets.
 *
 * Tags the card already has stay in the column and turn into "drop to untag"
 * rather than being dropped from it: the column is then a readout of what the
 * card carries as well as a set of targets, and every bucket in it does
 * something when you let go.
 */
function markerBucketsV1(card: DeckEditorCard, markers: readonly DeckMarkerV1[]): BucketV1[] {
  return markers.slice(0, MARKER_BUCKET_LIMIT).map((marker) => {
    const applied = card.markerIds.includes(marker.id);
    return {
      id: `${MARKER_BUCKET_PREFIX}${marker.id}` as MarkerBucketIdV1,
      label: marker.label,
      hint: applied ? "drop to untag" : "tag it",
      tone: "marker" as const,
      applied,
    };
  });
}

/** Where the card sat when it was picked up, in viewport coordinates. */
type AnchorV1 = { left: number; right: number; top: number; height: number };

/** Clear of the card, but close enough to read as attached to it. */
const DOCK_GAP_PX = 10;
/** No bucket flush against the window edge; one that is looks like a bug. */
const DOCK_EDGE_PX = 8;

/**
 * Where the column of buckets goes.
 *
 * Beside the card and level with it, because the request was for the options to
 * be "directly to the right of the card we are selecting" — the ghost follows
 * the cursor, this does not move at all once the card is up.
 *
 * The right of the card is only the preference. A card in the last column of a
 * grid has no room there, so the column flips to the card's left; if neither
 * side fits, in a narrow window, it is pushed inside the viewport and overlaps
 * the card, which still beats buckets you cannot reach.
 */
function placeDockV1(anchor: AnchorV1, dock: { width: number; height: number }) {
  let left = anchor.right + DOCK_GAP_PX;
  if (left + dock.width + DOCK_EDGE_PX > window.innerWidth) {
    const flipped = anchor.left - DOCK_GAP_PX - dock.width;
    left =
      flipped >= DOCK_EDGE_PX
        ? flipped
        : Math.max(DOCK_EDGE_PX, window.innerWidth - dock.width - DOCK_EDGE_PX);
  }

  // Centred on the card, then pulled back inside the window so a card on the
  // last row of a ninety-nine card grid still shows every bucket. The lower
  // bound wins over the upper one when the column is taller than the window,
  // which puts the top of it on screen rather than the middle.
  const centred = anchor.top + anchor.height / 2 - dock.height / 2;
  const lowest = Math.max(DOCK_EDGE_PX, window.innerHeight - dock.height - DOCK_EDGE_PX);
  const top = Math.min(Math.max(centred, DOCK_EDGE_PX), lowest);

  return { left, top };
}

type PressV1 = {
  card: DeckEditorCard;
  originX: number;
  originY: number;
  /** The card's own box, so the buckets can be put beside it if this is a grab. */
  anchor: AnchorV1;
  /**
   * Touch presses can only be held, never dragged into a grab: a finger that
   * moves is scrolling the board, and stealing that gesture would make a
   * ninety-nine card deck unscrollable.
   */
  holdOnly: boolean;
  timer: number | null;
};

type HeldV1 = { card: DeckEditorCard; x: number; y: number; anchor: AnchorV1 };

/**
 * A card that has been dropped on New tag and is waiting for the tag's name.
 *
 * The anchor outlives the grab so the name field can be put where the tray was,
 * beside the card that was dropped, rather than appearing somewhere unrelated a
 * beat after the drag ended.
 */
type NamingV1 = { card: DeckEditorCard; anchor: AnchorV1 };

type CardGrabApiV1 = {
  /** Put on a card's root element to make it liftable. */
  beginPress: (card: DeckEditorCard, event: React.PointerEvent<HTMLElement>) => void;
  /** The card currently in hand, so its place in the list can show as empty. */
  heldKey: string | null;
};

const CardGrabContext = createContext<CardGrabApiV1 | null>(null);

/** Null outside a provider, so read-only card views work unchanged. */
export function useCardGrabV1(): CardGrabApiV1 | null {
  return useContext(CardGrabContext);
}

export function CardGrabProviderV1({
  imageUrls,
  markers,
  cartEligible,
  onCart,
  onMove,
  onToggleMarker,
  onCreateTag,
  children,
}: {
  imageUrls: Record<string, string>;
  /** The customer's own tags, offered as buckets under the board destinations. */
  markers: readonly DeckMarkerV1[];
  /** Whether the Cart bucket is offered — only for cards on our own shelf. */
  cartEligible: (card: DeckEditorCard) => boolean;
  onCart: (card: DeckEditorCard) => void;
  onMove: (card: DeckEditorCard, board: DeckBoardV1) => void;
  onToggleMarker: (card: DeckEditorCard, markerId: string, assign: boolean) => void;
  /** Makes the named tag if the deck has not got it, and puts it on the card. */
  onCreateTag: (card: DeckEditorCard, label: string) => void;
  children: React.ReactNode;
}) {
  const [held, setHeld] = useState<HeldV1 | null>(null);
  const [hover, setHover] = useState<BucketIdV1 | null>(null);
  /** Null until the column has been measured; see `measureDock`. */
  const [dockAt, setDockAt] = useState<{ left: number; top: number } | null>(null);
  const [naming, setNaming] = useState<NamingV1 | null>(null);
  /** Null until the name field has been measured, exactly as `dockAt` is. */
  const [namingAt, setNamingAt] = useState<{ left: number; top: number } | null>(null);

  // The pointer listeners live on the window for the whole life of the editor
  // rather than being added per press, so a pointerup that lands outside the
  // card — which is every successful drop — is still seen. They read refs
  // because a listener registered once cannot close over changing state.
  const press = useRef<PressV1 | null>(null);
  const heldRef = useRef<HeldV1 | null>(null);
  const hoverRef = useRef<BucketIdV1 | null>(null);
  /** Read by the ref callback that places the name field, which cannot close over state. */
  const namingRef = useRef<NamingV1 | null>(null);
  const pointer = useRef({ x: 0, y: 0 });
  const actions = useRef({ cartEligible, onCart, onMove, onToggleMarker });
  /** Set by the effect below, so the press handler can lift on its hold timer. */
  const lift = useRef<(x: number, y: number) => void>(() => {});

  useEffect(() => {
    actions.current = { cartEligible, onCart, onMove, onToggleMarker };
  });

  useEffect(() => {
    const clearPress = () => {
      if (press.current?.timer != null) window.clearTimeout(press.current.timer);
      press.current = null;
    };

    lift.current = (x: number, y: number) => {
      const current = press.current;
      if (!current) return;
      if (current.timer != null) window.clearTimeout(current.timer);
      current.timer = null;
      const next = { card: current.card, x, y, anchor: current.anchor };
      heldRef.current = next;
      hoverRef.current = null;
      setHeld(next);
      setHover(null);
      setDockAt(null);
      document.body.classList.add("professor-mtg-grabbing");
    };

    const release = () => {
      heldRef.current = null;
      hoverRef.current = null;
      setHeld(null);
      setHover(null);
      setDockAt(null);
      clearPress();
      document.body.classList.remove("professor-mtg-grabbing");
    };

    /**
     * A drop is a pointerup, and a pointerup on the card you pressed also
     * produces a click. Without swallowing it, every drop would open the
     * reveal for the card you just put away.
     *
     * The one click it must not eat is a click into the name field, because a
     * drop on New tag opens that field on the same pointerup this is armed
     * for. So the field is exempt and the swallow stays armed for the stray
     * one, which is also why this disarms itself on the click it eats rather
     * than being registered `once`.
     */
    const swallowNextClick = () => {
      const stop = () => window.removeEventListener("click", swallow, true);
      function swallow(event: MouseEvent) {
        if ((event.target as HTMLElement | null)?.closest("[data-grab-prompt]")) return;
        event.stopPropagation();
        event.preventDefault();
        stop();
      }
      window.addEventListener("click", swallow, { capture: true });
      window.setTimeout(stop, 400);
    };

    const onPointerMove = (event: PointerEvent) => {
      pointer.current = { x: event.clientX, y: event.clientY };

      if (heldRef.current) {
        const next = { ...heldRef.current, x: event.clientX, y: event.clientY };
        heldRef.current = next;
        setHeld(next);

        // Hit-test rather than track enter/leave on each bucket: the ghost
        // follows the pointer, so with listeners the bucket would fire leave
        // the moment the card covered it. The ghost is pointer-events:none,
        // which keeps it out of this lookup.
        const element = document.elementFromPoint(event.clientX, event.clientY);
        const bucket =
          (element as HTMLElement | null)
            ?.closest("[data-grab-bucket]")
            ?.getAttribute("data-grab-bucket") ?? null;
        if (bucket !== hoverRef.current) {
          hoverRef.current = bucket as BucketIdV1 | null;
          setHover(bucket as BucketIdV1 | null);
        }
        event.preventDefault();
        return;
      }

      const current = press.current;
      if (!current) return;
      const far =
        Math.hypot(event.clientX - current.originX, event.clientY - current.originY) >= SLOP_PX;
      if (!far) return;
      if (current.holdOnly) clearPress();
      else lift.current(event.clientX, event.clientY);
    };

    const onPointerUp = () => {
      const holding = heldRef.current;
      if (!holding) {
        // A press that never became a grab: let the click through, which is
        // what opens the reveal.
        clearPress();
        return;
      }
      const bucket = hoverRef.current;
      release();
      // Any lift ate the pointer stream. Swallow the leftover click so a grab
      // does not also open the reveal — including a touch hold that never
      // reached a bucket.
      swallowNextClick();
      if (!bucket) return;
      if (bucket === "cart") actions.current.onCart(holding.card);
      else if (bucket === NEW_TAG_BUCKET_ID) {
        // The drop is the end of the gesture, so the name has to be asked for
        // after it. Nothing is created until it is answered, and the card is
        // remembered rather than the tag: cancelling here must leave the deck
        // exactly as this drop found it.
        const next = { card: holding.card, anchor: holding.anchor };
        namingRef.current = next;
        setNaming(next);
        setNamingAt(null);
      } else if (isMarkerBucketV1(bucket)) {
        const markerId = bucket.slice(MARKER_BUCKET_PREFIX.length);
        actions.current.onToggleMarker(
          holding.card,
          markerId,
          !holding.card.markerIds.includes(markerId),
        );
      } else if (bucket !== holding.card.board) actions.current.onMove(holding.card, bucket);
    };

    // Escape only means "put the card down" while a card is actually up. By the
    // time the name field is open the grab is over, so this falls through and
    // the field's own handler — which stops the key here anyway — gets it.
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (!heldRef.current && !press.current) return;
      release();
    };

    window.addEventListener("pointermove", onPointerMove, { passive: false });
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", release);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", release);
      window.removeEventListener("keydown", onKeyDown);
      document.body.classList.remove("professor-mtg-grabbing");
    };
  }, []);

  // Touches only refs, so it never needs rebuilding.
  const beginPress = useCallback(
    (card: DeckEditorCard, event: React.PointerEvent<HTMLElement>) => {
      // Secondary buttons open context menus; the tile's own controls — the
      // actions menu, the copies stepper — mark themselves as no-go so a
      // press on a button does not also lift the card underneath it.
      if (event.button !== 0) return;
      if ((event.target as HTMLElement | null)?.closest("[data-grab-ignore]")) return;

      // Measured here rather than when the hold fires: the synthetic event's
      // currentTarget is only the card's root element for the length of this
      // handler.
      const box = event.currentTarget.getBoundingClientRect();

      pointer.current = { x: event.clientX, y: event.clientY };
      const holdOnly = event.pointerType === "touch";
      press.current = {
        card,
        originX: event.clientX,
        originY: event.clientY,
        anchor: { left: box.left, right: box.right, top: box.top, height: box.height },
        holdOnly,
        // Mouse and pen lift on movement, not on a timer. A 180ms timer was
        // short enough that a normal click became a grab.
        timer: holdOnly
          ? window.setTimeout(
              () => lift.current(pointer.current.x, pointer.current.y),
              HOLD_MS,
            )
          : null,
      };
    },
    [],
  );

  /**
   * Measures the column and places it, on the one render where it mounts.
   *
   * Both the flip and the clamp need its real size, and that depends on how
   * many buckets this card has and on the reader's font size — predicting it
   * from the stylesheet would go stale the first time either changed. A ref
   * callback runs in the commit, so the corrected position is the first one
   * painted rather than a visible jump.
   */
  const measureDock = useCallback((node: HTMLDivElement | null) => {
    const anchor = heldRef.current?.anchor;
    if (!node || !anchor) return;
    const box = node.getBoundingClientRect();
    const next = placeDockV1(anchor, { width: box.width, height: box.height });
    setDockAt((current) =>
      current && current.left === next.left && current.top === next.top ? current : next,
    );
  }, []);

  /**
   * The same measure-then-place, for the name field.
   *
   * It goes through `placeDockV1` rather than reusing the tray's own position:
   * the field is wider than the tray, so a card in the last column whose tray
   * fitted to its right can still need the field flipped to its left, and a
   * card on the bottom row needs it pulled up by more.
   */
  const measureNaming = useCallback((node: HTMLDivElement | null) => {
    const anchor = namingRef.current?.anchor;
    if (!node || !anchor) return;
    const box = node.getBoundingClientRect();
    setNamingAt(placeDockV1(anchor, { width: box.width, height: box.height }));
  }, []);

  const closeNaming = useCallback(() => {
    namingRef.current = null;
    setNaming(null);
    setNamingAt(null);
  }, []);

  /**
   * A fresh object whenever the held card changes.
   *
   * Consumers are reached through context, and context only notifies on a new
   * value — so a mutated-in-place object would leave every tile showing the
   * deck as it was before the card came up.
   */
  const api = useMemo<CardGrabApiV1>(
    () => ({ beginPress, heldKey: held?.card.cardKey ?? null }),
    [beginPress, held?.card.cardKey],
  );

  // Read from the prop rather than the ref: the ref is refreshed in an effect,
  // so on the render where a card is first lifted it is still a render behind.
  const moveBuckets: BucketV1[] = held
    ? [
        ...(cartEligible(held.card) ? [CART_BUCKET] : []),
        ...boardDestinations(held.card.board).map((board) => BOARD_BUCKETS[board]),
      ]
    : [];
  const tagBuckets: BucketV1[] = held ? markerBucketsV1(held.card, markers) : [];
  const hiddenTags = held ? Math.max(0, markers.length - tagBuckets.length) : 0;

  // Before the measurement lands the column is drawn where it would prefer to
  // be, which is where it usually ends up anyway.
  const dockPosition = held
    ? (dockAt ?? { left: held.anchor.right + DOCK_GAP_PX, top: held.anchor.top })
    : null;

  const ghostUrl = held
    ? (imageUrls[held.card.name] ?? imageUrls[held.card.name.toLowerCase()] ?? null)
    : null;

  const namingPosition = naming
    ? (namingAt ?? { left: naming.anchor.right + DOCK_GAP_PX, top: naming.anchor.top })
    : null;

  return (
    <CardGrabContext.Provider value={api}>
      {children}
      {held && dockPosition
        ? createPortal(
            <>
              {/* Fixed position is only reliable outside the editor's own
                  stacking contexts, so both of these are portalled to the
                  body rather than rendered in place. The column's coordinates
                  come from the card's box, which is measured in the same
                  viewport space `position: fixed` resolves against. */}
              {/* Positioned with `translate` rather than `transform` so the
                  stylesheet can own the rotation and the aiming shrink. Both are
                  transitioned; the cursor-follow must not be, and putting them
                  in one `transform` would make the ghost lag the pointer by the
                  transition's duration. */}
              <div
                className={`professor-mtg-grab-ghost${
                  hover ? " professor-mtg-grab-ghost--aiming" : ""
                }`}
                style={{
                  translate: `calc(${held.x}px - 50%) calc(${held.y}px - 50%)`,
                }}
                aria-hidden="true"
              >
                {ghostUrl ? (
                  <img src={ghostUrl} alt="" className="block w-full rounded-[4.5%]" />
                ) : (
                  <span className="professor-mtg-grab-ghost-name">{held.card.name}</span>
                )}
              </div>

              <div
                ref={measureDock}
                className="professor-mtg-grab-dock"
                style={{ left: dockPosition.left, top: dockPosition.top }}
                role="status"
                aria-live="polite"
              >
                <span className="professor-mtg-grab-dock-title">
                  {held.card.name}
                  {held.card.copies > 1 ? ` ×${held.card.copies}` : ""}
                </span>
                <span className="professor-mtg-grab-dock-buckets">
                  {moveBuckets.map((bucket) => (
                    <GrabBucketV1 key={bucket.id} bucket={bucket} over={hover === bucket.id} />
                  ))}
                </span>
                {/* Moving a card and tagging it are different acts, so the two
                    sets are split by a labelled rule instead of running
                    together — mid-drag this column is read out of the corner of
                    your eye. The rule is drawn even on a deck with no tags at
                    all, because New tag is below it and the word is what says
                    what the bucket makes. */}
                <span className="professor-mtg-grab-dock-section">tags</span>
                <span className="professor-mtg-grab-dock-buckets">
                  {tagBuckets.map((bucket) => (
                    <GrabBucketV1 key={bucket.id} bucket={bucket} over={hover === bucket.id} />
                  ))}
                  {/* Last, and outside the cap that truncates the tags above
                      it: New tag is an action rather than one of the tags, so a
                      deck with more tags than the column can show must not be a
                      deck where the way to make another one has disappeared. */}
                  <GrabBucketV1 bucket={NEW_TAG_BUCKET} over={hover === NEW_TAG_BUCKET_ID} />
                </span>
                {hiddenTags > 0 ? (
                  <span className="professor-mtg-grab-dock-note">
                    +{hiddenTags} more under Mark
                  </span>
                ) : null}
                <span className="professor-mtg-grab-dock-escape">esc to cancel</span>
              </div>
            </>,
            document.body,
          )
        : null}

      {naming && namingPosition
        ? createPortal(
            <TagNamePromptV1
              card={naming.card}
              imageUrl={
                imageUrls[naming.card.name] ??
                imageUrls[naming.card.name.toLowerCase()] ??
                null
              }
              position={namingPosition}
              measure={measureNaming}
              onCancel={closeNaming}
              onCommit={(label) => {
                closeNaming();
                onCreateTag(naming.card, label);
              }}
            />,
            document.body,
          )
        : null}
    </CardGrabContext.Provider>
  );
}

/**
 * Naming the tag a card was just dropped on.
 *
 * A field of our own rather than `window.prompt`: the browser's dialog is
 * unstyleable, some contexts block it outright, and it cannot show the card.
 * Showing the card is the point — the ghost vanished with the drop, so without
 * it this is a naming box appearing a beat after a drag with nothing to say
 * which of ninety-nine cards it is about to tag.
 *
 * Enter makes the tag, Escape and an empty name both walk away leaving the card
 * untouched. Nothing is sent until one of those happens.
 */
function TagNamePromptV1({
  card,
  imageUrl,
  position,
  measure,
  onCancel,
  onCommit,
}: {
  card: DeckEditorCard;
  imageUrl: string | null;
  position: { left: number; top: number };
  measure: (node: HTMLDivElement | null) => void;
  onCancel: () => void;
  onCommit: (label: string) => void;
}) {
  const [label, setLabel] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Focused on open so the name can just be typed. The drop put the pointer
  // over a bucket that no longer exists, so there is nothing else here to
  // click and no reason to make someone go looking for the field.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // A press anywhere else is a change of mind, the same as it is for the Mark
  // menu. `pointerdown` rather than `click`, so this cannot race the click the
  // drop leaves behind.
  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!(event.target as HTMLElement | null)?.closest("[data-grab-prompt]")) onCancel();
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [onCancel]);

  const commit = () => {
    const trimmed = label.trim();
    // A blank name is a cancellation rather than an error: someone pressing
    // Enter on an empty box has thought better of it, and telling them off for
    // it would be the second thing this feature ever said to them.
    if (!trimmed) onCancel();
    else onCommit(trimmed);
  };

  return (
    <div
      ref={measure}
      data-grab-prompt=""
      className="professor-mtg-grab-prompt"
      style={{ left: position.left, top: position.top }}
      role="dialog"
      aria-label={`Name a new tag for ${card.name}`}
    >
      <span className="professor-mtg-grab-prompt-card">
        {imageUrl ? (
          <img src={imageUrl} alt="" className="professor-mtg-grab-prompt-art" />
        ) : null}
        <span className="professor-mtg-grab-prompt-name">
          {card.name}
          {card.copies > 1 ? ` ×${card.copies}` : ""}
        </span>
      </span>

      <span className="professor-mtg-grab-prompt-row">
        <input
          ref={inputRef}
          type="text"
          className="professor-mtg-input min-w-0 flex-1 px-2 py-1 text-xs"
          placeholder="Tag name…"
          maxLength={40}
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          onKeyDown={(event) => {
            // Both keys are stopped here rather than left to bubble. Escape
            // would otherwise reach the window listener that puts a held card
            // down — harmless today, since the grab ended with the drop, but
            // this box is one keystroke away from every shortcut the editor
            // owns and none of them should fire while a name is being typed.
            if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              onCancel();
            } else if (event.key === "Enter") {
              event.preventDefault();
              event.stopPropagation();
              commit();
            }
          }}
        />
        <button
          type="button"
          className="professor-mtg-icon-btn"
          disabled={!label.trim()}
          onClick={commit}
        >
          Tag
        </button>
      </span>

      <span className="professor-mtg-grab-prompt-hint">enter to tag · esc to cancel</span>
    </div>
  );
}

function GrabBucketV1({ bucket, over }: { bucket: BucketV1; over: boolean }) {
  return (
    <span
      data-grab-bucket={bucket.id}
      className={`professor-mtg-grab-bucket${
        bucket.tone ? ` professor-mtg-grab-bucket--${bucket.tone}` : ""
      }${bucket.applied ? " professor-mtg-grab-bucket--applied" : ""}${
        over ? " professor-mtg-grab-bucket--over" : ""
      }`}
    >
      <span className="professor-mtg-grab-bucket-label">
        {bucket.applied ? "✓ " : ""}
        {bucket.label}
      </span>
      <span className="professor-mtg-grab-bucket-hint">{bucket.hint}</span>
    </span>
  );
}
