import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const TTL_SECONDS = 5 * 60;

export type ChallengerHandoffPayload = {
  uid: string;
  name: string;
  exp: number;
  jti: string;
};

function handoffSecret(): string | null {
  const secret = process.env.CHALLENGER_HANDOFF_SECRET?.trim();
  return secret || null;
}

function signPayload(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function createChallengerHandoffToken(input: {
  uid: string;
  name: string;
  exp?: number;
  jti?: string;
}): string | null {
  const secret = handoffSecret();
  if (!secret) return null;
  const body: ChallengerHandoffPayload = {
    uid: input.uid,
    name: input.name,
    exp: input.exp ?? Math.floor(Date.now() / 1000) + TTL_SECONDS,
    jti: input.jti ?? randomBytes(16).toString("base64url"),
  };
  const payload = Buffer.from(JSON.stringify(body)).toString("base64url");
  return `${payload}.${signPayload(payload, secret)}`;
}

export function parseChallengerHandoffToken(
  token: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): ChallengerHandoffPayload | null {
  const secret = handoffSecret();
  if (!secret) return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = signPayload(payload, secret);
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }
  try {
    const parsed = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as Partial<ChallengerHandoffPayload>;
    if (!parsed.uid || !parsed.name || !parsed.jti || typeof parsed.exp !== "number") {
      return null;
    }
    if (parsed.exp < nowSeconds) return null;
    return {
      uid: parsed.uid,
      name: parsed.name,
      exp: parsed.exp,
      jti: parsed.jti,
    };
  } catch {
    return null;
  }
}
