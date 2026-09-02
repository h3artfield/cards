import { redirect } from "next/navigation";

export default async function DeckBuilderRedirect({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  redirect(`/s/${slug}/inventory/professor`);
}
