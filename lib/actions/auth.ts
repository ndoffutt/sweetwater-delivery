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

// Staff login: the PIN decides who you are - Manager (dispatcher) or Admin.
export async function loginManager(pin: string) {
  if (!pin || pin.length < 4) {
    return { error: "PIN must be at least 4 digits" };
  }

  const pinHash = await hashPin(pin);
  const supabase = createAdminClient();

  const { data: user, error } = await supabase
    .from("users")
    .select("id, name, role")
    .eq("pin_hash", pinHash)
    .in("role", ["dispatcher", "admin"])
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

  return { redirect: user.role === "admin" ? "/owner" : "/dispatch" };
}

// Drivers don't use a PIN - one tap signs them in as the active driver.
export async function loginDriver() {
  const supabase = createAdminClient();

  const { data: user, error } = await supabase
    .from("users")
    .select("id, name, role")
    .eq("role", "driver")
    .eq("active", true)
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .single();

  if (error || !user) {
    return { error: "No active driver configured" };
  }

  const token = await createSessionToken({
    id: user.id,
    name: user.name,
    role: user.role,
  });
  setSessionCookie(token);

  return { redirect: "/driver" };
}

export async function logout() {
  cookies().delete(COOKIE_NAME);
  return { redirect: "/" };
}
