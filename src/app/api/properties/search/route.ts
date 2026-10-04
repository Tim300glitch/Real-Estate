import { searchSchema } from "@/lib/schemas";
import { api } from "@/server/api";
import { propertyData } from "@/server/providers/registry";

// POST because filter sets + polygons don't fit comfortably in a query string.
export const POST = api({ permission: "property:read", rpm: 240, schema: searchSchema }, async ({ input }) => {
  return propertyData.searchProperties(input);
});
