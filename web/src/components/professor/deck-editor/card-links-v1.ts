/**
 * Outbound links for a single card in the deck editor.
 *
 * Deliberately name-based rather than printing-based. The editor works in
 * oracle cards, so it has no opinion about which printing a player wants, and
 * a search link that lands on the card's page is more honest than guessing a
 * product id and sending someone to the wrong art.
 *
 * The existing buyback TCGplayer helper is not reused here: it resolves through
 * market snapshots and scan suspects, which do not exist on this path.
 */

/** The card's Scryfall page, for oracle text, rulings and printings. */
export function scryfallCardPageUrlV1(name: string): string {
  return `https://scryfall.com/search?q=${encodeURIComponent(`!"${name}"`)}`;
}

/** A TCGplayer search scoped to Magic, for buying a copy. */
export function tcgplayerCardSearchUrlV1(name: string): string {
  return `https://www.tcgplayer.com/search/magic/product?q=${encodeURIComponent(
    name,
  )}&productLineName=magic`;
}

/**
 * The shop's own inventory, filtered to this card.
 *
 * Listed before the external sellers wherever stock exists: the whole point of
 * building a deck inside a card shop is that some of it is on the shelf.
 */
export function storeInventorySearchUrlV1(slug: string, name: string): string {
  return `/s/${encodeURIComponent(slug)}/inventory?q=${encodeURIComponent(name)}`;
}
