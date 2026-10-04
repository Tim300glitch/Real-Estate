import { z } from "zod";
import { api } from "@/server/api";
import { propertyData } from "@/server/providers/registry";

const schema = z.object({ bbox: z.string().regex(/^-?[\d.]+,-?[\d.]+,-?[\d.]+,-?[\d.]+$/) });

// Parcel polygons for the viewport, only requested by the map at high zoom.
export const GET = api({ permission: "property:read", rpm: 600, schema }, async ({ input }) => {
  const bbox = input.bbox.split(",").map(Number) as [number, number, number, number];
  if ((bbox[2] - bbox[0]) * (bbox[3] - bbox[1]) > 0.0008) return { type: "FeatureCollection", features: [], tooLarge: true };
  const { results } = await propertyData.searchProperties({ filters: {}, bbox, limit: 3000 });
  const features = [];
  for (const r of results) {
    const ring = await propertyData.getParcel(r.id);
    if (ring) features.push({ type: "Feature", id: r.id, properties: { id: r.id, apn: r.apn }, geometry: { type: "Polygon", coordinates: [ring] } });
  }
  return { type: "FeatureCollection", features };
});
