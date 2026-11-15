import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { SpellbookBracketTagV1 } from "./types";

export type ComboBracketTagRowV1 = {
  tag: SpellbookBracketTagV1 | null;
  nTemplates: number;
};

let cached: Map<string, ComboBracketTagRowV1> | null = null;

function tagsPath(): string {
  const candidates = [
    resolve(process.cwd(), "data/milestones/mechanical-space/spellbook-win-architecture-space-v1/combo-bracket-tags-v1.json"),
    resolve(process.cwd(), "web/data/milestones/mechanical-space/spellbook-win-architecture-space-v1/combo-bracket-tags-v1.json"),
  ];
  return candidates.find((path) => existsSync(path)) ?? candidates[0]!;
}

export function loadComboBracketTagsV1(): Map<string, ComboBracketTagRowV1> {
  if (cached) return cached;
  const path = tagsPath();
  const map = new Map<string, ComboBracketTagRowV1>();
  if (!existsSync(path)) {
    cached = map;
    return map;
  }
  const raw = JSON.parse(readFileSync(path, "utf8")) as {
    bySignature?: Record<string, { tag?: string | null; nTemplates?: number }>;
  };
  for (const [signature, row] of Object.entries(raw.bySignature ?? {})) {
    const tag = row.tag;
    map.set(signature, {
      tag: tag === "R" || tag === "S" || tag === "P" || tag === "O" || tag === "C" || tag === "E" || tag === "B"
        ? tag
        : null,
      nTemplates: row.nTemplates ?? 0,
    });
  }
  cached = map;
  return map;
}
