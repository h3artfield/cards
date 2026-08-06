"use client";

import { useParams } from "next/navigation";
import { StoreFlyerDisplayClient } from "@/components/calendar/StoreFlyerDisplayClient";

export default function PublicStoreFlyerDisplayPage() {
  const { slug } = useParams<{ slug: string }>();
  return <StoreFlyerDisplayClient slug={slug} orientation="portrait" />;
}
