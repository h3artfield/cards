import { redirect } from "next/navigation";

export default function AdminPercentagesRedirect() {
  redirect("/admin/pricing?section=buy");
}
