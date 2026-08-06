import type { CardSuspect } from "./types";
import { normalizeText } from "./evidence-utils";

export function pokemonPrintingKey(suspect: CardSuspect): string | null {
  const set = suspect.setCode?.trim().toLowerCase() ?? suspect.setName?.trim().toLowerCase();
  const num = suspect.collectorNumber ?? suspect.cardNumber;
  if (!set || !num) return null;
  return `${set}#${num.trim()}`;
}

export function isPokemonNormalFinish(finish: string | undefined): boolean {
  const f = normalizeText(finish ?? "").replace(/_/g, " ");
  return (
    f === "normal" ||
    f.includes("non holo") ||
    f.includes("non-holo") ||
    f === "nonholo" ||
    f.includes("1st edition normal")
  );
}

export function isPokemonReverseFinish(finish: string | undefined): boolean {
  const f = normalizeText(finish ?? "").replace(/_/g, " ");
  return (
    f.includes("reverse") ||
    f === "master ball reverse" ||
    f === "poke ball reverse" ||
    f.includes("master ball") ||
    f.includes("poke ball")
  );
}

export function isPokemonMasterBallFinish(finish: string | undefined): boolean {
  return normalizeText(finish ?? "").replace(/_/g, " ").includes("master ball");
}

export function isPokemonPokeBallFinish(finish: string | undefined): boolean {
  const f = normalizeText(finish ?? "").replace(/_/g, " ");
  return f.includes("poke ball") && !f.includes("master");
}

export function suspectsSharePokemonPrinting(a: CardSuspect, b: CardSuspect): boolean {
  const ka = pokemonPrintingKey(a);
  const kb = pokemonPrintingKey(b);
  return Boolean(ka && kb && ka === kb);
}

export function clonePokemonPatternSuspect(
  base: CardSuspect,
  finish: string,
  variantTag: string,
  labelSuffix: string,
): CardSuspect {
  return {
    ...base,
    suspectId: `${base.suspectId}:${finish}`,
    finish,
    label: `${base.label.replace(/\s*\([^)]+\)\s*$/, "")} · ${labelSuffix}`,
    variantTags: [...new Set([...base.variantTags, variantTag, finish])],
  };
}
