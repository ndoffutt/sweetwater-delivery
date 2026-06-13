"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSession } from "@/lib/session";
import { hashPin } from "@/lib/auth";

type TeamRole = "driver" | "dispatcher" | "admin";

async function requireAdmin() {
  const session = await getSession();
  if (!session || session.role !== "admin") throw new Error("Unauthorized");
  return session;
}

function validPin(pin: string): boolean {
  return /^\d{4,6}$/.test(pin);
}

// A PIN must be unique across the team, since login resolves the person by PIN.
async function pinTaken(
  supabase: ReturnType<typeof createAdminClient>,
  pinHash: string,
  exceptId?: string
): Promise<boolean> {
  let q = supabase
    .from("users")
    .select("id")
    .eq("pin_hash", pinHash)
    .is("deleted_at", null);
  if (exceptId) q = q.neq("id", exceptId);
  const { data } = await q.limit(1);
  return (data?.length ?? 0) > 0;
}

export async function createTeamMember(input: { name: string; role: TeamRole; pin: string }) {
  await requireAdmin();
  const name = input.name.trim();
  if (!name) return { error: "Name is required" };
  if (!validPin(input.pin)) return { error: "PIN must be 4–6 digits" };

  const supabase = createAdminClient();
  const pin_hash = await hashPin(input.pin);
  if (await pinTaken(supabase, pin_hash)) {
    return { error: "That PIN is already in use — pick another" };
  }
  const { data, error } = await supabase
    .from("users")
    .insert({ name, role: input.role, pin_hash })
    .select("id, name, role, phone, active, created_at")
    .single();
  if (error) return { error: error.message };
  revalidatePath("/settings");
  return { user: data };
}

export async function setTeamMemberPin(id: string, pin: string) {
  await requireAdmin();
  if (!validPin(pin)) return { error: "PIN must be 4–6 digits" };
  const supabase = createAdminClient();
  const pin_hash = await hashPin(pin);
  if (await pinTaken(supabase, pin_hash, id)) {
    return { error: "That PIN is already in use — pick another" };
  }
  const { error } = await supabase.from("users").update({ pin_hash }).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/settings");
  return { success: true };
}

export async function renameTeamMember(id: string, name: string) {
  await requireAdmin();
  const trimmed = name.trim();
  if (!trimmed) return { error: "Name is required" };
  const supabase = createAdminClient();
  const { error } = await supabase.from("users").update({ name: trimmed }).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/settings");
  return { success: true };
}

export async function setTeamMemberActive(id: string, active: boolean) {
  const session = await requireAdmin();
  if (id === session.id && !active) return { error: "You can't deactivate yourself" };
  const supabase = createAdminClient();
  // Never leave the team without an active Owner.
  if (!active) {
    const { data: target } = await supabase.from("users").select("role").eq("id", id).single();
    if (target?.role === "admin") {
      const { data: admins } = await supabase
        .from("users")
        .select("id")
        .eq("role", "admin")
        .eq("active", true)
        .is("deleted_at", null);
      if ((admins?.length ?? 0) <= 1) return { error: "Can't deactivate the only Owner" };
    }
  }
  const { error } = await supabase.from("users").update({ active }).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/settings");
  return { success: true };
}

export async function removeTeamMember(id: string) {
  const session = await requireAdmin();
  if (id === session.id) return { error: "You can't remove yourself" };
  const supabase = createAdminClient();
  const { data: target } = await supabase.from("users").select("role").eq("id", id).single();
  if (target?.role === "admin") {
    const { data: admins } = await supabase
      .from("users")
      .select("id")
      .eq("role", "admin")
      .eq("active", true)
      .is("deleted_at", null);
    if ((admins?.length ?? 0) <= 1) return { error: "Can't remove the only Owner" };
  }
  const { error } = await supabase
    .from("users")
    .update({ deleted_at: new Date().toISOString(), active: false })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/settings");
  return { success: true };
}
