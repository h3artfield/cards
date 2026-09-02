import {
  COS_V1_DEP,
  COS_V1_ENAB_BUCKETS,
  COS_V1_TERM_BUCKETS,
  COS_V1_ZONE_KEYS,
} from "./constants";
import type { CosV1ArchitectureFingerprint } from "./types";

function log1p(n: number): number {
  return Math.log1p(n);
}

/** Frozen fp_vector. zeroCombo=1 is valid input, not a scoring failure. */
export function fpVector(fp: CosV1ArchitectureFingerprint | null): number[] {
  const ncomb = fp ? Number(fp.nNormalizedCombos || 0) : 0;
  const raw =
    !fp || ncomb === 0
      ? {
          logCombos: 0,
          logNative: 0,
          zeroCombo: 1,
          minSize: 0,
          logTwo: 0,
          logThree: 0,
          logFour: 0,
          fracCmd: 0,
          logCmdInv: 0,
          logTermRoutes: 0,
          logResLoops: 0,
          logSharedCards: 0,
          sharedConc: 0,
          logPrereq: 0,
          logMana: 0,
          hasTerminal: 0,
        }
      : {
          logCombos: log1p(ncomb),
          logNative: log1p(Number(fp.nNativeVariants || 0)),
          zeroCombo: 0,
          minSize: Number(fp.minComboCardCount || 0),
          logTwo: log1p(Number(fp.nTwoCard || 0)),
          logThree: log1p(Number(fp.nThreeCard || 0)),
          logFour: log1p(Number(fp.nFourPlusCard || 0)),
          fracCmd: Number(fp.fractionCommanderInvolved || 0),
          logCmdInv: log1p(Number(fp.nCommanderInvolved || 0)),
          logTermRoutes: log1p(Number(fp.nTerminalRoutes || 0)),
          logResLoops: log1p(Number(fp.nResourceOnlyLoops || 0)),
          logSharedCards: log1p(Number(fp.nCardsInMultipleComboSets || 0)),
          sharedConc: Number(fp.sharedPieceConcentration || 0),
          logPrereq: log1p(Number(fp.nCombosWithPrereqOrTemplate || 0)),
          logMana: log1p(Number(fp.nCombosWithManaNeeded || 0)),
          hasTerminal: fp.terminalBuckets?.length ? 1 : 0,
        };
  const dep = !fp || ncomb === 0 ? "NONE" : fp.commanderDependence || "NONE";
  const terms = fp && ncomb > 0 ? fp.terminalBuckets || [] : [];
  const enabs = fp && ncomb > 0 ? fp.enablingBuckets || [] : [];
  const zones = fp && ncomb > 0 ? fp.zoneProfile || {} : {};
  return [
    ...Object.values(raw),
    ...COS_V1_DEP.map((d) => (dep === d ? 1 : 0)),
    ...COS_V1_TERM_BUCKETS.map((b) => (terms.includes(b) ? 1 : 0)),
    ...COS_V1_ENAB_BUCKETS.map((b) => (enabs.includes(b) ? 1 : 0)),
    ...COS_V1_ZONE_KEYS.map((z) => log1p(Number(zones[z] || 0))),
  ];
}
