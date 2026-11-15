import { createHash, timingSafeEqual } from "node:crypto";

export type ChallengerApiAuth = "ok" | "unconfigured" | "unauthorized";

/** Stream-PC calls. The bearer value is the API secret, not a player token. */
export function challengerApiAuth(req: Request): ChallengerApiAuth {
  const expected = process.env.CHALLENGER_API_SECRET?.trim();
  if (!expected) return "unconfigured";
  const header = req.headers.get("authorization") ?? "";
  const token = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  const a = createHash("sha256").update(token).digest();
  const b = createHash("sha256").update(expected).digest();
  if (!timingSafeEqual(a, b)) return "unauthorized";
  return "ok";
}
