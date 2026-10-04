import { skipTraceSchema } from "@/lib/schemas";
import { api } from "@/server/api";
import { skipTraceProvider } from "@/server/providers/registry";

export const POST = api({ permission: "skiptrace:run", rpm: 30, schema: skipTraceSchema }, async ({ input }) => {
  return skipTraceProvider().trace(input);
});
