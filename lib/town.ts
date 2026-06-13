// The East End hamlet/village from an address — the segment right before
// ", NY". "23 Short Beach Rd, Sag Harbor, NY 11963" -> "Sag Harbor";
// "Cutchogue, NY 11935" -> "Cutchogue". Returns null if no NY town is found.
export function townFromAddress(address: string | null | undefined): string | null {
  if (!address) return null;
  const m = address.match(/([^,]+),\s*NY\b/i);
  return m ? m[1].trim() : null;
}
