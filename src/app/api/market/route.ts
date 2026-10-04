import { z } from "zod";
import { api } from "@/server/api";
import { propertyData } from "@/server/providers/registry";

const schema = z.object({ months: z.coerce.number().int().min(3).max(36).default(12), zips: z.string().max(400).optional() });

export const GET = api({ permission: "analytics:read", schema }, async ({ input }) => {
  const zips = input.zips ? input.zips.split(",").filter((z) => /^\d{5}$/.test(z)) : undefined;
  return { stats: await propertyData.getMarketStats({ months: input.months, zips }) };
});
