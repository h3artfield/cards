import type { RiftboundCatalogCard, RiftboundCatalogSearchInput } from "./riftbound-catalog-adapter";

/** Normalized local fixtures — replace/extend when official gallery API is wired. */
export const RIFTBOUND_LOCAL_FIXTURES: RiftboundCatalogCard[] = [
  {
    source: "local_fixture",
    sourceId: "ogn-ahri-061-base",
    identity: {
      name: "Ahri",
      subtitle: "Nine-Tailed Fox",
      setCode: "OGN",
      setName: "Origins",
      collectorNumber: "061/298",
      rarity: "common",
      finish: "normal",
      cardType: "champion",
      signatureType: "none",
    },
    variantTags: ["base"],
    productUrl: "https://playriftbound.com/en-us/card-gallery/",
  },
  {
    source: "local_fixture",
    sourceId: "ogn-ahri-061-foil",
    identity: {
      name: "Ahri",
      subtitle: "Nine-Tailed Fox",
      setCode: "OGN",
      setName: "Origins",
      collectorNumber: "061/298",
      rarity: "common",
      finish: "foil",
      cardType: "champion",
      signatureType: "none",
    },
    variantTags: ["foil"],
  },
  {
    source: "local_fixture",
    sourceId: "ogn-ahri-30a-alt",
    identity: {
      name: "Ahri",
      subtitle: "Nine-Tailed Fox",
      setCode: "OGN",
      setName: "Origins",
      collectorNumber: "30a",
      rarity: "alternate_art",
      finish: "foil_default",
      cardType: "champion",
      signatureType: "none",
    },
    variantTags: ["alternate_art", "alt_art"],
  },
  {
    source: "local_fixture",
    sourceId: "ogn-ahri-303-overnumbered",
    identity: {
      name: "Ahri",
      subtitle: "Nine-Tailed Fox",
      setCode: "OGN",
      setName: "Origins",
      collectorNumber: "303",
      rarity: "overnumbered",
      finish: "foil_default",
      cardType: "champion",
      signatureType: "none",
    },
    variantTags: ["overnumbered"],
    priceChartingProductId: "riftbound-ahri-303-on",
  },
  {
    source: "local_fixture",
    sourceId: "ogn-ahri-303-signature",
    identity: {
      name: "Ahri",
      subtitle: "Nine-Tailed Fox",
      setCode: "OGN",
      setName: "Origins",
      collectorNumber: "303*",
      rarity: "signature_overnumbered",
      finish: "signature_foil",
      cardType: "champion",
      signatureType: "official_signature_overnumber",
    },
    variantTags: ["overnumbered", "signature", "official_signature_overnumber"],
    priceChartingProductId: "riftbound-ahri-303-sig",
  },
  {
    source: "local_fixture",
    sourceId: "ogn-baron-ultimate",
    identity: {
      name: "Baron Nashor",
      setCode: "OGN",
      setName: "Origins",
      collectorNumber: "001",
      rarity: "ultimate",
      finish: "textured_foil",
      cardType: "legend",
      signatureType: "none",
    },
    variantTags: ["ultimate"],
  },
  {
    source: "local_fixture",
    sourceId: "ogs-jinx-base",
    identity: {
      name: "Jinx",
      subtitle: "Loose Cannon",
      setCode: "OGS",
      setName: "Proving Grounds",
      collectorNumber: "012",
      rarity: "rare",
      finish: "normal",
      cardType: "champion",
      signatureType: "none",
    },
    variantTags: ["base", "proving_grounds"],
  },
  {
    source: "local_fixture",
    sourceId: "ogn-grusha-placeholder",
    identity: {
      name: "Grusha",
      setCode: "OGN",
      setName: "Origins",
      collectorNumber: "184/298",
      rarity: "uncommon",
      finish: "normal",
      cardType: "champion",
      signatureType: "none",
    },
    variantTags: ["base"],
  },
  {
    source: "local_fixture",
    sourceId: "ogn-grusha-184-foil",
    identity: {
      name: "Grusha",
      setCode: "OGN",
      setName: "Origins",
      collectorNumber: "184/298",
      rarity: "uncommon",
      finish: "foil",
      cardType: "champion",
      signatureType: "none",
    },
    variantTags: ["foil"],
  },
];

function norm(s?: string): string {
  return (s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function collectorMatches(cardNum: string, query: string): boolean {
  const c = norm(cardNum.replace("*", ""));
  const q = norm(query.replace("*", ""));
  if (!q) return true;
  if (c === q) return true;
  const cBase = c.split("/")[0] ?? c;
  const qBase = q.split("/")[0] ?? q;
  return cBase === qBase || c.includes(qBase) || q.includes(cBase);
}

export function searchRiftboundLocalFixtures(
  input: RiftboundCatalogSearchInput,
): RiftboundCatalogCard[] {
  const nameQ = norm(input.name);
  const setQ = norm(input.setCode ?? input.setName);
  const numQ = input.collectorNumber?.trim() ?? "";

  return RIFTBOUND_LOCAL_FIXTURES.filter((card) => {
    const id = card.identity;
    if (nameQ && !norm(id.name).includes(nameQ) && !nameQ.includes(norm(id.name))) {
      return false;
    }
    if (setQ && norm(id.setCode) !== setQ && !norm(id.setName).includes(setQ)) {
      return false;
    }
    if (numQ && id.collectorNumber && !collectorMatches(id.collectorNumber, numQ)) {
      return false;
    }
    if (input.finish && id.finish && input.finish !== id.finish) {
      return false;
    }
    if (input.rarity && id.rarity && input.rarity !== id.rarity) {
      return false;
    }
    return true;
  });
}

export function expandRiftboundVariantSuspects(
  cards: RiftboundCatalogCard[],
  options: {
    setCode?: string;
    allowFoilSuspects?: boolean;
    evidenceAltArt?: boolean;
    evidenceOvernumbered?: boolean;
    evidenceSignature?: boolean;
    evidenceSignatureUncertain?: boolean;
  },
): RiftboundCatalogCard[] {
  const out: RiftboundCatalogCard[] = [];
  const seen = new Set<string>();

  const add = (c: RiftboundCatalogCard) => {
    const key = `${c.sourceId}:${c.identity.finish ?? "?"}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(c);
  };

  for (const card of cards) {
    add(card);
    const id = card.identity;
    const setCode = id.setCode ?? options.setCode;

    if (options.evidenceAltArt && !id.collectorNumber?.endsWith("a")) {
      const alt = RIFTBOUND_LOCAL_FIXTURES.find(
        (f) =>
          norm(f.identity.name) === norm(id.name) &&
          f.identity.collectorNumber?.endsWith("a"),
      );
      if (alt) add(alt);
    }

    if (options.evidenceOvernumbered && !id.parsedCollectorNumber?.isOvernumbered) {
      const on = RIFTBOUND_LOCAL_FIXTURES.find(
        (f) =>
          norm(f.identity.name) === norm(id.name) &&
          f.identity.rarity === "overnumbered" &&
          f.identity.signatureType === "none",
      );
      if (on) add(on);
    }

    if (options.evidenceSignature || options.evidenceSignatureUncertain) {
      const sig = RIFTBOUND_LOCAL_FIXTURES.find(
        (f) =>
          norm(f.identity.name) === norm(id.name) &&
          f.identity.signatureType === "official_signature_overnumber",
      );
      if (sig) add(sig);
      if (options.evidenceSignatureUncertain) {
        const nonSig = RIFTBOUND_LOCAL_FIXTURES.find(
          (f) =>
            norm(f.identity.name) === norm(id.name) &&
            f.identity.rarity === "overnumbered" &&
            f.identity.signatureType === "none",
        );
        if (nonSig) add(nonSig);
      }
    }

    if (
      options.allowFoilSuspects !== false &&
      setCode !== "OGS" &&
      (id.rarity === "common" || id.rarity === "uncommon") &&
      id.finish === "normal"
    ) {
      const foil = RIFTBOUND_LOCAL_FIXTURES.find(
        (f) =>
          norm(f.identity.name) === norm(id.name) &&
          f.identity.collectorNumber === id.collectorNumber &&
          f.identity.finish === "foil",
      );
      if (foil) add(foil);
    }
  }

  return out;
}
