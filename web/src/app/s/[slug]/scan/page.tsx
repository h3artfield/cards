import { redirect } from "next/navigation";

export default async function ScanDestinationRedirect({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  redirect(`/s/${slug}/collection`);
}
