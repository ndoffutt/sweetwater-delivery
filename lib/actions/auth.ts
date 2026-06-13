"use server";

import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  hashPin,
  createSessionToken,
  COOKIE_NAME,
  COOKIE_MAX_AGE,
} from "@/lib/auth";

function setSessionCookie(token: string) {
  cookies().set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    // "lax" (not "strict") so the session cookie is sent on the top-level GET
    // that opens the installed PWA / a bookmarked link - otherwise the first
    // load looks logged-out and flashes the PIN screen.
    sameSite: "lax",
    path: "/",
    maxAge: COOKIE_MAX_AGE,
  });
}

const homeFor = (role: string) =>
  role === "admin" ? "/owner" : role === "dispatcher" ? "/dispatch" : "/driver";

// Single login: the PIN identifies the person (driver, Manager, or Owner) so we
// always know who's driving. Routes to the right home for their role.
export async function loginWithPin(pin: string) {
  if (!pin || pin.length < 4) {
    return { error: "PIN must be at least 4 digits" };
  }

  const pinHash = await hashPin(pin);
  const supabase = createAdminClient();

  const { data: user, error } = await supabase
    .from("users")
    .select("id, name, role")
    .eq("pin_hash", pinHash)
    .eq("active", true)
    .is("deleted_at", null)
    .single();

  if (error || !user) {
    return { error: "Invalid PIN" };
  }

  const token = await createSessionToken({
    id: user.id,
    name: user.name,
    role: user.role,
  });
  setSessionCookie(token);

  return { redirect: homeFor(user.role) };
}

export async function logout() {
  cookies().delete(COOKIE_NAME);
  return { redirect: "/" };
}
