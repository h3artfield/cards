/**
 * Shopify shop domain validation.
 * Run: npx tsx scripts/test-shopify-shop-domain.ts
 */
import { validateShopDomain } from "../src/lib/shopify/shop-domain";

let passed = 0;
let failed = 0;

function assert(cond: boolean, msg: string) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${msg}`);
  } else {
    failed++;
    console.error(`  ✗ ${msg}`);
  }
}

console.log("\nShopify shop domain validation\n");

const valid = validateShopDomain("the-game-lodge.myshopify.com");
assert(valid.ok && valid.domain === "the-game-lodge.myshopify.com", "accepts full domain");

const short = validateShopDomain("the-game-lodge");
assert(short.ok && short.domain === "the-game-lodge.myshopify.com", "appends .myshopify.com");

const email = validateShopDomain("lodge1@gmail.com");
assert(!email.ok && email.error.includes("not an email"), "rejects email address");

const bad = validateShopDomain("example.com");
assert(!bad.ok, "rejects non-myshopify domain");

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
