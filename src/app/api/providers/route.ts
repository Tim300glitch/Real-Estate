import { api } from "@/server/api";
import { allProviders, integrationStatus, propertyData } from "@/server/providers/registry";

export const GET = api({ permission: "property:read" }, async () => ({
  routing: propertyData.routing(),
  providers: allProviders(),
  integrations: integrationStatus(),
}));
