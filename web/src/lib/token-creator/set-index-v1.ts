import index from "./set-index-v1.json";
import { unpackLookV1 } from "./set-look-pack-v1";
import type { TokenSetDefaultLookV1, TokenSetIndexEntryV1, TokenSetIndexFileV1 } from "./set-templates-v1";

const file = index as unknown as TokenSetIndexFileV1;

/** Newest first. Regenerate with `npm run token-sets:build`. */
export const TOKEN_SET_INDEX_V1: TokenSetIndexEntryV1[] = file.sets.map(({ look, ...set }) =>
  look ? { ...set, look: unpackLookV1(look) } : set,
);

export function tokenSetIndexEntryV1(code: string | null | undefined): TokenSetIndexEntryV1 | null {
  if (!code) return null;
  return TOKEN_SET_INDEX_V1.find((s) => s.code === code) ?? null;
}

/** The look most sets of an era share, measured across all of them. */
export function tokenSetDefaultLookV1(era: "2015" | "2003"): TokenSetDefaultLookV1 | undefined {
  return file.defaults?.[era];
}
