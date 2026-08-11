/** WUBRG mana colors tuned for dark-map readability. */
export const MANA_HEX: Record<string, string> = {
  W: "#F9F9E7",
  U: "#1785C4",
  B: "#6B6B6B",
  R: "#E8342E",
  G: "#059669",
};

export const COLOR_IDENTITY_ORDER = ["W", "U", "B", "R", "G"] as const;

export type ManaLetter = (typeof COLOR_IDENTITY_ORDER)[number];

export function orderedColorIdentity(colorIdentity: string[]): ManaLetter[] {
  return COLOR_IDENTITY_ORDER.filter((c) => colorIdentity.includes(c));
}

/** Bitmask: W=1, U=2, B=4, R=8, G=16 */
export function colorIdentityMask(colorIdentity: string[]): number {
  let mask = 0;
  for (const c of colorIdentity) {
    if (c === "W") mask |= 1;
    if (c === "U") mask |= 2;
    if (c === "B") mask |= 4;
    if (c === "R") mask |= 8;
    if (c === "G") mask |= 16;
  }
  return mask;
}

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const n = parseInt(h, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/** Draw a mana-colored node on 2D canvas (solid, pie slices, or colorless outline). */
export function drawManaNode2D(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  colorIdentity: string[],
  options?: { dim?: number; inventoryRing?: boolean; stroke?: string; lineWidth?: number },
): void {
  const colors = orderedColorIdentity(colorIdentity);
  const dim = options?.dim ?? 1;

  if (colors.length === 0) {
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.strokeStyle = options?.stroke ?? "#d4d4d4";
    ctx.lineWidth = options?.lineWidth ?? Math.max(1.5, radius * 0.35);
    ctx.stroke();
  } else if (colors.length === 1) {
    const [r, g, b] = hexToRgb(MANA_HEX[colors[0]!]!);
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${Math.round(r * 255 * dim)}, ${Math.round(g * 255 * dim)}, ${Math.round(b * 255 * dim)}, 0.95)`;
    ctx.fill();
  } else {
    const slice = (Math.PI * 2) / colors.length;
    let start = -Math.PI / 2;
    for (const c of colors) {
      const [r, g, b] = hexToRgb(MANA_HEX[c]!);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.arc(x, y, radius, start, start + slice);
      ctx.closePath();
      ctx.fillStyle = `rgba(${Math.round(r * 255 * dim)}, ${Math.round(g * 255 * dim)}, ${Math.round(b * 255 * dim)}, 0.95)`;
      ctx.fill();
      start += slice;
    }
  }

  if (options?.inventoryRing) {
    ctx.beginPath();
    ctx.arc(x, y, radius + 2, 0, Math.PI * 2);
    ctx.strokeStyle = "#34d399";
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
}
