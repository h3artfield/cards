import { createHash, randomBytes } from "node:crypto";

export function generateSecureToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function verifyTokenHash(token: string, storedHash: string | undefined): boolean {
  if (!storedHash) return false;
  const computed = hashToken(token);
  return computed === storedHash;
}
