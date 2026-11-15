import { buildIdentityKey } from "@/lib/prices/identity-key";

function numberStem(raw?: string): string | undefined {
  const digits = raw?.match(/\d+/);
  if (!digits) return undefined;
  const n = parseInt(digits[0], 10);
  return Number.isFinite(n) ? String(n) : undefined;
}

function treatmentFromShelf(name?: string, setName?: string): string {
  const text = `${name ?? ""} ${setName ?? ""}`.toLowerCase();
  if (text.includes("extended")) return "extended_art";
  if (text.includes("borderless")) return "borderless";
  if (text.includes("showcase")) return "showcase";
  if (text.includes("retro")) return "retro_frame";
  return "normal";
}

function uniq(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

/**
 * Candidate PriceCharting identity keys for one shelf row.
 * The first key is the printing we think it is. The rest are nearby
 * finishes and treatments, because a showcase foil and the regular
 * printing are often stored as different keys.
 */
export function inventoryPriceHistoryKeys(input: {
  gameKey?: string;
  setCode?: string;
  setName?: string;
  collectorNumber?: string;
  foil: boolean;
  name?: string;
}): string[] {
  const game = input.gameKey ?? "";
  const number = numberStem(input.collectorNumber);
  if (!number) return [];

  const language =
    /japan/i.test(input.setName ?? "") || game === "pokemon-japan" ? "jp" : "en";
  const finishes = uniq([input.foil ? "foil" : "nonfoil", input.foil ? "nonfoil" : "foil"]);
  const treatments = uniq([
    treatmentFromShelf(input.name, input.setName),
    "normal",
  ]);

  const keys: string[] = [];
  const push = (key: string | null) => {
    if (key && !keys.includes(key)) keys.push(key);
  };

  if (game === "magic" && input.setCode) {
    for (const finish of finishes) {
      for (const treatment of treatments) {
        push(
          buildIdentityKey({
            category: "mtg",
            setCode: input.setCode,
            collectorNumber: number,
            finish,
            treatment,
            language,
          }),
        );
      }
    }
  } else if ((game === "pokemon" || game === "pokemon-japan") && (input.setCode || input.setName)) {
    for (const finish of finishes) {
      push(
        buildIdentityKey({
          category: "pokemon",
          setCode: input.setCode,
          setName: input.setName,
          collectorNumber: number,
          finish: finish === "foil" && language === "jp" ? "holofoil" : finish,
          language,
        }),
      );
    }
  } else if (game === "yugioh" && input.setName) {
    push(
      buildIdentityKey({
        category: "yugioh",
        setName: input.setName,
        collectorNumber: number,
        language,
      }),
    );
  } else if (game === "one-piece" && input.setName) {
    push(
      buildIdentityKey({
        category: "onepiece",
        setName: input.setName,
        collectorNumber: number,
        language,
      }),
    );
  } else if (game === "riftbound" && input.setCode) {
    push(
      buildIdentityKey({
        category: "riftbound",
        setCode: input.setCode,
        collectorNumber: number,
        finish: input.foil ? "foil" : "nonfoil",
        language,
      }),
    );
  }

  return keys.slice(0, 8);
}
