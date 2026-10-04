import "server-only";
import { scryptSync, timingSafeEqual } from "node:crypto";
import type { Role } from "@/lib/types";

// Demo users (DEMO_MODE=true). With a database configured, users come from
// the `users` table (or Supabase Auth) and this list is ignored.
interface StoredUser { id: string; email: string; name: string; role: Role; salt: string; hash: string }

const hash = (pw: string, salt: string) => scryptSync(pw, salt, 32).toString("hex");
const mk = (id: string, email: string, name: string, role: Role, pw: string): StoredUser => {
  const salt = `wos-${id}`;
  return { id, email, name, role, salt, hash: hash(pw, salt) };
};

const DEMO_USERS: StoredUser[] = [
  mk("u-owner", "owner@demo.wholesale", "Jordan Reyes", "owner", "demo1234"),
  mk("u-acq", "acq@demo.wholesale", "Sam Whitley", "acquisitions", "demo1234"),
  mk("u-dispo", "dispo@demo.wholesale", "Alexis Moreno", "dispositions", "demo1234"),
  mk("u-va", "va@demo.wholesale", "Riley Park", "assistant", "demo1234"),
  mk("u-ro", "viewer@demo.wholesale", "Casey Lin", "read_only", "demo1234"),
];

export function verifyCredentials(email: string, password: string) {
  if (process.env.DEMO_MODE === "false") return null;
  const u = DEMO_USERS.find((x) => x.email.toLowerCase() === email.trim().toLowerCase());
  if (!u) {
    hash(password, "timing-equaliser");
    return null;
  }
  const a = Buffer.from(hash(password, u.salt), "hex");
  const b = Buffer.from(u.hash, "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return { id: u.id, email: u.email, name: u.name, role: u.role };
}

export const DEMO_ACCOUNTS = DEMO_USERS.map(({ email, name, role }) => ({ email, name, role }));
