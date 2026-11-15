/**
 * Deck Rating tag-table v1.1 families.
 *
 * Decisions (disagreement review, snapshot 2026-09-25):
 * - ramp: OUR def. Mana production or extra lands onto the battlefield. Not tap-lands.
 * - draw: OUR def. Positive card draw, including cycling. Not "don't/can't draw".
 * - protect: OUR def. Grants hexproof/indestructible/protection/ward to you or others.
 * - interact: OUR def, slightly widened. Answers, not flicker or graveyard exile.
 * - recur: OUR def. Return/cast from graveyard. Not graveyard hate.
 * - tutor: OUR def, widened. Search a library and find cards to hand/battlefield/top.
 */
export const DR_TAG_TABLE_V1_1 = "deck-rating-tag-table-v1.1";

export const DR_TAG_FAMILIES = ["tutor", "draw", "ramp", "interact", "protect", "recur"] as const;
export type DrTagFamily = (typeof DR_TAG_FAMILIES)[number];

const RX_REMINDER = /\([^)]*\)/g;

function stripReminder(text: string): string {
  return text.replace(RX_REMINDER, " ");
}

function isLand(typeLine: string): boolean {
  return /\bland\b/i.test(typeLine) && !/\bcreature\b/i.test(typeLine);
}

function isTokenOrEmblem(typeLine: string): boolean {
  return /\b(token|emblem|sticker|card|dungeon|plane —|phenomenon)\b/i.test(typeLine);
}

export function familiesFromCardV1_1(input: { typeLine?: string; oracleText?: string }): Set<DrTagFamily> {
  const typeLine = input.typeLine ?? "";
  const raw = input.oracleText ?? "";
  const text = stripReminder(raw);
  const hit = new Set<DrTagFamily>();
  if (!text.trim()) return hit;
  if (isTokenOrEmblem(typeLine)) return hit;

  if (isTutor(text)) hit.add("tutor");
  if (isDraw(raw, text)) hit.add("draw");
  if (isRamp(typeLine, text)) hit.add("ramp");
  if (isInteract(text)) hit.add("interact");
  if (isProtect(text)) hit.add("protect");
  if (isRecur(text)) hit.add("recur");
  return hit;
}

function isTutor(text: string): boolean {
  if (!/search (?:your |their |that player's |target player's |each (?:opponent's |player's ))?library/i.test(text)) {
    return false;
  }
  if (/whenever you search/i.test(text) && !/search your library for/i.test(text)) return false;
  if (/ten seconds to search/i.test(text)) return false;
  const finds =
    /put (?:it|them|that card|those cards|the card).*(?:into your hand|onto the battlefield|on top)/i.test(text) ||
    /put (?:it|them|that card).*(?:into (?:your |their )?hand)/i.test(text) ||
    /reveal it, and put it into your hand/i.test(text) ||
    /into your hand, then shuffle/i.test(text);
  const exileOnly = /exile them, then shuffle/i.test(text) && !finds;
  return finds && !exileOnly;
}

function isDraw(raw: string, text: string): boolean {
  if (/\b(can't|don't|do not|instead of) draw(?:ing)? cards?\b/i.test(text)) return false;
  if (/\bskip (?:your |the )?draw\b/i.test(text) && !/\bdraw (?:a card|cards)\b/i.test(text)) return false;
  if (/\bcycling\b/i.test(raw)) return true;
  return (
    /\bdraw (?:a card|cards|x cards|that many cards|two cards|three cards|four cards|seven cards)\b/i.test(text) ||
    /\bdraw cards equal to\b/i.test(text)
  );
}

function isRamp(typeLine: string, text: string): boolean {
  const landToBattlefield = /\bland cards?\b/i.test(text) && /onto the battlefield/i.test(text);
  const extraLands = landToBattlefield && !isOneForOneFetch(typeLine, text);
  const producesMana =
    /(?:^|[.\n])[^{}\n]*\badd \{[wubrgc\d/]+/i.test(text) ||
    /\badd (?:one|two|three|x|that much) mana\b/i.test(text) ||
    /\badd \{[wubrgc]/i.test(text) ||
    /create (?:a |x )?treasure token/i.test(text) ||
    /create (?:a |x )?gold token/i.test(text);
  if (isLand(typeLine)) {
    return extraLands && !isOneForOneFetch(typeLine, text);
  }
  if (/search your library for.*\bland cards?\b.*into your hand/i.test(text) && !producesMana && !extraLands) {
    return false;
  }
  return Boolean(producesMana || extraLands);
}

function isOneForOneFetch(typeLine: string, text: string): boolean {
  if (!isLand(typeLine)) return false;
  return (
    /sacrifice (?:this land|~|{t}).*search your library for.*land.*put (?:it|that card) onto the battlefield/i.test(
      text,
    ) && !/up to two|up to three|two basic land/i.test(text)
  );
}

function isInteract(text: string): boolean {
  const flicker =
    /exile target (?:creature|permanent) you control, then return/i.test(text) ||
    /exile target .* return that (?:card|permanent) to the battlefield/i.test(text);
  if (flicker) return false;
  const gyOnly =
    /exile target (?:card|cards) from (?:a |target player's |an opponent's )?graveyard/i.test(text) &&
    !/destroy target|exile target creature|counter target spell/i.test(text);
  if (gyOnly) return false;
  return (
    /\bcounter target spell\b/i.test(text) ||
    /\bdestroy target\b/i.test(text) ||
    /\bexile target (?:creature|artifact|enchantment|planeswalker|permanent|vehicle)\b/i.test(text) ||
    /\bfight target\b/i.test(text) ||
    /\bdeals? \d+ damage to (?:any target|target creature|target player|target opponent|target planeswalker)/i.test(
      text,
    ) ||
    /\bdestroy all (?:creatures|artifacts|enchantments|planeswalkers|permanents)\b/i.test(text) ||
    /\bexile all (?:creatures|artifacts|permanents)\b/i.test(text) ||
    /each opponent sacrifices (?:a |one )?creature/i.test(text) ||
    /return target (?:creature|permanent|nonland permanent) to (?:its|their) owner's hand/i.test(text)
  );
}

function isProtect(text: string): boolean {
  const grants =
    /(?:gains?|get|have|has) (?:hexproof|shroud|indestructible|protection|ward)\b/i.test(text) ||
    /(?:creatures|permanents) you control (?:gain|have|get) (?:hexproof|shroud|indestructible|protection|ward)\b/i.test(
      text,
    ) ||
    /equipped creature (?:gets?|has) .*?\b(?:hexproof|shroud|indestructible|ward|protection)\b/i.test(text);
  const you =
    /\byou (?:gain|have) (?:hexproof|shroud|protection|indestructible)\b/i.test(text) ||
    /\bhexproof from\b/i.test(text) && /you have/i.test(text);
  const counterTargeting = /counter target spell that targets/i.test(text);
  const selfOnly =
    /^(?:[^\n]*\b(?:hexproof|indestructible|protection from|ward)\b[^\n]*\n?)+$/i.test(text.trim()) &&
    !grants &&
    !you;
  if (selfOnly) return false;
  return Boolean(grants || you || counterTargeting);
}

function isRecur(text: string): boolean {
  if (/\bexile (?:all cards from|target .* from) (?:all |a |target player's )?graveyards?\b/i.test(text)) return false;
  return (
    /return .* from (?:your )?graveyard to (?:your hand|the battlefield|your library)/i.test(text) ||
    /return this card from your graveyard/i.test(text) ||
    /\bflashback\b/i.test(text) ||
    /\bunearth\b/i.test(text) ||
    /\bescape\b/i.test(text) ||
    /\beternalize\b/i.test(text) ||
    /\bdredge\b/i.test(text) ||
    /cast (?:it|this (?:card|spell)|that card) from (?:your )?graveyard/i.test(text)
  );
}
