import type { CosV1AccessFeatures } from "./types";

export const RX_TUTOR = /search your library/i;
export const RX_DRAW = /draw (?:a card|cards|x cards|two cards|three cards)/i;
export const RX_RAMP = /search your library for (?:a |up to .* )?(?:basic )?land|add \{[wubrgc\d]/i;
export const RX_INTERACT =
  /counter target|destroy target|exile target|fight target|deal \d+ damage to (?:any target|target)/i;
export const RX_PROTECT = /\bhexproof\b|\bindestructible\b|protection from|\bward\b|counter target spell that targets/i;
export const RX_RECUR = /from (?:your )?graveyard|reanimate|flashback|unearth|escape|return .* graveyard/i;

export type CosV1CatalogPoint = {
  name?: string;
  colorIdentity?: string[];
  manaValue?: number | null;
  typeLine?: string;
  clusterId?: number | null;
};

export function familiesFromText(text: string): Set<string> {
  const hit = new Set<string>();
  if (!text) return hit;
  if (RX_TUTOR.test(text)) hit.add("tutor");
  if (RX_DRAW.test(text)) hit.add("draw");
  if (RX_RAMP.test(text)) hit.add("ramp");
  if (RX_INTERACT.test(text)) hit.add("interact");
  if (RX_PROTECT.test(text)) hit.add("protect");
  if (RX_RECUR.test(text)) hit.add("recur");
  return hit;
}

export function accessFeatures(args: {
  commanderOracleIds: string[];
  mainboard: Array<{ oracleId: string; quantity: number }>;
  points: Map<string, CosV1CatalogPoint>;
  texts: Map<string, string>;
  sharedConc: number;
}): CosV1AccessFeatures {
  let land = 0;
  let nonland = 0;
  let inst = 0;
  let compress = 0;
  const fam: Record<string, number> = {
    tutor: 0,
    draw: 0,
    ramp: 0,
    interact: 0,
    protect: 0,
    recur: 0,
  };
  const mvs: number[] = [];
  const clusters: number[] = [];

  for (const card of args.mainboard) {
    const q = card.quantity || 1;
    const pt = args.points.get(card.oracleId);
    const tl = (pt?.typeLine ?? "").toLowerCase();
    const isLand = tl.includes("land");
    if (isLand) land += q;
    else {
      nonland += q;
      if (pt?.manaValue != null) {
        for (let i = 0; i < q; i++) mvs.push(Number(pt.manaValue));
      }
      if (tl.includes("instant") || tl.includes("sorcery")) inst += q;
    }
    if (pt?.clusterId != null) {
      for (let i = 0; i < q; i++) clusters.push(Number(pt.clusterId));
    }
    const hits = familiesFromText(args.texts.get(card.oracleId) ?? "");
    for (const h of hits) fam[h] = (fam[h] ?? 0) + q;
    if (hits.size >= 2) compress += q;
  }

  const tot = Math.max(land + nonland, 1);
  const nl = Math.max(nonland, 1);
  let clEnt = 0;
  if (clusters.length) {
    const c = new Map<number, number>();
    for (const id of clusters) c.set(id, (c.get(id) ?? 0) + 1);
    const n = clusters.length;
    for (const v of c.values()) {
      const p = v / n;
      clEnt -= p * Math.log2(p);
    }
  }
  const meanMv = mvs.length ? mvs.reduce((a, b) => a + b, 0) / mvs.length : 0;
  return {
    meanMvNonland: meanMv,
    fracMvLe2: mvs.length ? mvs.filter((x) => x <= 2).length / mvs.length : 0,
    landFrac: land / tot,
    instantSorceryFrac: inst / tot,
    tutorFrac: fam.tutor! / nl,
    drawFrac: fam.draw! / nl,
    rampFrac: fam.ramp! / nl,
    interactFrac: fam.interact! / nl,
    protectFrac: fam.protect! / nl,
    recurFrac: fam.recur! / nl,
    roleCompressFrac: compress / nl,
    clusterEntropy: clEnt,
    sharedConc: args.sharedConc,
  };
}

export function accessVector(feat: CosV1AccessFeatures): number[] {
  return [
    feat.meanMvNonland,
    feat.fracMvLe2,
    feat.landFrac,
    feat.instantSorceryFrac,
    feat.tutorFrac,
    feat.drawFrac,
    feat.rampFrac,
    feat.interactFrac,
    feat.protectFrac,
    feat.recurFrac,
    feat.roleCompressFrac,
    feat.clusterEntropy,
  ];
}
