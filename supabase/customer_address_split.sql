-- Structured address (street / town / zip) + email on customers.
--
-- The single `address` column stays canonical — geocoding, maps, and every
-- existing read still use it. These new columns are the editable *parts*, and
-- the app composes them back into `address` on save. Email is captured for
-- every customer going forward.
alter table customers add column if not exists street text;
alter table customers add column if not exists town   text;
alter table customers add column if not exists zip    text;
alter table customers add column if not exists email  text;

-- Backfill the parts from existing one-line addresses, best-effort. Handles the
-- common "…street…, Town, NY 11963" shape (with or without a place-name prefix).
update customers set
  zip = coalesce(zip, (regexp_match(address, '(\d{5})(?:-\d{4})?\s*$'))[1]),
  town = coalesce(town, trim(both from (regexp_match(address, ',\s*([^,]+?)\s*,\s*[A-Z]{2}\s*\d{5}'))[1])),
  street = coalesce(
    street,
    nullif(trim(both from regexp_replace(address, '\s*,\s*[^,]+,\s*[A-Z]{2}\s*\d{5}(?:-\d{4})?\s*$', '')), '')
  )
where address is not null and (street is null or town is null or zip is null);
