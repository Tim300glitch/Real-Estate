import { compsSchema } from "@/lib/schemas";
import { api } from "@/server/api";
import { propertyData } from "@/server/providers/registry";

export const GET = api({ permission: "property:read", schema: compsSchema }, async ({ input }) => {
  const comps = await propertyData.getComps(input);
  return { comps, provider: propertyData.routing().find((r) => r.capability === "comps")?.provider };
});
