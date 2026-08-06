import {
  fetchScryfallBySetAndNumber,
  searchScryfallCards,
} from "../processing/scryfall-client";
import { findCatalogCandidates } from "../processing/pricing";
import { resolveMtgVisionSetCode } from "../processing/mtg-catalog-set";
import type { VisionResult } from "../types";
import type { CardSuspect, ImageEvidenceReport } from "./types";
import { catalogMatchToSuspects } from "./catalog-normalizers";
import { evidenceToVisionHint, getSlotValue, mergeVisionHintFallback } from "./evidence-utils";
import {
  evidenceOriginRef,
  isTheListSuspect,
  listOriginRefMatchesEvidence,
  parseListOriginRef,
} from "./mtg-suspect-scoring-shared";

const MAX_PLST_BY_NAME = 8;
const MAX_SUSPECTS = 12;

function dedupeSuspects(suspects: CardSuspect[]): CardSuspect[] {
  const seen = new Set<string>();
  const out: CardSuspect[] = [];
  for (const s of suspects) {
    if (seen.has(s.suspectId)) continue;
    seen.add(s.suspectId);
    out.push(s);
  }
  return out;
}

function addScryfallCards(
  pool: CardSuspect[],
  seen: Set<string>,
  cards: Record<string, unknown>[],
): number {
  let added = 0;
  for (const card of cards) {
    const converted = catalogMatchToSuspects(card, "scryfall", "mtg", {
      graded: false,
    });
    for (const suspect of converted) {
      if (seen.has(suspect.suspectId)) continue;
      seen.add(suspect.suspectId);
      pool.push(suspect);
      added += 1;
    }
  }
  return added;
}

function resolveOriginRef(imageEvidence: ImageEvidenceReport): {
  setCode: string;
  number: string;
} | null {
  const collector =
    getSlotValue(imageEvidence, "collector_number") ??
    getSlotValue(imageEvidence, "card_number");
  const fromCollector = parseListOriginRef(collector);
  if (fromCollector) return fromCollector;

  const ev = evidenceOriginRef(imageEvidence);
  if (ev.setCode && ev.number) {
    return { setCode: ev.setCode, number: ev.number };
  }
  return null;
}

/** Fetch plst printings when evidence suggests The List and inject into suspect pool. */
export async function injectMtgPlstSuspects(
  suspects: CardSuspect[],
  imageEvidence: ImageEvidenceReport,
): Promise<{ suspects: CardSuspect[]; notes: string[] }> {
  const notes: string[] = [];
  const seen = new Set(suspects.map((s) => s.suspectId));
  const pool = [...suspects];

  const cardName = getSlotValue(imageEvidence, "card_name");
  if (cardName) {
    const listPrints = await searchScryfallCards(
      `set:plst !"${cardName.replace(/"/g, "")}"`,
    );
    const added = addScryfallCards(pool, seen, listPrints.slice(0, MAX_PLST_BY_NAME));
    if (added > 0) {
      notes.push(
        `Evidence-driven plst search by name added ${added} suspect(s).`,
      );
    }
  }

  const originRef = resolveOriginRef(imageEvidence);
  if (originRef) {
    const plstKey = `${originRef.setCode}-${originRef.number}`;
    const exact = await fetchScryfallBySetAndNumber("plst", plstKey);
    if (exact) {
      const added = addScryfallCards(pool, seen, [exact as Record<string, unknown>]);
      if (added > 0) {
        notes.push(`plst exact match for origin ref ${plstKey}.`);
      }
    }
    const searchHits = await searchScryfallCards(`set:plst cn:${plstKey}`);
    const added = addScryfallCards(pool, seen, searchHits.slice(0, 4));
    if (added > 0) {
      notes.push(`plst origin-ref search ${plstKey} added ${added} suspect(s).`);
    }
  }

  const hasPlst = pool.some(isTheListSuspect);
  if (!hasPlst && !notes.length) {
    notes.push("The List investigation ran but no plst catalog hits were found.");
  }

  const matchingPlst = pool.filter(
    (s) => isTheListSuspect(s) && listOriginRefMatchesEvidence(s, imageEvidence),
  );
  if (matchingPlst.length > 0) {
    notes.push(
      `${matchingPlst.length} plst suspect(s) match bottom-line origin reference.`,
    );
  }

  return {
    suspects: dedupeSuspects(pool).slice(0, MAX_SUSPECTS),
    notes,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Last-resort MTG catalog recovery when primary search returns zero suspects. */
export async function recoverMtgCatalogSuspects(input: {
  imageEvidence: ImageEvidenceReport;
  visionFallback?: Partial<VisionResult>;
}): Promise<{ suspects: CardSuspect[]; notes: string[] }> {
  const notes: string[] = [];
  const vision = mergeVisionHintFallback(
    evidenceToVisionHint(input.imageEvidence, "mtg"),
    input.visionFallback,
  );
  const catalogVision = await resolveMtgVisionSetCode({
    ...vision,
    category: "magic",
  });

  for (let attempt = 0; attempt < 3; attempt++) {
    const matches = await findCatalogCandidates(catalogVision, MAX_SUSPECTS);
    if (matches.length) {
      const suspects: CardSuspect[] = [];
      for (const match of matches) {
        suspects.push(
          ...catalogMatchToSuspects(match.raw, match.source, "mtg", {
            graded: false,
          }),
        );
      }
      notes.push(
        `Catalog recovery attempt ${attempt + 1} returned ${suspects.length} suspect(s).`,
      );
      return { suspects: dedupeSuspects(suspects).slice(0, MAX_SUSPECTS), notes };
    }
    if (attempt < 2) await sleep(400 * (attempt + 1));
  }

  const pool: CardSuspect[] = [];
  const seen = new Set<string>();
  const cardName = catalogVision.cardName?.trim();
  if (cardName) {
    const byName = await searchScryfallCards(`!"${cardName.replace(/"/g, "")}"`);
    const added = addScryfallCards(pool, seen, byName.slice(0, MAX_SUSPECTS));
    if (added > 0) {
      notes.push(`Recovery name search added ${added} suspect(s).`);
    }
  }

  const plst = await injectMtgPlstSuspects(pool, input.imageEvidence);
  if (plst.suspects.length > pool.length) {
    notes.push(...plst.notes);
  }

  return {
    suspects: plst.suspects.slice(0, MAX_SUSPECTS),
    notes:
      plst.suspects.length > 0
        ? notes
        : [...notes, "Catalog recovery found no MTG suspects."],
  };
}
