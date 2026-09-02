import type { CosV1ArchitectureFingerprint } from "./types";

export type CosV1ComboRow = {
  cardSetSignature: string;
  comboCardCount: number;
  terminalFeatureIds: string[];
  enablingFeatureIds: string[];
  terminalBuckets: string[];
  enablingBuckets: string[];
  isTerminalRoute: boolean;
  isResourceOnlyLoop: boolean;
  nTemplates: number;
  manaNeededValues: unknown[];
  manaValueNeeded: unknown[];
  zoneLocations: Record<string, number>;
  hasEasyPrereq: boolean;
  hasNotablePrereq: boolean;
};

export type CosV1CompleteHit = {
  cardSetSignature: string;
  commanderInvolved: boolean;
};

export function architectureFromHits(
  hits: CosV1CompleteHit[],
  comboIndex: Map<string, CosV1ComboRow>,
  nNativeVariants: number,
): CosV1ArchitectureFingerprint {
  const seen = new Set<string>();
  const sigs: string[] = [];
  for (const h of hits) {
    if (!h.cardSetSignature || seen.has(h.cardSetSignature)) continue;
    seen.add(h.cardSetSignature);
    sigs.push(h.cardSetSignature);
  }

  let n2 = 0;
  let n3 = 0;
  let n4 = 0;
  let nCmd = 0;
  const termIds = new Set<string>();
  const enabIds = new Set<string>();
  const tBuck = new Set<string>();
  const eBuck = new Set<string>();
  let nTermR = 0;
  let nResR = 0;
  let nPrereq = 0;
  let nMana = 0;
  const zones: Record<string, number> = {};
  const cardHits = new Map<string, number>();
  let minC: number | null = null;

  for (const sig of sigs) {
    const d = comboIndex.get(sig);
    if (!d) continue;
    const k = d.comboCardCount;
    minC = minC == null ? k : Math.min(minC, k);
    if (k === 2) n2 += 1;
    else if (k === 3) n3 += 1;
    else if (k >= 4) n4 += 1;
    if (hits.some((h) => h.cardSetSignature === sig && h.commanderInvolved)) nCmd += 1;
    for (const id of d.terminalFeatureIds) termIds.add(id);
    for (const id of d.enablingFeatureIds) enabIds.add(id);
    for (const b of d.terminalBuckets) tBuck.add(b);
    for (const b of d.enablingBuckets) eBuck.add(b);
    if (d.isTerminalRoute) nTermR += 1;
    if (d.isResourceOnlyLoop) nResR += 1;
    if (d.hasEasyPrereq || d.hasNotablePrereq || d.nTemplates > 0) nPrereq += 1;
    if (d.manaNeededValues.length || d.manaValueNeeded.some((x) => x !== 0 && x != null)) nMana += 1;
    for (const [z, n] of Object.entries(d.zoneLocations || {})) {
      zones[z] = (zones[z] ?? 0) + Number(n || 0);
    }
    for (const oid of sig.split("|")) {
      if (oid) cardHits.set(oid, (cardHits.get(oid) ?? 0) + 1);
    }
  }

  const nSet = sigs.length;
  const sharedN = [...cardHits.values()].filter((c) => c > 1).length;
  const topShare = nSet && cardHits.size ? Math.max(...cardHits.values()) / nSet : 0;
  const cmdMode =
    nSet === 0 ? "NONE" : nCmd === 0 ? "COMMANDER_INDEPENDENT" : nCmd === nSet ? "COMMANDER_DEPENDENT" : "MIXED";

  return {
    nNormalizedCombos: nSet,
    nNativeVariants,
    minComboCardCount: minC,
    nTwoCard: n2,
    nThreeCard: n3,
    nFourPlusCard: n4,
    nCommanderInvolved: nCmd,
    fractionCommanderInvolved: nSet ? nCmd / nSet : 0,
    commanderDependence: cmdMode,
    terminalBuckets: [...tBuck].sort(),
    enablingBuckets: [...eBuck].sort(),
    nTerminalRoutes: nTermR,
    nResourceOnlyLoops: nResR,
    nCardsInMultipleComboSets: sharedN,
    sharedPieceConcentration: topShare,
    nCombosWithPrereqOrTemplate: nPrereq,
    nCombosWithManaNeeded: nMana,
    zoneProfile: zones,
    hasTerminal: tBuck.size > 0,
  };
}
