import type { CardSuspect, ImageEvidenceReport } from "./types";
import { getEvidenceSlot, getSlotValue, normalizeText } from "./evidence-utils";
import { setSupportsMasterBallReverse } from "./knowledge/pokemon-patterns";
import {
  clonePokemonPatternSuspect,
  isPokemonNormalFinish,
  isPokemonReverseFinish,
  pokemonPrintingKey,
} from "./pokemon-finish-utils";

export type PokemonReversePatternTrap = {
  printingKey: string;
  setCode?: string;
  setName?: string;
  collectorNumber: string;
  normalSuspect?: CardSuspect;
  reverseSuspect?: CardSuspect;
  masterBallEligible: boolean;
};

function finishEvidenceUnclear(imageEvidence: ImageEvidenceReport): boolean {
  const slot = getEvidenceSlot(imageEvidence, "foil_pattern");
  const value = normalizeText(slot?.value ?? getSlotValue(imageEvidence, "foil_pattern") ?? "");
  if (!value || value === "unknown") return true;
  if (slot && slot.confidence < 0.85) return true;
  return false;
}

/** Normal + reverse (or master-ball-eligible set with unclear finish). */
export function detectPokemonReversePatternTrap(
  suspects: CardSuspect[],
  imageEvidence: ImageEvidenceReport,
): PokemonReversePatternTrap | null {
  const byPrinting = new Map<string, CardSuspect[]>();
  for (const s of suspects) {
    if (s.category !== "pokemon") continue;
    const key = pokemonPrintingKey(s);
    if (!key) continue;
    const list = byPrinting.get(key) ?? [];
    list.push(s);
    byPrinting.set(key, list);
  }

  for (const [printingKey, group] of byPrinting) {
    const normal = group.find((s) => isPokemonNormalFinish(s.finish));
    const reverse = group.find((s) => isPokemonReverseFinish(s.finish));
    const sample = normal ?? reverse ?? group[0];
    if (!sample) continue;

    const masterBallEligible = setSupportsMasterBallReverse(
      sample.setCode,
      sample.setName,
    );

    const hasFinishPair = Boolean(normal && reverse);
    const unclear = finishEvidenceUnclear(imageEvidence);
    const foilSlot = normalizeText(getSlotValue(imageEvidence, "foil_pattern") ?? "");
    const reverseClaimed = foilSlot.includes("reverse");

    if (!hasFinishPair && !(masterBallEligible && (unclear || reverseClaimed))) {
      continue;
    }
    if (!hasFinishPair && !masterBallEligible) continue;

    const [, collectorNumber] = printingKey.split("#");
    if (!collectorNumber) continue;

    return {
      printingKey,
      setCode: sample.setCode,
      setName: sample.setName,
      collectorNumber,
      normalSuspect: normal,
      reverseSuspect: reverse,
      masterBallEligible,
    };
  }

  return null;
}

export function expandPokemonPatternSuspects(
  suspects: CardSuspect[],
  trap: PokemonReversePatternTrap,
): CardSuspect[] {
  if (!trap.masterBallEligible || !trap.reverseSuspect) return suspects;

  const base = trap.reverseSuspect;
  const extras: CardSuspect[] = [];
  const hasMaster = suspects.some((s) =>
    normalizeText(s.finish ?? "").includes("master_ball"),
  );
  const hasPoke = suspects.some((s) =>
    normalizeText(s.finish ?? "").includes("poke_ball"),
  );

  if (!hasMaster) {
    extras.push(
      clonePokemonPatternSuspect(
        base,
        "master_ball_reverse",
        "master_ball",
        "Master Ball reverse",
      ),
    );
  }
  if (!hasPoke) {
    extras.push(
      clonePokemonPatternSuspect(
        base,
        "poke_ball_reverse",
        "poke_ball",
        "Poké Ball reverse",
      ),
    );
  }

  return extras.length ? [...suspects, ...extras] : suspects;
}

export function buildPokemonReversePatternStaffExplanation(input: {
  trap: PokemonReversePatternTrap;
  inspection?: {
    reversePattern: string;
    cropQuality: string;
    attempted: boolean;
  };
}): string {
  const { trap, inspection } = input;
  const patternLabel = !inspection?.attempted
    ? "not run"
    : inspection.reversePattern === "master_ball"
      ? "Master Ball icons (M on ball)"
      : inspection.reversePattern === "poke_ball"
        ? "Poké Ball icons"
        : inspection.reversePattern === "standard_reverse"
          ? "standard reverse pattern"
          : inspection.reversePattern === "none"
            ? "no reverse pattern (normal)"
            : "unclear";

  const lines = [
    `${trap.setName ?? trap.setCode ?? "Set"} #${trap.collectorNumber}: comparing normal vs reverse finish from a static photo.`,
    "We inspect the text box and border for repeating holo patterns — not art-box shine alone.",
    `Reverse pattern inspection: ${patternLabel}${inspection?.attempted ? ` (crop: ${inspection.cropQuality})` : ""}.`,
  ];

  if (trap.masterBallEligible) {
    lines.push(
      "This set can include rare Master Ball and Poké Ball reverse variants — verify pattern before locking.",
    );
  }

  if (inspection?.reversePattern === "master_ball") {
    lines.push("Result: Master Ball reverse pattern detected — prefer Master Ball reverse printing.");
  } else if (inspection?.reversePattern === "poke_ball") {
    lines.push("Result: Poké Ball reverse pattern — prefer Poké Ball reverse over standard reverse.");
  } else if (inspection?.reversePattern === "none" && inspection.cropQuality === "clear") {
    lines.push("Result: No pattern on clear crops — normal/non-holo may be correct.");
  } else if (inspection?.reversePattern === "standard_reverse") {
    lines.push("Result: Standard reverse holo pattern — not Master/Poké Ball variant.");
  } else {
    lines.push("Result: Pattern unclear — keep normal and reverse candidates for staff.");
  }

  return lines.join(" ");
}
