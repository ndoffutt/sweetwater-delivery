import { cookies } from "next/headers";
import { verifySessionToken, COOKIE_NAME } from "./auth";
import type { SessionUser } from "./types";

export async function getSession(): Promise<SessionUser | null> {
  const cookieStore = cookies();
  const token = cookieStore.get(COOKIE_NAME);
  if (!token) return null;
  return verifySessionToken(token.value);
}

export async function requireSession(
  role?: "driver" | "dispatcher"
): Promise<SessionUser> {
  const session = await getSession();
  if (!session) throw new Error("Not authenticated");
  // Manager (dispatcher) and Admin can do everything a driver can; Admin can
  // do everything a Manager can.
  const elevated = session.role === "dispatcher" || session.role === "admin";
  if (role && session.role !== role && !elevated) {
    throw new Error("Unauthorized");
  }
  return session;
}
