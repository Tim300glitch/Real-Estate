import { NextResponse } from "next/server";
import { api } from "@/server/api";
import { propertyData } from "@/server/providers/registry";

export const GET = api({ permission: "property:read" }, async ({ params }) => {
  const id = decodeURIComponent(params.id ?? "");
  if (!/^[\w:.|& -]{1,200}$/.test(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  const [owner, portfolio] = await Promise.all([propertyData.getOwner(id), propertyData.getOwnerPortfolio(id)]);
  return { owner, portfolio };
});
