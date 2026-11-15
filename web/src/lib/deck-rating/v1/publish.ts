/**
 * What we are allowed to show. Until goldfish speed checks pass, every band
 * publishes the bracket digit only. Casual public WR is not a W target.
 */
export const DR_W_PUBLISH_CASUAL = false;
export const DR_W_PUBLISH_CEDH = false;
export const DR_W_LABEL = "Speed & consistency vs. typical Bracket N decks.";
export const DR_W_UNPUBLISHED_REASON =
  "Public casual WR is equalized by power-matched tables, so it is not a W target. Goldfish speed W publishes only after B5<B4<B3<B2, precon medians 8–10, and stock vs +Sol Ring pass. cEDH 5xxx stays unpublished until deck features (including goldfish) beat seat+player+commander by >0.01 nats.";

export const DR_W_WITHHELD_DISPLAY = "···";
export const DR_W_WITHHELD_NO_REACHABLE_WIN = "no reachable win line in engine";

export type PublishedDeckRating = {
  bracket: number;
  w: number | null;
  display: string;
  wPublished: boolean;
  label: string | null;
  withheld?: boolean;
  withheldReason?: string;
};

/**
 * B5 decks whose engine has no reachable win (all cards + commanders,
 * unlimited finite mana, resolveWin) are not scored as slow combat decks:
 * W is withheld and the display is "5···" with the reason.
 */
export function publishedDeckRating(
  assignedBracket: 1 | 2 | 3 | 4 | 5,
  W?: number,
  opts?: { b5WinReachable?: boolean; withheldReason?: string },
): PublishedDeckRating {
  if (assignedBracket === 5 && opts?.b5WinReachable === false) {
    return {
      bracket: 5,
      w: null,
      display: `5${DR_W_WITHHELD_DISPLAY}`,
      wPublished: false,
      label: null,
      withheld: true,
      withheldReason: opts.withheldReason ?? DR_W_WITHHELD_NO_REACHABLE_WIN,
    };
  }
  const publish = assignedBracket === 5 ? DR_W_PUBLISH_CEDH : DR_W_PUBLISH_CASUAL;
  if (!publish || W == null) {
    return { bracket: assignedBracket, w: null, display: String(assignedBracket), wPublished: false, label: null };
  }
  return {
    bracket: assignedBracket,
    w: W,
    display: String(1000 * assignedBracket + W),
    wPublished: true,
    label: DR_W_LABEL.replace("N", String(assignedBracket)),
  };
}
