/**
 * Resolve CommanderSpellbook templates against a LOCAL oracle snapshot.
 * No live Scryfall. Uses type / text / mana / power / otags / edhrec-ish fields.
 */
export const DR_TEMPLATE_MATCH_V2 = "deck-rating-goldfish-template-match-v2";

export type LocalOracleCard = {
  oracleId: string;
  name: string;
  typeLine: string;
  text: string;
  manaCost: string;
  cmc: number;
  power: number | null;
  toughness: number | null;
  colors: string[];
  keywords: string[];
  layout: string;
  commanderLegal: string;
  otags: Set<string>;
};

function norm(s: string): string {
  return s.toLowerCase().replace(/[’']/g, "'");
}

function typeHas(card: LocalOracleCard, t: string): boolean {
  const tl = norm(card.typeLine);
  const key = t.toLowerCase();
  if (key === "inst") return /\binstant\b/.test(tl);
  if (key === "sorc") return /\bsorcery\b/.test(tl);
  return new RegExp(`\\b${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(tl);
}

function tapManaAmount(card: LocalOracleCard): number {
  let n = 0;
  for (const m of card.text.matchAll(/\{T\}: Add ((?:\{[^}]+\}|\s)+)/gi)) {
    const chunk = m[1] ?? "";
    n += [...chunk.matchAll(/\{(\d+)\}/g)].reduce((s, x) => s + Number(x[1]), 0);
    n += (chunk.match(/\{[WUBRGC]/gi) ?? []).length;
  }
  return n;
}

function manaPips(cost: string): string[] {
  return [...cost.matchAll(/\{([^}]+)\}/g)].map((m) => (m[1] ?? "").toUpperCase());
}

function nameEq(card: LocalOracleCard, name: string): boolean {
  return norm(card.name) === norm(name) || norm(card.name).startsWith(`${norm(name)} //`);
}

const COLOR_NAME: Record<string, string> = {
  white: "W",
  blue: "U",
  black: "B",
  red: "R",
  green: "G",
  colorless: "C",
  w: "W",
  u: "U",
  b: "B",
  r: "R",
  g: "G",
  c: "C",
};

function safeOracleRegex(pattern: string): RegExp | null {
  try {
    return new RegExp(pattern, "i");
  } catch {
    const escaped = pattern.replace(/\{([^{}]*)\}/g, (m, inner: string) =>
      /^\d+(?:,\d*)?$/.test(inner) || /^,\d+$/.test(inner) ? m : `\\{${inner}\\}`,
    );
    try {
      return new RegExp(escaped, "i");
    } catch {
      return null;
    }
  }
}

function oracleTextHas(card: LocalOracleCard, val: string): boolean {
  const name = card.name.split(" // ")[0] ?? card.name;
  const alts = [
    name,
    "this creature",
    "this artifact",
    "this land",
    "this permanent",
    "this enchantment",
    "this planeswalker",
    "this",
  ];
  const text = norm(card.text);
  return alts.some((a) => text.includes(norm(val.replace(/~/g, a))));
}

function evalAtom(card: LocalOracleCard, raw: string): boolean {
  let tok = raw.trim();
  if (!tok) return true;
  let neg = false;
  while (tok.startsWith("-")) {
    neg = !neg;
    tok = tok.slice(1).trim();
  }
  let hit = evalPositive(card, tok);
  return neg ? !hit : hit;
}

function evalPositive(card: LocalOracleCard, tok: string): boolean {
  const exact = tok.match(/^!"([^"]+)"$/) || tok.match(/^!\\"([^"]+)\\"$/) || tok.match(/^!"(.+)"$/);
  if (tok.startsWith('!"') || tok.startsWith("!")) {
    const name = tok.replace(/^!\\?"?/, "").replace(/\\?"$/, "").replace(/^"/, "").replace(/"$/, "");
    return nameEq(card, name);
  }
  if (exact) return nameEq(card, exact[1] ?? "");

  const kv = tok.match(/^([a-z]+)\s*(<=|>=|!=|=|<|>|:)\s*(.+)$/i);
  if (!kv) {
    if (/^legal:commander$/i.test(tok)) return card.commanderLegal === "legal";
    return false;
  }
  const key = kv[1]!.toLowerCase();
  const op = kv[2]!;
  let val = kv[3]!.trim();
  if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
    val = val.slice(1, -1);
  }

  if (key === "t") return typeHas(card, val);
  if (key === "kw" || key === "keyword") {
    const k = val.toLowerCase();
    return card.keywords.some((x) => x.toLowerCase() === k) || new RegExp(`\\b${k}\\b`, "i").test(card.text);
  }
  if (key === "otag") return card.otags.has(val.toLowerCase());
  if (key === "o") {
    if (val.startsWith("/") && val.endsWith("/")) {
      const re = safeOracleRegex(val.slice(1, -1));
      return re ? re.test(card.text) : false;
    }
    return oracleTextHas(card, val);
  }
  if (key === "is") {
    const v = val.toLowerCase();
    if (v === "permanent") return /\b(creature|artifact|enchantment|planeswalker|land|battle)\b/i.test(card.typeLine);
    if (v === "spell") return /\b(instant|sorcery)\b/i.test(card.typeLine);
    if (v === "commander") return /\blegendary\b/i.test(card.typeLine) && /\bcreature\b/i.test(card.typeLine);
    if (v === "dfc" || v === "tdfc") return /\/\//.test(card.typeLine) || /modal_dfc|transform|meld|adventure/i.test(card.layout);
    if (v === "flip") return /flip/i.test(card.layout);
    return card.layout.toLowerCase() === v;
  }
  if (key === "legal") return val.toLowerCase() !== "commander" || card.commanderLegal === "legal";
  if (key === "produces") {
    const v = val.toUpperCase().replace(/[^WUBRGC]/g, "");
    if (!v) return false;
    return v.split("").every((c) => new RegExp(`\\{${c}\\}`, "i").test(card.text) || typeHas(card, ({ W: "plains", U: "island", B: "swamp", R: "mountain", G: "forest", C: "wastes" } as Record<string, string>)[c] ?? ""));
  }
  if (key === "color" || key === "c") {
    const v = val.toLowerCase();
    if (v === "c" || v === "0" || v === "colorless") return card.colors.length === 0;
    const mapped = COLOR_NAME[v] ?? ( /^[wubrgc]+$/i.test(v) ? v.toUpperCase() : "" );
    if (!mapped) return false;
    return mapped.split("").every((c) => card.colors.includes(c));
  }
  if (key === "mv") return cmpNum(card.cmc, op, Number(val));
  if (key === "pow") return card.power != null && cmpNum(card.power, op, Number(val));
  if (key === "tou" || key === "toughness") return card.toughness != null && cmpNum(card.toughness, op, Number(val));
  if (key === "mana" || key === "m") {
    const cost = card.manaCost || (card.cmc === 0 ? "{0}" : "");
    if (op === ":" || op === "=") {
      if (val === "X" || val === "{X}") return /\{X\}/i.test(cost);
      if (/^\{[WUBRGC]\}$/i.test(val)) return cost.toUpperCase().includes(val.toUpperCase());
      const a = manaPips(cost).join("");
      const b = manaPips(val.startsWith("{") ? val : `{${val}}`).join("");
      if (val.includes("{") || val === "0" || val === "X") {
        const normVal = val === "0" ? "{0}" : val.startsWith("{") ? val : `{${val}}`;
        return norm(cost) === norm(normVal) || a === manaPips(normVal).join("");
      }
      return a === b;
    }
    if (op === "<" && val === "{0}") return card.cmc < 0;
    if (op === ">=") return card.cmc >= Number(val) || cost.length >= 0;
    return false;
  }
  return false;
}

function cmpNum(left: number, op: string, right: number): boolean {
  if (!Number.isFinite(right)) return false;
  if (op === "=" || op === ":") return left === right;
  if (op === "<=") return left <= right;
  if (op === ">=") return left >= right;
  if (op === "<") return left < right;
  if (op === ">") return left > right;
  if (op === "!=") return left !== right;
  return false;
}

function tokenize(q: string): string[] {
  const out: string[] = [];
  let i = 0;
  const s = q.trim();
  while (i < s.length) {
    if (/\s/.test(s[i]!)) {
      i += 1;
      continue;
    }
    if (s[i] === "(" || s[i] === ")") {
      out.push(s[i]!);
      i += 1;
      continue;
    }
    if (s.slice(i, i + 2).toLowerCase() === "or" && (i + 2 === s.length || /\s/.test(s[i + 2]!))) {
      out.push("OR");
      i += 2;
      continue;
    }
    if (s.slice(i, i + 3).toLowerCase() === "and" && (i + 3 === s.length || /\s/.test(s[i + 3]!))) {
      out.push("AND");
      i += 3;
      continue;
    }
    let j = i;
    let depth = 0;
    let quote = "";
    while (j < s.length) {
      const ch = s[j]!;
      if (quote) {
        if (ch === quote) quote = "";
        j += 1;
        continue;
      }
      if (ch === '"' || ch === "'") {
        quote = ch;
        j += 1;
        continue;
      }
      if (ch === "/" && s[j - 1] === ":") {
        const end = s.indexOf("/", j + 1);
        if (end > j) {
          j = end + 1;
          continue;
        }
      }
      if (ch === "(") depth += 1;
      if (ch === ")") {
        if (depth === 0) break;
        depth -= 1;
      }
      if (depth === 0 && /\s/.test(ch)) break;
      j += 1;
    }
    out.push(s.slice(i, j));
    i = j;
  }
  return out;
}

function parseExpr(tokens: string[]): { ok: boolean; eval: (c: LocalOracleCard) => boolean } {
  let i = 0;
  const peek = () => tokens[i];
  const eat = () => tokens[i++];

  const parseOr = (): ((c: LocalOracleCard) => boolean) => {
    let left = parseAnd();
    while (peek() === "OR") {
      eat();
      const right = parseAnd();
      const L = left;
      left = (c) => L(c) || right(c);
    }
    return left;
  };
  const parseAnd = (): ((c: LocalOracleCard) => boolean) => {
    let left = parseUnary();
    while (peek() && peek() !== "OR" && peek() !== ")") {
      if (peek() === "AND") eat();
      const right = parseUnary();
      const L = left;
      left = (c) => L(c) && right(c);
    }
    return left;
  };
  const parseUnary = (): ((c: LocalOracleCard) => boolean) => {
    if (peek() === "(") {
      eat();
      const inner = parseOr();
      if (peek() === ")") eat();
      return inner;
    }
    const t = eat();
    if (!t) return () => true;
    return (c) => evalAtom(c, t);
  };

  try {
    const fn = parseOr();
    return { ok: true, eval: fn };
  } catch {
    return { ok: false, eval: () => false };
  }
}

const cache = new Map<string, (c: LocalOracleCard) => boolean>();

export function matchScryfallQuery(card: LocalOracleCard, query: string): boolean {
  const q = query.replace(/\s+legal:commander\s*$/i, "").trim();
  if (!q) return card.commanderLegal === "legal";
  let fn = cache.get(q);
  if (!fn) {
    fn = parseExpr(tokenize(q)).eval;
    cache.set(q, fn);
  }
  return fn(card);
}

export function matchTemplateHeuristic(card: LocalOracleCard, templateName: string): boolean {
  const n = templateName.toLowerCase();
  const text = card.text;
  const tl = card.typeLine;
  if (/taps for 3\+ mana/.test(n)) return /\bcreature\b/i.test(tl) && tapManaAmount(card) >= 3;
  if (/taps for 2\+ mana/.test(n)) return /\bcreature\b/i.test(tl) && tapManaAmount(card) >= 2;
  if (/mana rock that produces 3\+/.test(n) || /produces 3\+/.test(n)) return tapManaAmount(card) >= 3 && /\bartifact\b/i.test(tl);
  if (/gives a creature deathtouch/.test(n)) return /deathtouch/i.test(text) && !/\bdeathtouch\b/i.test(tl);
  if (/gives indestructible/.test(n)) return /gains? indestructible|have indestructible/i.test(text);
  if (/haste enabler/.test(n)) return /gains? haste|have haste|creatures you control.*haste/i.test(text);
  if (/creates creature token/.test(n) && /death/.test(n)) {
    return /\bcreature\b/i.test(tl) && card.cmc <= 1 && /when .* dies/i.test(text) && /create/i.test(text);
  }
  if (/earthbends on entering/.test(n)) return /when .* enters/i.test(text) && /earthbend/i.test(text);
  if (/untaps at least five lands/.test(n)) return /untap/i.test(text) && /lands?/i.test(text);
  if (/card giving creatures -1\/-1/.test(n)) return /gets? -1\/-1|get -1\/-1/i.test(text);
  if (/preventing combat damage/.test(n)) return /prevent all (?:combat )?damage/i.test(text);
  if (/allowing a creature to tap for free/.test(n)) return /untap|tap .* (?:for|without)/i.test(text);
  if (/copy or clone creatures/.test(n)) return /copy target creature|token that's a copy/i.test(text);
  if (/adds 1g\+ when flickered/.test(n)) return /when .* enters/i.test(text) && /add \{/i.test(text);
  if (/animates a land/.test(n)) return /becomes? a.*creature/i.test(text) && /land/i.test(text);
  if (/creates one or more creature tokens per turn/.test(n)) return /create/i.test(text) && /creature token/i.test(text);
  if (/ncreases \+1\/\+1 counter/.test(n)) return /\+1\/\+1 counter/i.test(text);
  if (/prepare spell/.test(n)) return /prepare/i.test(text);
  if (/enters with at least two more \+1\/\+1/.test(n)) return /enters with/i.test(text) && /\+1\/\+1/i.test(text);
  if (/gains at least 4 life/.test(n)) return /gain (?:4|5|6|x|that much) life/i.test(text);
  if (/anthem effects|alter a creature's power\/toughness/.test(n)) {
    return /creatures you control (?:get|gain)|other creatures you control|get \+\d+\/\+\d+/i.test(text);
  }
  if (/gives \+1\/\+1 counter to creatures that enter/.test(n)) {
    return /\+1\/\+1 counter/i.test(text) && /enter/i.test(text);
  }
  if (/landfall ability: create creature token/.test(n)) {
    return /landfall|whenever a land (?:you control )?enters/i.test(text) && /create/i.test(text) && /creature token/i.test(text);
  }
  if (/landfall ability: create token/.test(n)) {
    return /landfall|whenever a land (?:you control )?enters/i.test(text) && /create/i.test(text) && /token/i.test(text);
  }
  if (/don't lose the game due to having 0/.test(n)) {
    return /(?:don't|do not|can't) lose the game|you don't lose/i.test(text);
  }
  if (/when this creature etbs, create 2\+/.test(n) || /when this creature dies, create 2\+/.test(n)) {
    return /when .* (?:enters|dies)/i.test(text) && /create/i.test(text) && /creature token/i.test(text);
  }
  if (/when this creature etbs, create 1\+/.test(n)) {
    return /when .* enters/i.test(text) && /create/i.test(text) && /creature token/i.test(text);
  }
  if (/tapping to deal damage to any target/.test(n)) {
    return /\{T\}:.*deals? .* damage to any target/i.test(text);
  }
  if (/one mana prepared/.test(n)) return /prepare/i.test(text) && card.cmc <= 1;
  if (/draw hate/.test(n)) return /whenever (?:an opponent|a player) draws/i.test(text);
  if (/extra turn spell/.test(n)) return /extra turn/i.test(text);
  if (/mass land denial/.test(n)) return /destroy all lands|all lands .* destroy/i.test(text);
  if (/tucks your artifact/.test(n)) return /put .* artifact .* (?:on the )?bottom/i.test(text);
  return false;
}

export function cardMatchesTemplate(
  card: LocalOracleCard,
  template: { name: string; scryfallQuery: string | null },
): boolean {
  if (card.commanderLegal === "banned" || card.commanderLegal === "not_legal") return false;
  if (template.scryfallQuery) return matchScryfallQuery(card, template.scryfallQuery);
  return matchTemplateHeuristic(card, template.name);
}

export function tapManaFromText(text: string): number {
  let n = 0;
  for (const m of text.matchAll(/\{T\}: Add ((?:\{[^}]+\}|\s)+)/gi)) {
    const chunk = m[1] ?? "";
    n += [...chunk.matchAll(/\{(\d+)\}/g)].reduce((s, x) => s + Number(x[1]), 0);
    n += (chunk.match(/\{[WUBRGC]/gi) ?? []).length;
  }
  return n;
}
