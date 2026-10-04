import { Suspense } from "react";
import { Explorer } from "@/components/property/Explorer";

export const metadata = { title: "Map" };
export default function MapPage() {
  return <Suspense><Explorer variant="map" /></Suspense>;
}
