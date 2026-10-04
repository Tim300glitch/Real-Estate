import { NextResponse } from "next/server";
import { api } from "@/server/api";
import { propertyData } from "@/server/providers/registry";

export const GET = api({ permission: "property:read" }, async ({ params }) => {
  const id = decodeURIComponent(params.id ?? "");
  if (!/^[\w:.,-]{1,120}$/.test(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  const p = await propertyData.getProperty(id);
  if (!p) return NextResponse.json({ error: "Property not found" }, { status: 404 });
  return p;
});
