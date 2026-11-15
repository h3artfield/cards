import type { Metadata } from "next";
import { storeNameForSlug, storePublicMetadata } from "@/lib/store-metadata";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  return storePublicMetadata({ storeName: await storeNameForSlug(slug) });
}

export default function StoreLayout({ children }: { children: React.ReactNode }) {
  return children;
}
