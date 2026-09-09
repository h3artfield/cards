import { eventWantsDeckRegistrationV1 } from "./event-wants-deck-registration-v1";

const cases: Array<{ event: Parameters<typeof eventWantsDeckRegistrationV1>[0]; want: boolean }> = [
  { event: { category: "commander", title: "FNM" }, want: true },
  { event: { category: "other", title: "commander bracket 3" }, want: true },
  { event: { category: "magic", title: "Standard FNM" }, want: false },
  { event: { category: "riftbound", title: "Nexus Nights" }, want: false },
];

let failed = 0;
for (const { event, want } of cases) {
  const got = eventWantsDeckRegistrationV1(event);
  if (got !== want) {
    console.error("FAIL", event, "expected", want, "got", got);
    failed++;
  }
}
if (failed) process.exit(1);
console.log("event-wants-deck-registration-v1 selftest passed");
