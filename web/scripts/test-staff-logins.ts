import { createAdminSessionToken, parseAdminSessionToken } from "../src/lib/auth/admin-session";
import {
  createStaffSessionToken,
  parseStaffSessionToken,
  readStaffSessionFromRequest,
} from "../src/lib/auth/staff-session";
import { ownerAccessAllowed, settingsPatchNeedsOwner } from "../src/lib/staff/owner-access";
import {
  activeOwnerCount,
  newStaffMember,
  normalizeStaffName,
  parseStaffRole,
  staffNameTaken,
  toPublicStaff,
  validateStaffPin,
  verifyStaffPin,
  type StaffMember,
} from "../src/lib/staff/staff-members";

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

async function main() {
  console.log("PIN and name rules");
  assert(validateStaffPin("1234") === null, "4 digits ok");
  assert(validateStaffPin("123456") === null, "6 digits ok");
  assert(validateStaffPin("123") !== null, "3 digits rejected");
  assert(validateStaffPin("1234567") !== null, "7 digits rejected");
  assert(validateStaffPin("12a4") !== null, "letters rejected");
  assert(validateStaffPin(1234) !== null, "non-string rejected");
  assert(normalizeStaffName("  Sam   Lee ") === "Sam Lee", "name spaces collapsed");
  assert(normalizeStaffName("") === null, "empty name rejected");
  assert(normalizeStaffName("x".repeat(41)) === null, "long name rejected");
  assert(parseStaffRole("owner") === "owner" && parseStaffRole("admin") === null, "role parsing");

  console.log("Profiles");
  const owner = await newStaffMember({ storeId: "s1", name: "Pat", role: "owner", pin: "4321" });
  const clerk = await newStaffMember({ storeId: "s1", name: "Sam", role: "clerk", pin: "1111" });
  assert(owner.pinHash !== "4321" && owner.pinHash.includes(":"), "PIN stored hashed");
  assert(await verifyStaffPin("4321", owner), "right PIN verifies");
  assert(!(await verifyStaffPin("4322", owner)), "wrong PIN fails");
  assert(!("pinHash" in toPublicStaff(owner)), "public profile has no PIN hash");
  const removedOwner: StaffMember = { ...owner, active: false };
  assert(activeOwnerCount([owner, clerk]) === 1, "one active owner");
  assert(activeOwnerCount([removedOwner, clerk]) === 0, "removed owner not counted");
  assert(staffNameTaken([owner, clerk], "sam"), "names compared without case");
  assert(!staffNameTaken([owner, clerk], "Sam", clerk.id), "renaming yourself to your own name is fine");
  assert(!staffNameTaken([{ ...clerk, active: false }], "Sam"), "removed staff free their name");

  console.log("Owner access");
  assert(ownerAccessAllowed({ role: "platform", setupNeeded: false }), "platform admin always");
  assert(ownerAccessAllowed({ role: "store", setupNeeded: true }), "before setup the store login is the owner");
  assert(ownerAccessAllowed({ role: "store", setupNeeded: false, staffRole: "owner" }), "owner PIN");
  assert(!ownerAccessAllowed({ role: "store", setupNeeded: false, staffRole: "clerk" }), "clerk refused");
  assert(!ownerAccessAllowed({ role: "store", setupNeeded: false }), "nobody signed in refused");

  console.log("Settings fields");
  assert(!settingsPatchNeedsOwner({ conditionMultipliers: { LP: 0.8 } }), "conditions: clerk ok");
  assert(!settingsPatchNeedsOwner({ calendarSettings: { published: true } }), "calendar: clerk ok");
  assert(settingsPatchNeedsOwner({ defaultCashPercent: 0.5 }), "buy % needs owner");
  assert(settingsPatchNeedsOwner({ minimumOffer: 1 }), "minimum offer needs owner");
  assert(settingsPatchNeedsOwner({ storeLogoUrl: null }), "logo needs owner");
  assert(settingsPatchNeedsOwner({ calendarSettings: {}, storeName: "x" }), "mixed patch needs owner");

  console.log("Staff cookie");
  const s = { storeId: "s1", staffId: clerk.id, name: "Sam", role: "clerk" as const };
  const token = createStaffSessionToken(s);
  const parsed = parseStaffSessionToken(token);
  assert(parsed?.staffId === clerk.id && parsed.role === "clerk" && parsed.storeId === "s1", "round trip");
  const [payload, sig] = token.split(".");
  const forged = Buffer.from(
    JSON.stringify({ ...JSON.parse(Buffer.from(payload!, "base64url").toString()), role: "owner" }),
  ).toString("base64url");
  assert(parseStaffSessionToken(`${forged}.${sig}`) === null, "edited role rejected");
  assert(parseStaffSessionToken(token, Date.now() + 13 * 3600_000) === null, "expires after 12 hours");
  const adminToken = createAdminSessionToken({ userId: "u1", email: "owner@example.com", role: "store", storeId: "s1" });
  assert(parseStaffSessionToken(adminToken) === null, "store login token is not a staff token");
  assert(parseAdminSessionToken(token) === null, "staff token is not a store login token");
  const req = new Request("http://x/", { headers: { cookie: `a=1; staff_session=${encodeURIComponent(token)}` } });
  assert(readStaffSessionFromRequest(req)?.name === "Sam", "read from cookie header");

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed) process.exit(1);
}

void main();
