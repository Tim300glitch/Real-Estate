// Role-based permissions shared by API routes (enforcement) and UI (hiding controls).
import type { Role } from "./types";

export type Permission =
  | "property:read" | "lead:write" | "lead:delete" | "comps:write" | "offer:write" | "offer:send"
  | "contract:write" | "buyer:write" | "disposition:write" | "marketing:send" | "skiptrace:run"
  | "analytics:read" | "settings:write" | "users:manage" | "ai:use" | "export:data";

const ALL: Permission[] = [
  "property:read", "lead:write", "lead:delete", "comps:write", "offer:write", "offer:send", "contract:write", "buyer:write",
  "disposition:write", "marketing:send", "skiptrace:run", "analytics:read", "settings:write", "users:manage", "ai:use", "export:data",
];

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  owner: ALL,
  admin: ALL,
  acquisitions: ["property:read", "lead:write", "comps:write", "offer:write", "offer:send", "contract:write", "skiptrace:run", "analytics:read", "ai:use"],
  dispositions: ["property:read", "comps:write", "buyer:write", "disposition:write", "marketing:send", "contract:write", "analytics:read", "ai:use"],
  assistant: ["property:read", "lead:write", "comps:write", "skiptrace:run", "ai:use"],
  read_only: ["property:read", "analytics:read"],
};

export const ROLE_LABEL: Record<Role, string> = {
  owner: "Owner", admin: "Admin", acquisitions: "Acquisitions", dispositions: "Dispositions", assistant: "Assistant / VA", read_only: "Read-only",
};

export function can(role: Role | undefined, perm: Permission): boolean {
  return !!role && ROLE_PERMISSIONS[role].includes(perm);
}
