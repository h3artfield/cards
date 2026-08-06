import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

const ALGO = "aes-256-gcm";
const IV_LEN = 12;

function encryptionKey(): Buffer {
  const raw =
    process.env.SHOPIFY_TOKEN_ENCRYPTION_KEY?.trim() ||
    process.env.ADMIN_SESSION_SECRET?.trim() ||
    "dev-only-shopify-token-key-change-me";
  return createHash("sha256").update(raw).digest();
}

/** Encrypt a secret for at-rest storage (AES-256-GCM). */
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, encryptionKey(), iv);
  const enc = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return `enc:v1:${iv.toString("base64url")}:${tag.toString("base64url")}:${enc.toString("base64url")}`;
}

/** Decrypt a secret stored via encryptSecret. */
export function decryptSecret(ciphertext: string): string {
  if (!ciphertext.startsWith("enc:v1:")) {
    throw new Error("Invalid encrypted secret format");
  }
  const parts = ciphertext.split(":");
  if (parts.length !== 5) throw new Error("Invalid encrypted secret payload");
  const iv = Buffer.from(parts[2]!, "base64url");
  const tag = Buffer.from(parts[3]!, "base64url");
  const data = Buffer.from(parts[4]!, "base64url");
  const decipher = createDecipheriv(ALGO, encryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString(
    "utf8",
  );
}
