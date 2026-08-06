import type { CardCatalogHit } from "../../clerk-types";
import type { ClerkRouterResult, SpecialistResponse } from "../../clerk-types";
import {
  cardCatalogLookupById,
  cardCatalogLookupByName,
} from "../../clerk-tools/card-catalog";
import {
  isLegalCommanderStrict,
  passesCommanderColor,
  passesCommanderPrice,
} from "../../clerk-tools/commander-eligibility";
import { parseColorFromQuestion } from "../../clerk-tools/magic-commander-inventory";
import type { FormatRulePack } from "../types";
import type { VerifiedClaim, VerifierCheckDetail } from "../types";

async function resolveCatalog(
  rec: { card_name: string; scryfallId?: string },
  catalogById: Map<string, CardCatalogHit>,
  catalogByName: Map<string, CardCatalogHit>,
): Promise<CardCatalogHit | null> {
  if (rec.scryfallId) {
    const cached = catalogById.get(rec.scryfallId);
    if (cached) return cached;
    const fetched = await cardCatalogLookupById(rec.scryfallId);
    if (fetched) catalogById.set(fetched.scryfallId, fetched);
    return fetched;
  }
  const key = rec.card_name.toLowerCase();
  const cached = catalogByName.get(key);
  if (cached) return cached;
  const fetched = await cardCatalogLookupByName(rec.card_name);
  if (fetched) {
    catalogByName.set(fetched.name.toLowerCase(), fetched);
    catalogById.set(fetched.scryfallId, fetched);
  }
  return fetched;
}

export async function checkRulesAndLegality(input: {
  route: ClerkRouterResult;
  specialist: SpecialistResponse | null;
  rulePack: FormatRulePack | null;
  userQuestion: string;
  catalogHits: CardCatalogHit[];
}): Promise<{
  check: VerifierCheckDetail;
  hardFailures: string[];
  claims: VerifiedClaim[];
}> {
  const hardFailures: string[] = [];
  const claims: VerifiedClaim[] = [];
  const warnings: string[] = [];

  if (!input.specialist || !input.rulePack) {
    return {
      check: { score: 100, passed: true },
      hardFailures,
      claims,
    };
  }

  const catalogById = new Map(
    input.catalogHits.map((c) => [c.scryfallId, c]),
  );
  const catalogByName = new Map(
    input.catalogHits.map((c) => [c.name.toLowerCase(), c]),
  );

  if (input.rulePack.formatKey === "mtg_commander") {
    const colorFilter = parseColorFromQuestion(input.userQuestion);
    const maxPrice =
      input.route.constraints.max_price ?? input.route.constraints.budget;

    if (
      input.route.intent === "recommendation" ||
      (input.route.intent === "build_deck" && !input.specialist.deckList)
    ) {
      for (const rec of input.specialist.recommendations) {
        const catalog = await resolveCatalog(rec, catalogById, catalogByName);
        if (!catalog) {
          warnings.push(`Could not verify card database entry for "${rec.card_name}".`);
          continue;
        }

        if (!isLegalCommanderStrict(catalog)) {
          hardFailures.push(
            `"${rec.card_name}" cannot legally be used as a commander.`,
          );
          claims.push({
            claim: `${rec.card_name} can legally be a Commander.`,
            source_type: "card_database",
            source_id: catalog.scryfallId,
            verified: false,
          });
        } else {
          claims.push({
            claim: `${rec.card_name} can legally be a Commander.`,
            source_type: "card_database",
            source_id: catalog.scryfallId,
            verified: true,
          });
        }

        if (
          colorFilter !== "all" &&
          !passesCommanderColor(catalog.colorIdentity ?? [], colorFilter)
        ) {
          hardFailures.push(
            `"${rec.card_name}" does not match the requested color identity.`,
          );
        }

        if (rec.price != null && maxPrice != null && rec.price > maxPrice) {
          hardFailures.push(
            `"${rec.card_name}" exceeds the requested price limit ($${maxPrice}).`,
          );
        }
      }
    }

    const deck = input.specialist.deckList;
    if (deck && input.route.intent === "build_deck") {
      if (deck.validationIssues?.length) {
        for (const issue of deck.validationIssues.slice(0, 5)) {
          hardFailures.push(`Deck validation: ${issue}`);
        }
      }

      if (deck.complete === true && (deck.mainDeckCount ?? 0) !== 99) {
        hardFailures.push(
          `Deck marked complete but maindeck count is ${deck.mainDeckCount ?? 0}/99.`,
        );
      }

      const commanderLine = deck.lines.find((l) => l.category === "commander");
      if (commanderLine) {
        const catalog = await resolveCatalog(
          { card_name: commanderLine.name, scryfallId: undefined },
          catalogById,
          catalogByName,
        );
        if (catalog && !isLegalCommanderStrict(catalog)) {
          hardFailures.push(
            `Commander "${commanderLine.name}" is not legal in the command zone.`,
          );
        }
      } else {
        hardFailures.push("Commander deck is missing a commander card.");
      }

      if (!deck.complete && deck.missingSlots.length === 0) {
        warnings.push(
          "Incomplete deck without missing-slot markers — deck-level legality could not be fully validated.",
        );
      }
    }
  }

  if (input.rulePack.formatKey === "pokemon_standard" && input.specialist.deckList) {
    const deck = input.specialist.deckList;
    const nameCounts = new Map<string, number>();
    for (const line of deck.lines.filter((l) => l.inStock)) {
      const key = line.name.toLowerCase();
      nameCounts.set(key, (nameCounts.get(key) ?? 0) + line.qty);
    }
    for (const [name, count] of nameCounts) {
      const isBasicEnergy = name.includes("basic") && name.includes("energy");
      if (!isBasicEnergy && count > 4) {
        hardFailures.push(
          `Pokémon deck has ${count} copies of "${name}" (max 4).`,
        );
      }
    }
    warnings.push(
      "Regulation-mark validation for a specific tournament date is not automated yet.",
    );
  }

  const passed = hardFailures.length === 0;
  return {
    check: {
      score: passed ? (warnings.length ? 85 : 100) : Math.max(0, 100 - hardFailures.length * 20),
      passed,
      warnings: warnings.length ? warnings : undefined,
    },
    hardFailures,
    claims,
  };
}
