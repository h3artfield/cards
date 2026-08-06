import { seedTglMonthSchedule } from "../src/lib/store-calendar/seed-calendar";
import { DEFAULT_STORE_ID } from "../src/lib/firebase/collections";

async function main() {
  const now = new Date();
  const year = Number(process.argv[2] ?? now.getFullYear());
  const month = Number(process.argv[3] ?? now.getMonth() + 1);
  const storeId = process.argv[4] ?? DEFAULT_STORE_ID;

  const result = await seedTglMonthSchedule(storeId, year, month);
  console.log(JSON.stringify({ storeId, year, month, ...result }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
