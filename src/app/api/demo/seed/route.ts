import { api } from "@/server/api";
import { buildSeed } from "@/server/demo/seed";

// Returns the fictional demo workspace. Only meaningful in DEMO_MODE.
export const GET = api({ permission: "property:read", rpm: 20 }, async () => {
  if (process.env.DEMO_MODE === "false") return { seed: null };
  return { seed: buildSeed() };
});
