-- Re-tag historical delivery touches: before the 'delivery' touch type existed,
-- deliveries to active prospects were logged as a 'visit' with the note
-- "Delivery". Convert those to the proper delivery type (van icon).
-- Run AFTER touchpoint_delivery.sql. Safe to run more than once.

update prospect_touchpoints
set type = 'delivery', note = null
where type = 'visit' and note = 'Delivery';
