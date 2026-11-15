/**
 * Server-only: which cards in a deck work with which other cards.
 *
 * Three sources, deliberately ranked and labelled separately rather than fused
 * into one opaque number:
 *
 *  - `combo`   a verified CommanderSpellbook line both cards appear in. This is
 *              the only kind that is a fact rather than an inference, so it is
 *              ranked first and reuses the same detector the bracket rubric and
 *              COS use, meaning all three agree on what a combo is.
 *  - `package` the Professor put both cards in the same strategic package while
 *              building the deck, i.e. they were chosen to work together.
 *  - `role`    both cards derive the same functional role from their oracle
 *              text. This is the weakest signal and says "these do a similar
 *              job", which is not the same as synergy — the semantic map's own
 *              manifest warns about exactly this conflation, so it is labelled
 *              as shared function and never called a combo.
 *
 * Semantic nearest neighbours are intentionally not a source. They would be a
 * fourth flavour of "similar", and the artifact is ~17 MB against the 4.5 MB
 * points cache this already shares with the grouping enrichment.
 */
import { comboSummaryForDeck } from "@/lib/commander-bracket-rubric/v1/combos-server";
import type { BracketRubricCard } from "@/lib/commander-bracket-rubric/v1/types";
import { derivedRoleLabelV1 } from "./semantic-labels-v1";
import type { DeckEditorSemanticFactsV1 } from "./semantic-facts-v1";
import type { EditableDeckCardV1, EditableDeckV1 } from "./types-v1";

export type SynergyKindV1 = "combo" | "package" | "role";

export type SynergyLinkV1 = {
  /** The other card in the relationship. */
  cardKey: string;
  name: string;
  kind: SynergyKindV1;
  /** Why these two are linked, phrased for a tooltip. */
  detail: string;
};

export type DeckSynergyIndexV1 = {
  /** cardKey -> everything it works with, strongest kind first. */
  linksByCardKey: Record<string, SynergyLinkV1[]>;
  /** Verified combo lines found in the deck, for the summary line. */
  comboCount: number;
  /** True when the semantic map was unavailable, so `role` links are absent. */
  semanticUnavailable: boolean;
};

/**
 * The verified-combo lookup, injectable so tests can exercise the ranking rules
 * without the ~100 MB artifact pair the real detector reads.
 */
export type ComboSourceV1 = (args: { cards: BracketRubricCard[] }) => Promise<{
  comboSets?: Array<{
    cards: Array<{ oracleId: string; name: string }>;
    winsOnResolution: boolean;
  }>;
}>;

const KIND_RANK_V1: Record<SynergyKindV1, number> = { combo: 0, package: 1, role: 2 };

type CardWithSemantics = EditableDeckCardV1 & { semantic?: DeckEditorSemanticFactsV1 };

/**
 * Roles too broad to imply synergy.
 *
 * Half a Commander deck draws cards and makes mana, so linking on those would
 * highlight most of the deck and mean nothing. Excluding them is what keeps a
 * click on a ramp piece from lighting up forty cards.
 */
const TOO_COMMON_FOR_SYNERGY_V1 = new Set([
  "card_draw",
  "card_advantage",
  "mana_generation",
  "ramp",
  "removal",
  "board_interaction",
  "protection",
]);

/** Roles above this share of the deck are treated as structural, not synergy. */
const ROLE_UBIQUITY_LIMIT_V1 = 0.25;

export async function buildDeckSynergyIndexV1(args: {
  deck: EditableDeckV1;
  cards: readonly CardWithSemantics[];
  comboSource?: ComboSourceV1;
}): Promise<DeckSynergyIndexV1> {
  const { deck } = args;
  const comboSource = args.comboSource ?? comboSummaryForDeck;
  // Only cards actually in the deck can combo with each other; a card parked in
  // Considering is not part of a line yet.
  const cards = args.cards.filter((card) => card.board === "mainboard");
  const buckets = new Map<string, SynergyLinkV1[]>();

  const add = (fromKey: string, link: SynergyLinkV1) => {
    const bucket = buckets.get(fromKey);
    if (bucket) bucket.push(link);
    else buckets.set(fromKey, [link]);
  };
  const addPair = (a: CardWithSemantics, b: CardWithSemantics, kind: SynergyKindV1, detail: string) => {
    add(a.cardKey, { cardKey: b.cardKey, name: b.name, kind, detail });
    add(b.cardKey, { cardKey: a.cardKey, name: a.name, kind, detail });
  };

  // --- verified combos ------------------------------------------------------
  let comboCount = 0;
  const byOracleId = new Map<string, CardWithSemantics>();
  for (const card of cards) {
    if (card.oracleId) byOracleId.set(card.oracleId, card);
  }
  try {
    // The detector matches on oracle id alone, so the text fields of the rubric
    // card contract are filled in as blanks rather than fetched — this path
    // deliberately avoids a second catalogue read.
    const summary = await comboSource({
      cards: [
        {
          oracleId: deck.commander.oracleId,
          name: deck.commander.name,
          typeLine: "",
          oracleText: "",
          quantity: 1,
          isCommander: true,
        },
        ...cards
          .filter((card) => card.oracleId)
          .map((card) => ({
            oracleId: card.oracleId as string,
            name: card.name,
            typeLine: "",
            oracleText: "",
            quantity: card.copies,
            isCommander: false,
          })),
      ],
    });
    const comboSets = summary.comboSets ?? [];
    comboCount = comboSets.length;
    for (const set of comboSets) {
      // The commander is in the signature but is not an editable card, so it is
      // named in the tooltip rather than linked to.
      const members = set.cards
        .map((entry) => byOracleId.get(entry.oracleId))
        .filter((card): card is CardWithSemantics => Boolean(card));
      const commanderInLine = set.cards.some(
        (entry) => entry.oracleId === deck.commander.oracleId,
      );
      const label = set.cards.map((entry) => entry.name).join(" + ");
      const detail = set.winsOnResolution
        ? `Wins the game: ${label}`
        : `Verified combo: ${label}`;
      for (let i = 0; i < members.length; i += 1) {
        for (let j = i + 1; j < members.length; j += 1) {
          addPair(members[i], members[j], "combo", detail);
        }
      }
      // A two-card line where one card is the commander still matters to the
      // one editable card in it, so it is recorded against that card alone.
      if (commanderInLine && members.length === 1) {
        add(members[0].cardKey, {
          cardKey: `commander:${deck.commander.oracleId}`,
          name: deck.commander.name,
          kind: "combo",
          detail,
        });
      }
    }
  } catch {
    // Combo artifacts missing or unreadable: the other two sources still work,
    // and a synergy view without verified lines beats a failed request.
    comboCount = 0;
  }

  // --- Professor packages ---------------------------------------------------
  const packageMembers = new Map<string, CardWithSemantics[]>();
  for (const card of cards) {
    for (const name of card.professor?.packageMembership ?? []) {
      const key = name.trim().toLowerCase();
      if (!key) continue;
      const bucket = packageMembers.get(key) ?? [];
      bucket.push(card);
      packageMembers.set(key, bucket);
    }
  }
  for (const [, members] of packageMembers) {
    if (members.length < 2) continue;
    const label = members[0].professor?.packageMembership?.[0] ?? "the same package";
    for (let i = 0; i < members.length; i += 1) {
      for (let j = i + 1; j < members.length; j += 1) {
        addPair(members[i], members[j], "package", `Built together as ${label}`);
      }
    }
  }

  // --- shared derived roles -------------------------------------------------
  const semanticUnavailable = cards.every((card) => !card.semantic?.derivedRoles?.length);
  const roleMembers = new Map<string, CardWithSemantics[]>();
  for (const card of cards) {
    for (const role of card.semantic?.derivedRoles ?? []) {
      if (TOO_COMMON_FOR_SYNERGY_V1.has(role)) continue;
      const bucket = roleMembers.get(role) ?? [];
      bucket.push(card);
      roleMembers.set(role, bucket);
    }
  }
  const ubiquityCeiling = Math.max(2, Math.floor(cards.length * ROLE_UBIQUITY_LIMIT_V1));
  for (const [role, members] of roleMembers) {
    // A role held by a quarter of the deck describes the deck, not a synergy.
    if (members.length < 2 || members.length > ubiquityCeiling) continue;
    const detail = `Both ${derivedRoleLabelV1(role).toLowerCase()}`;
    for (let i = 0; i < members.length; i += 1) {
      for (let j = i + 1; j < members.length; j += 1) {
        addPair(members[i], members[j], "role", detail);
      }
    }
  }

  // --- collapse ------------------------------------------------------------
  const linksByCardKey: Record<string, SynergyLinkV1[]> = {};
  for (const [cardKey, links] of buckets) {
    // One row per partner, keeping the strongest reason. Two cards in a
    // verified line that also share a package should read as a combo.
    const strongest = new Map<string, SynergyLinkV1>();
    for (const link of links) {
      const existing = strongest.get(link.cardKey);
      if (!existing || KIND_RANK_V1[link.kind] < KIND_RANK_V1[existing.kind]) {
        strongest.set(link.cardKey, link);
      }
    }
    linksByCardKey[cardKey] = [...strongest.values()].sort(
      (a, b) => KIND_RANK_V1[a.kind] - KIND_RANK_V1[b.kind] || a.name.localeCompare(b.name),
    );
  }

  return { linksByCardKey, comboCount, semanticUnavailable };
}
