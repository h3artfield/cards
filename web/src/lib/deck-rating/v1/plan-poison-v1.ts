/**
 * What counts as a poison creature, a creature tutor, or land ramp.
 * The plan names the win. These readers stop a dungeon or a land fetch
 * from being treated as a tutor for another snake.
 */
import type { PlanCardV1 } from "./plan-schema-v1";

/** Extra distinct poison creatures that fill the redundancy part. */
export const POISON_REDUNDANCY_SATURATION = 8;

function keywordHead(text: string): string {
  const noReminders = text.replace(/\([^)]*\)/g, " ");
  return (noReminders.split(/[.\n]/)[0] ?? "").trim();
}

function hasKeyword(text: string, keyword: string): boolean {
  return new RegExp(`(?:^|,\\s*)${keyword}(?:\\s*$|,)`, "i").test(keywordHead(text));
}

export function isCreature(card: PlanCardV1): boolean {
  return /\bcreature\b/i.test(card.typeLine);
}

export function keywordDeathtouch(card: PlanCardV1): boolean {
  return hasKeyword(card.text, "deathtouch");
}

export function grantsDeathtouch(card: PlanCardV1): boolean {
  return /creatures you control have deathtouch|attacking creatures you control have deathtouch/i.test(card.text);
}

export function toxicCount(card: PlanCardV1): number {
  const match = card.text.match(/\btoxic\s+(\d+)/i);
  return match ? Number(match[1]) : 0;
}

export function isInfectCreature(card: PlanCardV1): boolean {
  return isCreature(card) && hasKeyword(card.text, "infect");
}

/**
 * Poison this creature adds on a connecting hit once Fynn is on the battlefield.
 * Infect uses power. A saved card with power 0 adds none.
 * A grant such as Ohran Frostfang counts, because the creatures it animates poison with Fynn.
 */
export function poisonYield(card: PlanCardV1): number {
  if (!isCreature(card)) return 0;
  if (isInfectCreature(card)) return Math.max(0, card.power);
  let total = 0;
  if (keywordDeathtouch(card) || grantsDeathtouch(card)) total += 2;
  total += toxicCount(card);
  return total;
}

export function isLandRamp(card: PlanCardV1): boolean {
  if (/\bdungeon\b/i.test(card.typeLine)) return false;
  return /search your library for (?:a |an )?(?:basic land|forest card|land card)/i.test(card.text);
}

export function isCreatureTutor(card: PlanCardV1): boolean {
  if (/\bdungeon\b/i.test(card.typeLine)) return false;
  if (isLandRamp(card)) return false;
  if (!/search your library/i.test(card.text)) return false;
  if (/creature/i.test(card.text)) return true;
  if (/search your library for (?:a |an )?card\b/i.test(card.text)) return true;
  return /\btutor\b/i.test(card.name);
}

/** X tutors and "mana value X or less" can only find a creature the mana paid for. */
export function tutorFetchLimit(card: PlanCardV1, manaSpent: number): number {
  if (/\{x\}/i.test(card.text) || /mana value/i.test(card.text)) return Math.max(0, manaSpent - 1);
  return 99;
}
