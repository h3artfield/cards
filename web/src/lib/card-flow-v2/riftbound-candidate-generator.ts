import type { CandidateGeneratorInput, CandidateGeneratorResult } from "./catalog-candidates";
import { getSlotValue } from "./evidence-utils";
import {
  parseRiftboundCollectorNumber,
  riftboundSetCodeHasFoilVariants,
} from "./knowledge/riftbound";
import {
  defaultRiftboundCatalogAdapter,
  type RiftboundCatalogAdapter,
  type RiftboundCatalogSearchInput,
} from "./catalogs/riftbound-catalog-adapter";
import {
  expandRiftboundVariantSuspects,
} from "./catalogs/riftbound-fixtures";

function evidenceBool(imageEvidence: CandidateGeneratorInput["imageEvidence"], field: string): boolean {
  const v = getSlotValue(imageEvidence, field);
  if (!v) return false;
  return v === "true" || v === "yes" || v === "observed";
}

export async function generateRiftboundCandidates(
  input: CandidateGeneratorInput,
  adapter: RiftboundCatalogAdapter = defaultRiftboundCatalogAdapter,
): Promise<CandidateGeneratorResult> {
  const notes: string[] = [];
  const ev = input.imageEvidence;

  const name =
    getSlotValue(ev, "card_name") ??
    getSlotValue(ev, "riftbound_name") ??
    undefined;
  const setCode =
    getSlotValue(ev, "set_code") ??
    getSlotValue(ev, "riftbound_set_code") ??
    undefined;
  const collectorNumber =
    getSlotValue(ev, "collector_number") ??
    getSlotValue(ev, "riftbound_collector_number") ??
    undefined;

  if (!name?.trim() && !collectorNumber?.trim()) {
    notes.push("Riftbound: no name or collector number — catalog search skipped.");
    return { suspects: [], notes };
  }

  const parsed = collectorNumber
    ? parseRiftboundCollectorNumber(collectorNumber, setCode)
    : undefined;

  const searchInput: RiftboundCatalogSearchInput = {
    name,
    setCode,
    collectorNumber,
  };

  let cards = await adapter.search(searchInput);

  if (!cards.length && name) {
    cards = await adapter.search({ name });
    if (cards.length) notes.push("Riftbound: broad name search — verify collector number.");
  }

  const evidenceAltArt =
    parsed?.hasAltArtSuffix || evidenceBool(ev, "riftbound_alt_art");
  const evidenceOvernumbered =
    parsed?.isOvernumbered || evidenceBool(ev, "riftbound_overnumbered");
  const signatureVisible = evidenceBool(ev, "riftbound_signature_visible");
  const evidenceSignature =
    parsed?.hasSignatureAsterisk ||
    getSlotValue(ev, "riftbound_signature_type") === "official_signature_overnumber";
  const evidenceSignatureUncertain =
    signatureVisible &&
    !parsed?.hasSignatureAsterisk &&
    getSlotValue(ev, "riftbound_signature_type") === "unknown";

  cards = expandRiftboundVariantSuspects(cards, {
    setCode,
    allowFoilSuspects: riftboundSetCodeHasFoilVariants(setCode),
    evidenceAltArt,
    evidenceOvernumbered,
    evidenceSignature,
    evidenceSignatureUncertain,
  });

  if (parsed?.hasAltArtSuffix) {
    cards = cards.filter(
      (c) =>
        c.identity.collectorNumber?.endsWith("a") ||
        c.variantTags.includes("alternate_art"),
    );
    notes.push("Riftbound: alt-art suffix — separated from base suspects.");
  }

  if (parsed?.isOvernumbered && !parsed.hasSignatureAsterisk) {
    cards = cards.filter(
      (c) =>
        c.identity.rarity === "overnumbered" ||
        c.identity.parsedCollectorNumber?.isOvernumbered,
    );
    notes.push("Riftbound: overnumbered — separated from base suspects.");
  }

  if (parsed?.hasSignatureAsterisk) {
    cards = cards.filter(
      (c) => c.identity.signatureType === "official_signature_overnumber",
    );
    notes.push("Riftbound: signature asterisk — official Signature suspect only.");
  }

  if (setCode === "OGS") {
    cards = cards.filter((c) => c.identity.finish !== "foil");
    notes.push("Riftbound OGS: foil suspects excluded.");
  }

  const finishObserved = getSlotValue(ev, "foil_pattern") ?? getSlotValue(ev, "riftbound_finish");
  if (
    finishObserved &&
    !["unknown", "unknown_finish"].includes(finishObserved.toLowerCase())
  ) {
    const f = finishObserved.toLowerCase();
    cards = cards.filter((c) => {
      const cf = (c.identity.finish ?? "").toLowerCase();
      if (f.includes("foil") && cf.includes("foil")) return true;
      if ((f === "normal" || f === "nonfoil") && (cf === "normal" || !cf)) return true;
      return cf === f;
    });
  }

  const suspects = adapter.toSuspects(cards).slice(0, 12);

  if (signatureVisible && !parsed?.hasSignatureAsterisk) {
    notes.push(
      "Riftbound: signature visible without asterisk — staff should distinguish official Signature vs aftermarket.",
    );
  }

  notes.push(
    `Riftbound catalog: ${cards.length} card(s) → ${suspects.length} suspect(s).`,
  );

  return { suspects, notes };
}
