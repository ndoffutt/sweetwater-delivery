-- Town tag for prospects: the East End hamlet/village (Bridgehampton, Sag
-- Harbor, East Hampton, …), shown as a chip and derived from the address.
-- Run in the Supabase SQL editor. Safe to run more than once.

alter table prospects add column if not exists town text;

-- Pre-tag everything we already know: pull the segment right before ", NY"
-- out of the address ("23 Short Beach Rd, Sag Harbor, NY 11963" -> "Sag
-- Harbor"; "Cutchogue, NY 11935" -> "Cutchogue").
update prospects
  set town = trim(substring(address from '([^,]+),\s*NY'))
  where town is null and address ~* ',\s*NY';
