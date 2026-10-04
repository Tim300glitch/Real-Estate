import { Suspense } from "react";
import { Explorer } from "@/components/property/Explorer";

export const metadata = { title: "Deal Finder" };
export default function DealFinderPage() {
  return <Suspense><Explorer variant="finder" /></Suspense>;
}
