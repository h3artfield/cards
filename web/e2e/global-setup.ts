import fs from "node:fs";
import path from "node:path";
import { resetFindings } from "./helpers/findings";

export default async function globalSetup() {
  fs.mkdirSync(path.join(__dirname, "artifacts", "screens"), { recursive: true });
  if (process.env.UX_KEEP_FINDINGS !== "1") {
    resetFindings();
  }
}
