import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { parseCustomerSessionToken } from "@/lib/auth/customer-session";
import { challengerPlaySiteUrl } from "@/lib/challenger/play-site";
import { ChallengerDeckPicker } from "./ChallengerDeckPicker";

/** The play site links here. Signed-out players create an account first. */
export default async function ChallengerDecksPage() {
  const jar = await cookies();
  const token = jar.get("customer_session")?.value;
  const session = token ? parseCustomerSessionToken(token) : null;
  if (!session) {
    redirect(`/challenger?next=${encodeURIComponent("/challenger/decks")}`);
  }
  const play = challengerPlaySiteUrl();
  return <ChallengerDeckPicker lobbyUrl={play ? `${play}/lobby` : null} />;
}
