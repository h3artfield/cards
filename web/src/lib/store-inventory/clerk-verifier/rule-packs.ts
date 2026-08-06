import type { ClerkFormat, ClerkGame } from "../clerk-types";
import type { FormatRulePack } from "./types";

export function getFormatRulePack(
  game: ClerkGame,
  format: ClerkFormat,
): FormatRulePack | null {
  if (game === "magic" && format === "commander") {
    return {
      formatKey: "mtg_commander",
      requirements: {
        total_cards: 100,
        commander_count: 1,
        singleton: true,
        color_identity_must_match: true,
        commander_must_be_legal: true,
        banlist_must_be_checked: true,
      },
    };
  }

  if (game === "pokemon" && (format === "standard" || format === "expanded")) {
    return {
      formatKey: "pokemon_standard",
      requirements: {
        total_cards: 60,
        maximum_same_name: 4,
        basic_energy_exception: true,
        regulation_mark_check: true,
        event_date_required_for_legality: true,
      },
    };
  }

  if (game === "yugioh") {
    return {
      formatKey: "yugioh_advanced",
      requirements: {
        main_deck_minimum: 40,
        main_deck_maximum: 60,
        extra_deck_maximum: 15,
        side_deck_maximum: 15,
        forbidden_limited_list_check: true,
      },
    };
  }

  return null;
}
