/**
 * TCGplayer ↔ USPS shipping converter tests.
 * Run: npm run test:shipping-converter
 */
import { parseCsv, normalizePostalCode, stringifyCsv } from "../src/lib/shipping/csv-utils";
import { computePackedWeightOz } from "../src/lib/shipping/packaging-profiles";
import { applyRowOverrides, prepareShippingRows } from "../src/lib/shipping/prepare-rows";
import { parseTcgplayerShippingCsv } from "../src/lib/shipping/tcgplayer-import";
import { defaultShippingDefaults } from "../src/lib/shipping/defaults-storage";
import { isSenderComplete, normalizeSenderProfile } from "../src/lib/shipping/sender-profile";
import { exportUspsClickNShipCsv } from "../src/lib/shipping/usps-export";
import { exportAddressLabelsCsv } from "../src/lib/shipping/address-labels-export";
import {
  buildTcgplayerTrackingCsv,
  matchTrackingToOrders,
  parseTrackingResultsCsv,
} from "../src/lib/shipping/tracking-import";

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

const SAMPLE_CSV = `Order #,FirstName,LastName,Address1,Address2,City,State,PostalCode,Country,Order Date,Product Weight,Shipping Method,Item Count,Value Of Products,Shipping Fee Paid,Tracking #,Carrier
742B1842-AFA99B-DBA31,David,Buckley,12 Easy St,,Nantucket,MA,02554-2724,US,2026-07-01,0.07,Standard (7-10 days),1,27.27,4.99,,,
742B1842-072879-750F3,JUBCARLOS,MARTINEZ,123 Main,,Laredo,TX,78040,US,2026-07-01,0.07,Standard (7-10 days),1,9.97,3.99,,,
742B1842-111111-AAAA,Jane,Doe,PO Box 123,,Springfield,IL,62701,US,2026-07-02,0.14,Standard (7-10 days),2,55.00,5.99,,,
742B1842-222222-BBBB,John,Smith,456 Oak Ave,Apt 2,Portland,OR,97201,US,2026-07-02,0.07,Priority,1,260.00,8.99,,,
742B1842-333333-CCCC,"Mary","O'Brien","789 ""Quote"" Lane",,Boston,MA,02108,US,2026-07-03,0.07,Standard (7-10 days),1,15.00,4.49,,,`;

console.log("\nShipping converter\n");

console.log("CSV parse");
const orders = parseTcgplayerShippingCsv(SAMPLE_CSV);
assert(orders.length === 5, "imports five TCGplayer rows");
assert(
  orders[0]!.postalCode === "02554-2724",
  "preserves leading zero in ZIP 02554-2724",
);
assert(orders[2]!.address1.toLowerCase().includes("po box"), "preserves PO Box address");

console.log("\nPackaging weight");
const packed = computePackedWeightOz({
  productWeightOz: 0.07,
  packagingProfileId: "plain_envelope",
  customTareOz: 0.93,
});
assert(packed === 1, "plain envelope 0.07 + 0.93 = 1.00 oz");

console.log("\nUSPS export");
const defaults = defaultShippingDefaults();
assert(!isSenderComplete(defaults.sender), "empty sender fails validation");
assert(
  isSenderComplete(
    normalizeSenderProfile({
      firstName: "A",
      lastName: "B",
      address1: "1 Main",
      city: "X",
      state: "TX",
      postalCode: "78040",
      phone: "555",
      email: "a@b.com",
      country: "US",
    }),
  ),
  "full sender passes validation",
);
const withSender = {
  ...defaults,
  sender: {
    ...defaults.sender,
    firstName: "Game",
    lastName: "Lodge",
    company: "The Game Lodge",
    address1: "123 Main St",
    city: "Laredo",
    state: "TX",
    postalCode: "78040",
    phone: "5555555555",
    email: "shipping@example.com",
  },
};
const prepared = prepareShippingRows(orders, withSender);
const { csv, exportedCount } = exportUspsClickNShipCsv(prepared, withSender);
assert(exportedCount >= 4, "exports valid rows");
assert(csv.includes("742B1842-AFA99B-DBA31"), "order in Reference Number 1 column");
assert(csv.includes("02554-2724"), "ZIP preserved in export");
assert(csv.includes("Shipping Date"), "uses CNSv2 Shipping Date header");
assert(csv.includes("Recipient Address Town/City"), "uses CNSv2 city header");
assert(csv.includes("Item Weight (lb.)"), "uses CNSv2 lb header with period");
assert(csv.includes("Package Weight (oz)"), "uses CNSv2 package weight header");
assert(csv.includes("Sender First Name"), "uses CNSv2 sender first name header");
assert(csv.includes("Sender Cell Phone"), "uses CNSv2 sender phone header");
assert(csv.includes("Game"), "sender first name in export");
assert(csv.includes("5555555555"), "sender phone in export");
assert(csv.includes("shipping@example.com"), "sender email in export");

console.log("\nPrepare rows");
assert(prepared.some((r) => r.status === "ready"), "has ready rows");
const laredo = prepared.find((r) => r.order.city === "Laredo");
assert(
  laredo?.uspsService === "First-Class Mail" && laredo?.uspsPackageType === "Letter",
  "low-value order uses First-Class Mail + Letter",
);
const portland = prepared.find((r) => r.order.valueOfProducts >= 250);
assert(
  portland?.uspsService === "USPS Ground Advantage" &&
    portland?.uspsPackageType === "Choose Your Own Box",
  "high-value order upgrades to tracked Ground Advantage",
);
assert(csv.includes("First-Class Mail"), "export includes First-Class Mail");
assert(csv.includes(",Letter,"), "export includes Letter package type");
const nantucket = prepared.find((r) => r.order.city === "Nantucket");
assert(nantucket?.packedWeightOz === 1, "Nantucket packed weight 1 oz");
assert(
  nantucket?.order.orderNumber === "742B1842-AFA99B-DBA31",
  "order number preserved",
);

const highValue = prepared.find((r) => r.order.valueOfProducts >= 250);
assert(highValue?.signatureRequired === true, "signature for $250+ order");
assert(highValue === portland, "portland is high value order");

const trackedMin = prepared.find((r) => r.order.valueOfProducts === 55);
assert(trackedMin?.serviceLocked === true, "$55 order locks service to Ground Advantage");
assert(
  trackedMin?.uspsService === "USPS Ground Advantage" &&
    trackedMin?.uspsPackageType === "Choose Your Own Box",
  "$55 order uses Ground Advantage + Choose Your Own Box",
);
const overrideBlocked = applyRowOverrides({
  ...trackedMin!,
  overrides: { uspsService: "First-Class Mail", uspsPackageType: "Letter" },
});
assert(
  overrideBlocked.uspsService === "USPS Ground Advantage" &&
    overrideBlocked.uspsPackageType === "Choose Your Own Box",
  "letter mail override ignored on $55+ locked order",
);
assert(laredo?.serviceLocked === false, "low-value order allows service changes");

console.log("\nAddress labels");
const { csv: labelCsv, exportedCount: labelCount } = exportAddressLabelsCsv(prepared);
assert(labelCount >= 4, "exports address labels for valid rows");
assert(labelCsv.includes("David Buckley"), "label CSV has recipient name");
assert(labelCsv.includes("742B1842-AFA99B-DBA31"), "label CSV has order number");

console.log("\nTracking round-trip");
const uspsResults = stringifyCsv([
  ["Reference Number 1", "Tracking Number", "Carrier"],
  ["742B1842-AFA99B-DBA31", "9400111899223857483920", "USPS"],
]);
const tracking = parseTrackingResultsCsv(uspsResults);
const { matched } = matchTrackingToOrders(orders, tracking);
assert(matched.length === 1, "matches tracking to order");
const tcgOut = buildTcgplayerTrackingCsv(matched);
assert(tcgOut.includes("9400111899223857483920"), "TCG tracking CSV has tracking #");

console.log("\nZIP normalization");
assert(
  normalizePostalCode("2554-2724", "US") === "02554-2724",
  "pads 4-digit ZIP with leading zero",
);

const roundTrip = parseCsv(stringifyCsv([["PostalCode"], ["02554-2724"]]));
assert(roundTrip[1]![0] === "02554-2724", "CSV round-trip preserves ZIP text");

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
