"use client";

import { useParams } from "next/navigation";
import { StoreCalendarView } from "@/components/StoreCalendarView";

export default function StoreCalendarEmbedPage() {
  const { slug } = useParams<{ slug: string }>();
  return <StoreCalendarView slug={slug} embed />;
}
