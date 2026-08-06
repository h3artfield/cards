import type { VisionResult } from "../../types";
import { scorePriceChartingProduct } from "./pricecharting-utils";

export interface PriceChartingProductSummary {
  id?: string;
  "product-name"?: string;
  "console-name"?: string;
}

const NON_SPORTS_CONSOLE = [
  "disney",
  "pokemon",
  "magic:",
  "yugioh",
  "video game",
  "gameboy",
  "nintendo",
  "playstation",
  "xbox",
];

function sportsPlayerLabel(vision: VisionResult): string {
  const player = vision.playerName?.trim();
  if (player) return player;
  const name = vision.cardName?.trim();
  if (name && vision.category === "sports") return name;
  return "";
}

/** Reject PriceCharting hits that don't match the identified player (e.g. Randall vs Wade Boggs). */
export function priceChartingProductMatchesVision(
  product: PriceChartingProductSummary,
  vision: VisionResult,
): boolean {
  const score = scorePriceChartingProduct(product, vision);
  const title = String(product["product-name"] ?? "").toLowerCase();
  const consoleName = String(product["console-name"] ?? "").toLowerCase();

  if (vision.category === "sports") {
    if (NON_SPORTS_CONSOLE.some((term) => consoleName.includes(term))) {
      return false;
    }

    const player = sportsPlayerLabel(vision).toLowerCase();
    if (player) {
      const parts = player.split(/\s+/).filter(Boolean);
      const number = vision.cardNumber?.trim();

      if (parts.length >= 2) {
        const fullName = parts.join(" ");
        const first = parts[0];
        const last = parts[parts.length - 1];

        if (title.includes(fullName)) {
          // full name match
        } else if (
          number &&
          title.includes(last) &&
          new RegExp(`\\b#?${number}\\b`).test(title)
        ) {
          // e.g. "Wade Boggs #50" partial title OK when number matches
        } else if (title.includes(last) && !title.includes(first)) {
          return false;
        } else if (!title.includes(last)) {
          return false;
        }
      } else if (!title.includes(parts[0])) {
        return false;
      }
    }

    return score >= 18;
  }

  return score >= 35;
}
