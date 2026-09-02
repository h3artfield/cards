export type CosV1CompiledVariant = {
  requiredOracleIds: string[];
  cardSetSignature: string;
  mustBeCommanderOracleIds?: string[];
};

/** CARD_COMPLETE detector. Missing exactly one is ignored. zero complete is valid. */
export function detectCompleteCombos(args: {
  deckOracleIds: Set<string>;
  commanderOracleIds: Set<string>;
  compiled: CosV1CompiledVariant[];
}): { hits: Array<{ cardSetSignature: string; commanderInvolved: boolean }>; nNativeVariants: number } {
  const present = new Set([...args.deckOracleIds, ...args.commanderOracleIds]);
  const hits: Array<{ cardSetSignature: string; commanderInvolved: boolean }> = [];
  for (const v of args.compiled) {
    if (!v.requiredOracleIds.length) continue;
    if (v.requiredOracleIds.some((oid) => !present.has(oid))) continue;
    hits.push({
      cardSetSignature: v.cardSetSignature,
      commanderInvolved:
        v.requiredOracleIds.some((oid) => args.commanderOracleIds.has(oid)) ||
        (v.mustBeCommanderOracleIds ?? []).some((oid) => present.has(oid)),
    });
  }
  return { hits, nNativeVariants: hits.length };
}
