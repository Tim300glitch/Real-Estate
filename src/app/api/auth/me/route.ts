import { NextResponse } from "next/server";
import { ROLE_PERMISSIONS } from "@/lib/permissions";
import { getSession } from "@/server/auth/session";

export async function GET() {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ user: { id: s.sub, email: s.email, name: s.name, role: s.role }, permissions: ROLE_PERMISSIONS[s.role] });
}
