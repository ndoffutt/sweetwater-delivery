-- B2B Prospects — lightweight outreach tracker (replaces HubSpot)
-- Run this in the Supabase SQL Editor (safe to re-run; drops + recreates).
--
-- Seed imported from HubSpot 2026-06-11 using the DEALS pipeline as the source
-- of truth. Stage mapping: Opportunity/Pilot→working, Closed Won→active,
-- Off For Now→on_hold, Out of Scope→dead. Deals in the DELETE stage and
-- household/individual leads are excluded (B2B only). Notes + call logs are
-- preserved as touchpoints with their original dates.

drop table if exists prospect_touchpoints cascade;
drop table if exists prospects cascade;

create table prospects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact_name text,        -- main point of contact
  contact_title text,
  phone text,
  email text,
  address text,              -- at least "Town, NY" so the map can place it
  town text,                 -- East End hamlet/village, shown as a tag
  website text,
  lat double precision,
  lng double precision,
  -- "Commercial" is the umbrella; these are the segments within it.
  business_type text not null default 'other'
    check (business_type in ('hotel', 'club', 'restaurant', 'retail', 'prop_manager', 'other')),
  -- new: spotted, never contacted · working: in conversation, pursuing
  -- active: customer now · on_hold: revisit later · dead: never winnable
  status text not null default 'new'
    check (status in ('new', 'working', 'active', 'on_hold', 'dead')),
  -- what an active account buys: employees / linen / referral
  services text[] not null default '{}',
  notes text,                -- persistent notes, kept for life of the relationship
  customer_id uuid references customers(id),
  hubspot_id text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table prospect_touchpoints (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid not null references prospects(id) on delete cascade,
  type text not null check (type in ('call', 'email', 'text', 'visit', 'note')),
  note text,
  created_by text,
  created_at timestamptz not null default now()
);

create index prospect_touchpoints_prospect_idx
  on prospect_touchpoints(prospect_id, created_at desc);

create trigger prospects_updated_at
  before update on prospects for each row execute function set_updated_at();

-- ============================================================
-- SEED — businesses
-- ============================================================
insert into prospects (name, contact_name, contact_title, phone, email, address, website, business_type, status, notes) values

-- ── WON / ACTIVE ACCOUNTS ──────────────────────────────────
('Hedges Inn', null, null, null, null, '74 James Ln, East Hampton, NY 11937', 'thehedgesinn.com', 'hotel', 'active', '~$50k account. New ownership spring 2026; relationship reinstated. Mon/Thu service.'),
('Charles Gallanti Inc.', 'Sharon', 'Property Manager', null, null, 'Wainscott, NY', null, 'prop_manager', 'active', '$21.6k moth-remediation job Apr–May 2026, paid in full. Manages multiple houses — strong referral source.'),
('Loewe', 'Bethanie Theriault', 'Store Director', '(631) 658-3866', 'bethanie_theriault@us.loewe.com', '53 Main St, East Hampton, NY 11937', 'us.loewe.com', 'retail', 'active', 'Mobile: (917) 562-4594. ~$2k/season. Was frustrated with previous provider.'),
('Brunello Cucinelli', 'Dakota Craine', 'Manager', '(631) 324-3400', 'dakota.craine@brunellocucinelli.com', '43 Main St, East Hampton, NY 11937', 'brunellocucinelli.com', 'retail', 'active', '~$200/week. Mon + Thu pickups through summer. Employee clothing.'),
('Zimmermann', null, null, null, null, '48 Main St, East Hampton, NY 11937', 'zimmermann.com', 'retail', 'active', 'Weekly pickup/drop-off, billed via Worksmith.'),
('Ralph Lauren', 'Kathleen', 'Manager', null, null, '41 Main St, East Hampton, NY 11937', 'ralphlauren.com', 'retail', 'active', 'Ann (sales) + Kathleen (manager). Functional buttonholes were the ask that won the business.'),
('Hamptons Exclusive Property Mgmt', 'Stephen', null, '(631) 276-2807', 'hamptonsexclusive@yahoo.com', 'East Hampton, NY', null, 'prop_manager', 'active', 'Brings his clients'' dry cleaning; leverage delivery for those households.'),
('AQR Capital Management', 'Kelly Lombardo', 'Account Executive', '(212) 587-3371', 'kelly.lombardo@aqr.com', 'East Hampton, NY', 'aqr.com', 'other', 'active', null),

-- ── PILOTS / IN TALKS ──────────────────────────────────────
('Rolex', null, null, null, null, '21 Main St, East Hampton, NY 11937', 'rolex.com', 'retail', 'working', 'Pilot. Store will ask corporate about employee dry cleaning.'),
('Peserico', 'Paulina', null, null, null, 'Main St, East Hampton, NY 11937', 'peserico.com', 'retail', 'working', 'Pilot, ~$10k potential. Tish is the decision contact.'),
('Rag & Bone', null, null, null, null, 'East Hampton, NY', 'rag-bone.com', 'retail', 'working', 'Alterations bid submitted via Worksmith — under review.'),
('Huntting Inn', 'Sheila', null, '(631) 324-0410', 'reservations@hunttinginn.com', '94 Main St, East Hampton, NY 11937', 'hunttinginn.com', 'hotel', 'working', 'Price-match vs Mattituck for sheets & duvets — pricing emailed Apr 2026, awaiting theirs.'),
('Wainscott Woods Retreat', 'Charlene', null, '(631) 907-4119', 'charlene@wainscottwoodsretreat.org', 'Wainscott, NY', 'wainscottwoodsretreat.org', 'hotel', 'working', 'Pricing with investors/team for budget review.'),
('Barons Cove', 'Ron Johnson', 'Manager', '(631) 725-2100', null, '31 W Water St, Sag Harbor, NY 11963', 'baronscove.com', 'hotel', 'working', 'Closed for renovations over winter — reopening summer 2026. Follow up now.'),
('Yacht Hampton', 'Joe', 'Owner', '(631) 500-7777', 'captain@yachthampton.com', 'Sag Harbor, NY', 'yachthampton.com', 'other', 'working', 'Wash & fold for boat towels. Quoted $4.75/lb, 12 lb min; delivery 1-week turnaround or 3-day in-store.'),
('Parrish Art Museum', null, null, '(631) 283-2118', 'development@parrishart.org', '279 Montauk Hwy, Water Mill, NY 11976', 'parrishart.org', 'other', 'working', 'GM wants weekly pickup of 3–15 tablecloths; currently with another company. Ops team was to follow up.'),
('Yardley & Pino Funeral Home', null, null, null, null, 'Sag Harbor, NY', null, 'other', 'working', 'Directors already drop off small orders. Two funeral homes — leverage both.'),

-- ── ACTIVE TARGETS (contacted) ─────────────────────────────
('Maidstone Club', 'Kenneth Koch', 'General Manager', '(631) 324-0510', 'kkoch@maidstoneclub.com', '50 Old Beach Ln, East Hampton, NY 11937', 'maidstoneclub.org', 'club', 'working', null),
('Rosehip Partners Real Estate', null, null, '(631) 324-0009', 'info@rosehippartners.com', 'East Hampton, NY', 'rosehippartners.com', 'prop_manager', 'working', 'Luxury brokerage — closing-gift / client-service angle.'),
('J Crew', null, null, null, null, 'Main St, East Hampton, NY', 'jcrew.com', 'retail', 'working', null),
('Devon Yacht Club', 'Pat', 'General Manager', '(631) 267-6340', 'devonoffice@devonyc.com', '10 Abrams Landing Rd, Amagansett, NY 11930', 'devonyc.com', 'club', 'working', 'Will bring table skirts in when they need cleaning.'),
('South Fork Country Club', 'Chris Thomas', 'Events', '(631) 267-3575', null, '730 Old Stone Hwy, Amagansett, NY 11930', 'southforkcc.net', 'club', 'working', null),
('Sag Harbor Inn', 'Kathleen', null, '(631) 725-2949', null, '45 W Water St, Sag Harbor, NY 11963', 'sagharborinn.com', 'hotel', 'working', 'Email to be forwarded to housekeeping manager.'),
('Northampton Colony Yacht Club', null, null, '(631) 725-3304', 'manager@hamptonyc.com', 'Sag Harbor, NY 11963', 'northamptoncyc.com', 'club', 'working', null),
('Bridgehampton Tennis & Surf Club', null, null, '(631) 537-1180', 'info@thebtsc.com', '231 Mid Ocean Dr, Bridgehampton, NY 11932', 'thebtsc.com', 'club', 'working', 'Event-planner angle; calls go straight to voicemail.'),
('Southampton Yacht Club', 'Mark Caldwell', null, '(631) 283-9888', null, '96 Little Neck Rd, Southampton, NY 11968', 'southamptonyachtclub.org', 'club', 'working', 'No voicemail, no email found — try in person.'),
('Oceanside Staffing', null, null, '(954) 636-7879', 'info@oceansidestaffing.us', 'Southampton, NY', 'oceansidestaffing.us', 'other', 'working', 'Luxury household & estate staffing — staff uniforms angle.'),
('East End Carpet & Upholstery', 'Karen', 'General Manager', '(631) 338-7693', null, 'Southampton, NY', 'eastendcarpet.com', 'other', 'working', 'They quote on-site rug/carpet work at our retail rate; we get wholesale. Karen seemed interested.'),
('Canoe Place Inn', null, 'Events Director', '(631) 763-6300', 'hello@canoeplace.com', '239 E Montauk Hwy, Hampton Bays, NY 11946', 'canoeplace.com', 'hotel', 'working', null),
('Hampton Bays Yacht Club', 'Chris', null, '(631) 723-9973', 'hbyc@optonline.net', '31 Gardners Ln, Hampton Bays, NY 11946', 'hamptonbaysyachtclub.com', 'club', 'working', 'Phone line frequently dead.'),
('Shinnecock Yacht Club', null, null, '(631) 653-9897', 'coachjohn@shinnecockyachtclub.com', '43 Niamogue Ln, Quogue, NY 11959', 'shinnecockyachtclub.com', 'club', 'working', 'Number out of service over winter — retry in season.'),
('Stone Creek Inn', null, null, '(631) 653-6770', 'info@stonecreekinn.com', '405 Montauk Hwy, East Quogue, NY 11942', 'stonecreekinn.com', 'restaurant', 'working', null),
('Southold Yacht Club', null, null, '(631) 765-5629', 'info@southoldyachtclub.com', '165 N Parish Dr, Southold, NY 11971', 'southoldyachtclub.com', 'club', 'working', null),
('Sound Aircraft Services', null, null, '(631) 537-2202', 'ops@soundaircraftservices.com', 'East Hampton Airport, Wainscott, NY 11975', 'soundaircraftservices.com', 'other', 'working', 'Phone not in service when last tried.'),
('West Boulder Capital', 'Jonathan', null, null, 'jonathan@westbouldercapital.com', 'East Hampton, NY', 'westbouldercapital.com', 'other', 'working', null),
('DMD Hamptons Cleaning', 'Diana Ramirez', 'Owner', '(631) 353-8095', 'dmdhamptonscleaning@gmail.com', 'East Hampton, NY', null, 'other', 'working', 'House-cleaning company — channel for client dry cleaning.'),
('Village Custom Upholstery', 'Edwin Duran', 'Owner', '(631) 492-7251', 'villagecustomupholstery@gmail.com', 'Southampton, NY', null, 'other', 'working', 'Said they would send work over.'),

-- ── NEW (no touches yet) ───────────────────────────────────
('Complements', null, null, null, null, 'Main St, Bridgehampton, NY 11932', null, 'retail', 'new', 'Bridgehampton retail blitz Jun 2026 — ~$500 target.'),
('Xanadu', null, null, null, null, 'Main St, Bridgehampton, NY 11932', null, 'retail', 'new', 'Bridgehampton retail blitz Jun 2026 — ~$500 target.'),
('Leallo', null, null, null, null, 'Main St, Bridgehampton, NY 11932', null, 'retail', 'new', 'Bridgehampton retail blitz Jun 2026 — ~$500 target.'),
('Malia Mills', null, null, null, null, 'Main St, Bridgehampton, NY 11932', null, 'retail', 'new', 'Bridgehampton retail blitz Jun 2026 — ~$500 target.'),
('Annabel', null, null, null, null, 'Main St, Bridgehampton, NY 11932', null, 'retail', 'new', 'Bridgehampton retail blitz Jun 2026 — ~$500 target.'),
('Stella Flame', null, null, null, null, 'Main St, Bridgehampton, NY 11932', null, 'retail', 'new', 'Bridgehampton retail blitz Jun 2026 — ~$500 target.'),
('Waves', null, null, null, null, 'Main St, Bridgehampton, NY 11932', null, 'retail', 'new', 'Bridgehampton retail blitz Jun 2026 — ~$500 target.'),
('Kith', null, null, null, null, 'Main St, Bridgehampton, NY 11932', null, 'retail', 'new', 'Bridgehampton retail blitz Jun 2026 — ~$500 target.'),
('East Hampton Town Police', null, null, '(631) 537-7575', null, '131 Wainscott Northwest Rd, Wainscott, NY 11975', 'ehamptonny.gov', 'other', 'new', 'Offer account setup for officers — get names/info, 30–50% off uniforms.'),
('Hampton Bays Chamber of Commerce', null, null, '(631) 728-2211', null, 'Hampton Bays, NY', 'hamptonbayschamber.com', 'other', 'new', null),
('Southampton Chamber of Commerce', null, null, '(631) 283-0402', null, 'Southampton, NY', 'southamptonchamber.com', 'other', 'new', null),
('Amagansett Chamber of Commerce', null, null, '(516) 456-4016', null, 'Amagansett, NY', 'amagansettchamber.org', 'other', 'new', null),
('Sag Harbor Chamber of Commerce', null, null, '(631) 745-0689', null, 'Sag Harbor, NY', 'sagharborchamber.com', 'other', 'new', null),

-- ── PARKED (off for now / seasonal callback) ───────────────
('The 1770 House', 'Caroline', null, '(631) 324-1770', 'info@1770house.com', '143 Main St, East Hampton, NY 11937', '1770house.com', 'hotel', 'on_hold', 'Uses Mattituck. Same owner as Baker House — hold.'),
('The Baker House 1650', 'Sarah', null, '(631) 324-4081', 'info@bakerhouse1650.com', '181 Main St, East Hampton, NY 11937', 'bakerhouse1650.com', 'hotel', 'on_hold', 'Happy with Mattituck; price sheet left.'),
('Mill House Inn', 'Kelli', 'Innkeeper', '(631) 324-9766', 'innkeeper@millhouseinn.com', '31 N Main St, East Hampton, NY 11937', 'millhouseinn.com', 'hotel', 'on_hold', 'No B2B need, but Kelli refers her guests/customers to us.'),
('Journey East Hampton', 'Erika', null, '(631) 324-4550', 'erika@journeyeasthampton.com', '490 Pantigo Rd, East Hampton, NY 11937', 'journeyeasthampton.com', 'hotel', 'on_hold', 'Laundry on-site. Will add us to the guest amenities list if turnaround is fast.'),
('Art House Bed & Breakfast', 'Michael', null, '(631) 907-4645', 'getinfo@easthampton-arthouse-bedandbreakfast.com', 'East Hampton, NY 11937', 'easthampton-arthouse-bedandbreakfast.com', 'hotel', 'on_hold', '16 years, never needed it — will keep us in mind.'),
('The Roundtree, Amagansett', 'Bobby', 'Manager', null, 'guestservices@theroundtreehotels.com', '273 Main St, Amagansett, NY 11930', 'theroundtreehotels.com', 'hotel', 'on_hold', 'Schedules only when needed; busier in summer.'),
('Amagansett Golf Club', null, null, '(631) 267-3575', 'tgarvin@amagansettgc.net', 'Amagansett, NY 11930', 'amagansettgc.net', 'club', 'on_hold', null),
('East Hampton Golf Club', 'Tony Seffa', 'General Manager', '(631) 324-7007', 'jglasstein@ehgc.com', '281 Abrahams Path, East Hampton, NY 11937', 'ehgc.com', 'club', 'on_hold', 'Staff does basics on-site; said they''ll reach out for dry cleaning.'),
('Topping Rose House', 'Matt', null, '(631) 537-0870', 'guestservice@toppingrosehouse.com', '1 Bridgehampton-Sag Harbor Tpke, Bridgehampton, NY 11932', 'toppingrosehouse.com', 'hotel', 'on_hold', 'Jun 2026: current provider''s pricing is significantly below ours — no strategy to compete yet.'),
('Star Island Yacht Club', 'Ryan', null, '(631) 668-5052', 'marina@starislandyc.com', '59 Star Island Rd, Montauk, NY 11954', 'starislandyc.com', 'club', 'on_hold', null),
('Montauk Airport', null, null, '(631) 668-3738', 'info@montaukairport.com', '199 E Lake Dr, Montauk, NY 11954', 'montaukairport.com', 'other', 'on_hold', null),
('Sag Harbor Yacht Club', 'Kristen', null, '(631) 725-0567', 'info@sagharboryc.org', '27 Bay St, Sag Harbor, NY 11963', 'sagharboryc.org', 'club', 'on_hold', '"Keep us in mind" — unlikely near-term.'),
('Noyac Golf Club', null, null, '(631) 725-1800', 'rebecca@noyacgolfclub.com', '51 Wildwood Rd, Sag Harbor, NY 11963', 'noyacgolfclub.com', 'club', 'on_hold', 'All in-house; declined twice.'),
('Shinnecock Hills Golf Club', 'Nick Conlin', null, '(631) 283-1310', 'frontdesk@shinnecockhills.us', '200 Tuckahoe Rd, Southampton, NY 11968', 'shinnecockhillsgolfclub.org', 'club', 'on_hold', 'All cleaning in-house.'),
('Sebonack Golf Club', 'Chris Hove', 'General Manager', '(631) 287-4444', 'chris.hove@sebonack.com', '405 Sebonac Rd, Southampton, NY 11968', 'sebonack.com', 'club', 'on_hold', 'Laundry on-site.'),
('Bullhead Yacht Club', null, null, '(631) 283-9403', 'style.marble@gmail.com', '362 W Neck Rd, Southampton, NY', 'bullheadyachtclub.com', 'club', 'on_hold', null),
('Suffolk County (Gabreski Airport)', 'Joshua Smith', 'Airport Manager', '(631) 852-8095', 'joshua.smith@suffolkcountyny.gov', 'Westhampton Beach, NY 11978', 'suffolkcountyny.gov', 'other', 'on_hold', 'County-run; own regulated cleaning operations.'),
('North Fork Country Club', null, null, '(631) 734-7139', 'mail@northforkcc.com', '26342 Main Rd, Cutchogue, NY 11935', 'northforkcc.com', 'club', 'on_hold', 'Contracted with Mattituck Laundry.'),
('Baiting Hollow Club', 'Chris', null, '(631) 369-4455', 'chris@baitinghollowclub.com', '100 Club Drive, Baiting Hollow, NY 11933', 'baitinghollowclub.com', 'club', 'on_hold', null),
('Bonne Nuit', 'Jennifer', null, null, null, 'East Hampton, NY', null, 'retail', 'on_hold', 'Mostly underwear, rare need; possible tailoring. Uses the cleaner across the street as primary.'),
('Prada', null, null, null, null, '2 Main St, East Hampton, NY 11937', 'prada.com', 'retail', 'on_hold', 'No dry cleaning or alterations need currently.'),
('Zadig & Voltaire', null, null, null, null, 'Main St, East Hampton, NY 11937', 'zadig-et-voltaire.com', 'retail', 'on_hold', 'Good conversation — will come to us for alterations when needed.'),

-- ── LOST / OUT OF SCOPE ────────────────────────────────────
('Atlantic Golf Club', null, null, '(631) 537-1818', null, '1040 Scuttlehole Rd, Bridgehampton, NY 11932', 'atlanticgolf.org', 'club', 'dead', 'Laundry on-site. "STOP calling, she is not interested."'),
('Loro Piana', 'Allen', null, null, null, '31 Main St, East Hampton, NY 11937', 'loropiana.com', 'retail', 'dead', '5 years with another cleaner; denied our Worksmith pricing Dec 2025.'),
('London Jewelers', 'Sonya', null, null, null, '2 Main St, East Hampton, NY 11937', 'londonjewelers.com', 'retail', 'dead', 'Employee-discount angle pitched three times; no commitment.'),
('Goop', 'Anna', null, null, null, 'Amagansett Square, Amagansett, NY 11930', 'goop.com', 'retail', 'dead', 'Onboarded via Worksmith; work is rare. Will send when needed.'),
('East Hampton House', null, null, null, null, '226 Pantigo Rd, East Hampton, NY 11937', null, 'hotel', 'dead', 'Staff cleans in-house; left cards at the local-business table.'),
('East Hampton Colonial Inn', null, null, null, null, 'East Hampton, NY', null, 'hotel', 'dead', 'No direct phone number found.'),
('Guild Hall', 'Eliza Rand', 'Events', null, null, '158 Main St, East Hampton, NY 11937', 'guildhall.org', 'other', 'dead', 'Staff presses on-site; will use us only for emergencies/events.'),
('Nick & Toni''s', 'Myka', null, null, null, '136 N Main St, East Hampton, NY 11937', 'nickandtonis.com', 'restaurant', 'dead', 'Long-time service in place; would not name them.'),
('Village Bistro', null, null, null, null, 'East Hampton, NY', null, 'restaurant', 'dead', 'Unreachable — broken website, no voicemail, opens 5pm.'),
('The Clubhouse', 'Greg', 'Manager', '(631) 537-2695', 'greg@clubhousehamptons.com', '174 Daniels Hole Rd, East Hampton, NY 11937', 'clubhousehamptons.com', 'club', 'dead', null),
('Allstate — Joseph Haines Agency', 'Joseph Haines', 'Agent', '(631) 537-3560', null, 'Wainscott, NY 11975', 'agents.allstate.com', 'other', 'dead', 'Insurance-claims angle (smoke/mold/water damage). Wanted a price sheet — never followed up. Worth reviving?'),
('Montauk Lake Club', 'Jackie', null, '(631) 668-5705 x101', 'info@montauklakeclub.com', '211 E Lake Dr, Montauk, NY 11954', 'montauklakeclub.com', 'club', 'dead', 'Too far. Tina x4402 was the follow-up contact.'),
('Bagatelle at Gosman''s', null, null, null, null, '500 W Lake Dr, Montauk, NY 11954', null, 'restaurant', 'dead', 'Did one load, they were happy — needs $1k/week to be worth the Montauk drive. Revisit if route extends.'),
('Sole East Resort', 'Gina', null, null, null, '90 Second House Rd, Montauk, NY 11954', 'soleeast.com', 'hotel', 'dead', 'Owner bought a laundry facility; all processed in-house.'),
('360 East at Montauk Downs', 'Melanie', null, null, null, 'Montauk Downs, Montauk, NY 11954', null, 'restaurant', 'dead', null),
('Mavericks Montauk', null, null, null, null, 'Montauk, NY 11954', null, 'restaurant', 'dead', null),
('A+ Towels & Linen', 'Mike', null, null, null, 'Montauk, NY', null, 'other', 'dead', 'Linen rental company; won''t handle dry cleaning out east. Montauk too far for us.'),
('Poxabogue Golf Center', null, null, '(631) 537-0025', 'golfshop@poxgolf.com', 'Montauk Hwy, Bridgehampton, NY 11932', 'poxgolf.com', 'club', 'dead', 'Golf center — no real need.'),
('The Bridge Golf Club', 'Natalia', null, null, null, '1180 Millstone Rd, Bridgehampton, NY 11932', 'thebridgegolfclub.com', 'club', 'dead', 'Contracted with Mattituck.'),
('Wolffer Estate Vineyard', 'Shana', 'Club Manager', null, null, '139 Sagg Rd, Sagaponack, NY 11962', 'wolffer.com', 'other', 'dead', null),
('The Sagaponack', null, null, null, null, 'Sagaponack, NY 11962', null, 'restaurant', 'dead', null),
('The Water Mill', null, null, null, null, 'Water Mill, NY 11976', null, 'other', 'dead', 'Art studio — likely dead end.'),
('Hampton Maid', 'Sarah', 'Guest Services', '(631) 728-4166 x102', 'info@hamptonmaid.com', '259 E Montauk Hwy, Hampton Bays, NY 11946', 'hamptonmaid.com', 'hotel', 'dead', 'On-site laundry; confirmed no need Jun 2026.'),
('Peconic Bay Yacht Club', 'John', null, '(631) 407-5200', 'pbyc@culinartinc.com', '64300 Main Rd, Southold, NY 11971', 'culinartcateringcollection.com', 'club', 'dead', 'Contracted elsewhere; "not interested at all."'),
('Shelter Island Yacht Club', null, null, '(631) 749-0888', 'm.fanning@siyc.com', '12 Chequit Ave, Shelter Island Heights, NY 11965', 'siyc.com', 'club', 'dead', 'Needs a ferry — logistically out.'),
('Meadowlark North Fork', null, null, null, null, 'Cutchogue, NY 11935', null, 'other', 'dead', 'With Mattituck since they opened. North Fork is Mattituck territory.'),
('Casa 44', null, null, null, null, 'Southampton, NY', null, 'restaurant', 'dead', '~$242 in counter sales; prefers their own pickup/drop-off.'),
('Hamptons Chutney Co.', null, null, null, null, 'Amagansett Square, Amagansett, NY 11930', null, 'restaurant', 'dead', 'Contracted linen replacement service.'),
('Loaves & Fishes', 'Sybille Van Kemp', null, null, null, '50 Sagg Main St, Sagaponack, NY 11962', null, 'restaurant', 'dead', 'Line always busy; never reached.'),
('RG NY', 'John', 'Manager', null, null, 'East Hampton, NY', null, 'other', 'dead', 'Rental equipment company with own laundry facility.'),
('Meridith Baer (Home Staging)', null, null, '(310) 204-5353', 'home@meridithbaer.com', 'Southampton, NY', 'meridithbaer.com', 'other', 'dead', 'Central hub isn''t local.'),
('Hampton Home Services', null, null, '(917) 628-4435', 'hamptonhomeservices@icloud.com', 'Southampton, NY', null, 'prop_manager', 'dead', 'Has own facilities; not interested.');

-- ============================================================
-- SEED — touchpoint history (from HubSpot notes + call logs)
-- ============================================================
insert into prospect_touchpoints (prospect_id, type, note, created_by, created_at)
select p.id, v.kind, v.body, 'HubSpot import', v.ts::timestamptz
from (values
  -- Hedges Inn
  ('Hedges Inn', 'note', 'Email address for previous manager no longer works', '2026-01-30T14:00:00Z'),
  ('Hedges Inn', 'note', 'New ownership — need to reinstate relationship', '2026-04-23T14:00:00Z'),
  ('Hedges Inn', 'note', 'Thrilled to start using our services again this year', '2026-06-02T16:27:00Z'),
  ('Hedges Inn', 'visit', 'First drop-off of the summer today — fully back', '2026-06-04T19:34:00Z'),
  -- Charles Gallanti
  ('Charles Gallanti Inc.', 'call', 'Sharon: clean all household items incl. dry cleaning for a home with an infestation', '2026-04-10T15:00:00Z'),
  ('Charles Gallanti Inc.', 'note', 'Items picked up: dry cleaning, wash & fold, rugs, household items', '2026-04-22T14:00:00Z'),
  ('Charles Gallanti Inc.', 'note', 'Property manager — one house ~$15k due to moth issue', '2026-04-23T14:00:00Z'),
  ('Charles Gallanti Inc.', 'note', 'Dropped off first batch (1/3)', '2026-04-28T13:00:00Z'),
  ('Charles Gallanti Inc.', 'note', 'Final batch delivered, invoices paid. Client and PM both pleased — will recommend us', '2026-05-06T14:00:00Z'),
  ('Charles Gallanti Inc.', 'note', 'One-off cleaning, not recurring', '2026-06-04T19:39:00Z'),
  -- Loewe
  ('Loewe', 'visit', 'Jon visited. Beth (manager) very interested, frustrated with current provider', '2026-04-01T18:00:00Z'),
  ('Loewe', 'call', 'Katherine: Beth has our details — definitely using us for the summer', '2026-04-07T14:00:00Z'),
  ('Loewe', 'visit', 'Nate: dropped off stain pens. Small weekly orders', '2026-06-04T19:35:00Z'),
  -- Brunello Cucinelli
  ('Brunello Cucinelli', 'note', 'Price list sent and approved — will reach out when ready', '2025-08-19T19:06:00Z'),
  ('Brunello Cucinelli', 'note', 'Passed on scheduled weekly cleaning; prefer bringing items as needed', '2025-09-20T14:00:00Z'),
  ('Brunello Cucinelli', 'visit', 'Jon visited. Dakota Craine interested — follow up via email for invoicing', '2026-04-01T18:00:00Z'),
  ('Brunello Cucinelli', 'visit', 'Nate: stain pens dropped off. ~$200 weekly, Mon/Thu pickups all summer, employee clothing', '2026-06-04T19:36:00Z'),
  -- Zimmermann
  ('Zimmermann', 'call', 'Meet & greet planned on delivery runs, potential pickup', '2025-08-19T14:00:00Z'),
  ('Zimmermann', 'note', 'Weekly pickups working well — ~$500 total sales so far', '2025-09-20T14:00:00Z'),
  ('Zimmermann', 'note', '$1k order pickup tomorrow', '2025-10-30T14:00:00Z'),
  ('Zimmermann', 'note', 'Weekly delivery work, billed via Worksmith', '2026-04-23T14:00:00Z'),
  -- Ralph Lauren
  ('Ralph Lauren', 'visit', 'Jon: talked with Ann (sales) + Kathleen (manager). Functional buttonholes are the ask', '2026-04-01T18:00:00Z'),
  ('Ralph Lauren', 'call', 'Kristy: GM out of town, back in one week', '2026-04-08T14:00:00Z'),
  -- Hamptons Exclusive
  ('Hamptons Exclusive Property Mgmt', 'call', 'Stephen is on board. Clients'' dry cleaning via his service runs; leverage delivery', '2026-03-06T15:17:00Z'),
  -- Rolex
  ('Rolex', 'visit', 'Jon visited. Will ask corporate about employee dry cleaning', '2026-04-01T18:00:00Z'),
  -- Peserico
  ('Peserico', 'call', 'Store manager passing message to Tish — follow-up from Jon''s visit', '2026-04-08T14:00:00Z'),
  ('Peserico', 'call', 'Paulina: would possibly start closer to summer', '2026-04-22T14:00:00Z'),
  -- Rag & Bone
  ('Rag & Bone', 'note', 'Alterations bid submitted via Worksmith — under review', '2026-05-15T15:00:00Z'),
  -- Huntting Inn
  ('Huntting Inn', 'call', 'Employee asked GM about us', '2025-06-06T14:00:00Z'),
  ('Huntting Inn', 'note', 'GM: contracted with Mattituck Laundry', '2025-06-06T14:05:00Z'),
  ('Huntting Inn', 'call', 'Will let us know if they end the Mattituck contract', '2025-12-02T14:00:00Z'),
  ('Huntting Inn', 'visit', 'Jon: if we match Mattituck prices we get sheets & duvets. Sheila to send their pricing', '2026-04-01T18:00:00Z'),
  ('Huntting Inn', 'email', 'Sent Sheila our pricing for the price match', '2026-04-08T14:00:00Z'),
  ('Huntting Inn', 'call', 'Hung up on during call — ask Nate to assist', '2026-05-06T17:59:00Z'),
  -- Wainscott Woods Retreat
  ('Wainscott Woods Retreat', 'call', 'Shared pricing with Charlene — going to investors/team for budget review', '2026-04-10T14:00:00Z'),
  ('Wainscott Woods Retreat', 'note', 'Awaiting budget decision', '2026-04-22T14:42:00Z'),
  -- Barons Cove
  ('Barons Cove', 'call', 'Maria (front desk): manager Ron Johnson will call back. Laundry on-site, no guest DC plan', '2025-06-17T14:00:00Z'),
  ('Barons Cove', 'call', 'Closed for the season (renovations) — call back in spring', '2026-03-05T18:58:00Z'),
  ('Barons Cove', 'note', 'No response — try again at end of spring', '2026-05-05T14:00:00Z'),
  -- Yacht Hampton
  ('Yacht Hampton', 'call', 'Joe (owner) interested in wash & fold for boat towels', '2026-03-11T14:33:00Z'),
  ('Yacht Hampton', 'call', 'Quoted $4.75/lb, 12 lb minimum. Delivery = 1 week turnaround; drop-off = 3 days', '2026-03-24T14:00:00Z'),
  -- Parrish Art Museum
  ('Parrish Art Museum', 'call', 'Front desk — get in touch with GM', '2025-06-09T14:00:00Z'),
  ('Parrish Art Museum', 'note', 'GM called back: interested in weekly pickup, 3–15 tablecloths/week. Currently with another company; ops team to follow up', '2025-06-09T16:58:00Z'),
  ('Parrish Art Museum', 'call', 'No answer — will stop by in person', '2025-07-22T14:00:00Z'),
  ('Parrish Art Museum', 'call', 'Left live message — being forwarded to management', '2026-03-05T18:55:00Z'),
  -- Yardley & Pino
  ('Yardley & Pino Funeral Home', 'call', 'A funeral director will be in contact', '2025-06-19T14:00:00Z'),
  ('Yardley & Pino Funeral Home', 'call', 'They''ve started dropping items off — leverage both funeral homes', '2025-10-15T17:13:00Z'),
  ('Yardley & Pino Funeral Home', 'note', 'Dropping off items, but small orders overall', '2025-11-06T14:00:00Z'),
  -- Maidstone
  ('Maidstone Club', 'call', 'Voicemail for GM — referenced similar businesses we serve', '2026-02-24T14:57:00Z'),
  -- Rosehip
  ('Rosehip Partners Real Estate', 'call', 'Left voicemail', '2026-03-06T15:10:00Z'),
  -- Devon YC
  ('Devon Yacht Club', 'call', 'Pat (GM): will bring table skirts in when needed; offered pickup & delivery', '2026-03-10T13:32:00Z'),
  -- South Fork CC
  ('South Fork Country Club', 'call', 'Voicemail for Chris Thomas (events) re dry cleaning + laundry', '2025-07-29T14:00:00Z'),
  ('South Fork Country Club', 'call', 'Left voicemail with our offering — will follow up', '2025-11-05T20:22:00Z'),
  -- Sag Harbor Inn
  ('Sag Harbor Inn', 'call', 'Kathleen: sending email she can forward to housekeeping manager', '2026-04-02T14:51:00Z'),
  -- Northampton Colony
  ('Northampton Colony Yacht Club', 'call', 'They don''t handle laundry in-house; no need', '2025-07-25T14:00:00Z'),
  ('Northampton Colony Yacht Club', 'call', 'Offered services, left voicemail', '2026-03-05T16:04:00Z'),
  ('Northampton Colony Yacht Club', 'call', 'Straight to voicemail — one more attempt planned', '2026-03-26T14:00:00Z'),
  -- BTSC
  ('Bridgehampton Tennis & Surf Club', 'call', 'Voicemail for on-site event planner re working together', '2025-06-13T14:00:00Z'),
  ('Bridgehampton Tennis & Surf Club', 'call', 'Jocelyn left message for manager; event planner has our voicemail', '2025-06-17T14:00:00Z'),
  ('Bridgehampton Tennis & Surf Club', 'call', 'Several attempts — goes straight to voicemail', '2026-03-17T19:29:00Z'),
  -- Southampton YC
  ('Southampton Yacht Club', 'call', 'Phone line down (off-season?)', '2026-02-24T14:00:00Z'),
  ('Southampton Yacht Club', 'call', 'Unreachable — no voicemail option, no email found', '2026-05-06T18:06:00Z'),
  -- Oceanside
  ('Oceanside Staffing', 'call', 'Left voicemail describing services', '2026-03-06T15:03:00Z'),
  -- East End Carpet
  ('East End Carpet & Upholstery', 'note', 'GM Karen seems interested — partnership: they quote at our rate, we get wholesale', '2025-06-02T14:00:00Z'),
  -- Canoe Place
  ('Canoe Place Inn', 'call', 'Voicemail for on-site event planner', '2025-06-16T14:00:00Z'),
  ('Canoe Place Inn', 'call', 'Voicemail for director of events re cleaning services', '2026-02-24T15:07:00Z'),
  -- HBYC
  ('Hampton Bays Yacht Club', 'call', 'No answer', '2025-06-11T14:00:00Z'),
  ('Hampton Bays Yacht Club', 'call', 'Line goes straight to dial tone', '2025-07-29T14:00:00Z'),
  ('Hampton Bays Yacht Club', 'call', 'Number out of order — no voicemail option', '2026-03-05T14:00:00Z'),
  ('Hampton Bays Yacht Club', 'call', 'Voicemail for Chris — no answer', '2026-05-06T18:33:00Z'),
  -- Shinnecock YC
  ('Shinnecock Yacht Club', 'call', 'Left voicemail — call back', '2025-08-01T14:00:00Z'),
  ('Shinnecock Yacht Club', 'call', 'Number no longer in service — call back before summer', '2026-03-04T15:31:00Z'),
  -- Stone Creek
  ('Stone Creek Inn', 'email', 'Left email', '2025-06-17T14:00:00Z'),
  ('Stone Creek Inn', 'call', 'Left voicemail offering services', '2026-03-11T14:18:00Z'),
  -- Southold YC
  ('Southold Yacht Club', 'call', 'Spoke with Sam', '2025-07-30T14:00:00Z'),
  ('Southold Yacht Club', 'call', 'Left voicemail', '2026-03-04T16:50:00Z'),
  ('Southold Yacht Club', 'call', 'Another voicemail — one more attempt planned', '2026-03-25T14:00:00Z'),
  -- Sound Aircraft
  ('Sound Aircraft Services', 'call', 'Phone number not in service', '2026-03-10T13:27:00Z'),
  -- DMD / VCU
  ('Village Custom Upholstery', 'call', 'Voicemail re partnering / referrals', '2025-06-17T14:00:00Z'),
  ('Village Custom Upholstery', 'call', 'They''ll send over things that need cleaning', '2025-09-13T13:17:00Z'),
  -- 1770 House
  ('The 1770 House', 'call', 'Caroline: they use Mattituck; offered a free test piece to compare quality', '2025-06-12T14:00:00Z'),
  ('The 1770 House', 'note', 'Hold — same owner as Baker House', '2026-01-30T14:00:00Z'),
  ('The 1770 House', 'call', 'No voicemail box to leave a message', '2026-02-24T14:00:00Z'),
  ('The 1770 House', 'visit', 'Jon: laundry mostly in-house, occasionally Suffolk Laundry. Will reach out if issues', '2026-04-01T18:00:00Z'),
  -- Baker House
  ('The Baker House 1650', 'call', 'Manager: will let us know if they need anything', '2026-02-26T17:21:00Z'),
  ('The Baker House 1650', 'visit', 'Jon: happy with Mattituck; left a price sheet', '2026-04-01T18:00:00Z'),
  -- Mill House
  ('Mill House Inn', 'call', 'Kelli: laundry on-site (canvas/cotton). She and her kids use us — will refer guests', '2025-06-12T14:00:00Z'),
  ('Mill House Inn', 'call', 'Taylor: boss will reach out if they decide to go with us', '2026-01-06T14:00:00Z'),
  ('Mill House Inn', 'call', 'Liz will have someone reach out', '2026-03-05T14:00:00Z'),
  ('Mill House Inn', 'visit', 'Jon visited — uninterested, left card', '2026-04-01T18:00:00Z'),
  -- Journey
  ('Journey East Hampton', 'call', 'Called + emailed via website portal', '2025-06-12T14:00:00Z'),
  ('Journey East Hampton', 'call', 'Erika: with Mattituck since opening 8 years ago — call back in winter', '2025-07-25T14:00:00Z'),
  ('Journey East Hampton', 'call', 'Erika: laundry on-site; will add us to guest amenities list (needs quick turnaround)', '2026-02-24T15:18:00Z'),
  ('Journey East Hampton', 'note', 'No current need but will share our info', '2026-05-27T14:00:00Z'),
  -- Art House
  ('Art House Bed & Breakfast', 'call', 'Michael: 16 years, never needed it — will keep us in mind', '2026-02-26T17:41:00Z'),
  -- Roundtree
  ('The Roundtree, Amagansett', 'call', 'Dewa (front desk): manager Bobby will call back', '2025-06-13T14:00:00Z'),
  ('The Roundtree, Amagansett', 'call', 'Schedules only when needed — busier in summer', '2026-02-26T17:23:00Z'),
  -- EH Golf Club
  ('East Hampton Golf Club', 'note', 'GM is Tony Seffa — use listed number', '2025-06-02T14:00:00Z'),
  ('East Hampton Golf Club', 'call', 'Voicemail for Tony (GM)', '2025-08-01T14:00:00Z'),
  ('East Hampton Golf Club', 'call', 'Joe (food manager) — voicemail re laundry service', '2025-08-06T14:00:00Z'),
  ('East Hampton Golf Club', 'call', 'Mostly on-site staff; forwarded to GM Tony', '2025-11-08T14:00:00Z'),
  ('East Hampton Golf Club', 'call', 'Staff does basics; they''ll reach out to us for dry cleaning', '2025-12-17T14:18:00Z'),
  -- Topping Rose
  ('Topping Rose House', 'call', 'Assistant forwarded the manager''s email — intro email sent', '2025-06-11T14:00:00Z'),
  ('Topping Rose House', 'call', 'Business line down (error ovl) — follow up May 2026', '2026-02-24T14:00:00Z'),
  ('Topping Rose House', 'note', 'Phone line still dead', '2026-04-28T14:00:00Z'),
  ('Topping Rose House', 'note', 'Their current pricing is significantly below ours — no strategy to compete yet', '2026-06-03T14:00:00Z'),
  -- Star Island
  ('Star Island Yacht Club', 'call', 'Spoke with Ryan', '2025-06-12T14:00:00Z'),
  ('Star Island Yacht Club', 'call', 'No need for our services', '2026-03-04T17:03:00Z'),
  -- Montauk Airport
  ('Montauk Airport', 'call', 'Hung up immediately; tried calling back, no answer', '2026-03-06T15:33:00Z'),
  -- Sag Harbor YC
  ('Sag Harbor Yacht Club', 'call', 'Did not answer', '2026-03-10T14:00:00Z'),
  ('Sag Harbor Yacht Club', 'call', 'Kristen: no requirements; will keep us in mind (unlikely)', '2026-04-28T13:43:00Z'),
  -- Noyac
  ('Noyac Golf Club', 'call', 'Aden (bartender) — call back', '2025-08-01T14:00:00Z'),
  ('Noyac Golf Club', 'call', 'Jesse: all laundry in-house, not interested', '2025-08-19T14:00:00Z'),
  ('Noyac Golf Club', 'note', 'Not interested at this time', '2025-11-06T14:00:00Z'),
  -- Shinnecock Hills
  ('Shinnecock Hills Golf Club', 'note', 'frontdesk@shinnecockhills.us — they asked us to reach out there', '2025-06-02T14:00:00Z'),
  ('Shinnecock Hills Golf Club', 'call', 'Message left — Nick (GM) back next week', '2025-08-01T14:00:00Z'),
  ('Shinnecock Hills Golf Club', 'call', 'Bethany: all cleaning done in-house', '2025-08-05T14:00:00Z'),
  ('Shinnecock Hills Golf Club', 'note', 'On-site team; no need. Will keep us in mind', '2026-03-17T14:00:00Z'),
  -- Sebonack
  ('Sebonack Golf Club', 'note', 'GM email: chris.hove@sebonack.com', '2025-06-02T14:00:00Z'),
  ('Sebonack Golf Club', 'call', 'Nikita: laundry on-site. Left message for Kate (mgr) + Rosie (housekeeping)', '2025-06-11T14:00:00Z'),
  -- Bullhead
  ('Bullhead Yacht Club', 'call', 'No need for our services', '2025-11-13T14:00:00Z'),
  ('Bullhead Yacht Club', 'call', 'Kept ringing — no voicemail option', '2026-03-04T14:17:00Z'),
  -- Gabreski
  ('Suffolk County (Gabreski Airport)', 'call', 'County-owned; own regulated cleaning facilities', '2026-03-06T15:26:00Z'),
  -- North Fork CC
  ('North Fork Country Club', 'call', 'GM: contracted with Mattituck Laundry', '2025-06-06T14:00:00Z'),
  -- Baiting Hollow
  ('Baiting Hollow Club', 'call', 'Not available — used website portal email', '2025-06-12T14:00:00Z'),
  ('Baiting Hollow Club', 'call', 'Voicemail for events department re garments + households', '2025-07-25T14:00:00Z'),
  -- Atlantic
  ('Atlantic Golf Club', 'call', 'Manager: they have on-site cleaning', '2025-06-04T13:50:00Z'),
  ('Atlantic Golf Club', 'note', 'STOP calling — she is not interested', '2025-06-11T14:00:00Z'),
  -- Loro Piana
  ('Loro Piana', 'note', 'Pricing approved — follow up on readiness', '2025-08-20T14:00:00Z'),
  ('Loro Piana', 'call', 'Manager: 5 years with current cleaner, won''t switch; will keep us in mind', '2025-10-16T14:00:00Z'),
  ('Loro Piana', 'call', 'Katherine: call when Allen is around next week', '2025-11-25T14:00:00Z'),
  ('Loro Piana', 'note', 'Denied our Worksmith bid pricing — plan in-person meeting', '2025-12-23T14:00:00Z'),
  -- London Jewelers
  ('London Jewelers', 'visit', 'New-ownership intro; employee now brings dry cleaning. Pitch 20% employee uniform discount to owner', '2025-08-20T14:00:00Z'),
  ('London Jewelers', 'visit', 'In-person follow-up — employee discount offer, they''ll pass it along', '2025-10-23T14:00:00Z'),
  ('London Jewelers', 'visit', 'Dropped off promos to stay top of mind', '2025-10-30T14:00:00Z'),
  ('London Jewelers', 'call', 'Sonya sent email; try to meet store manager directly', '2025-12-17T14:16:00Z'),
  -- Goop
  ('Goop', 'note', 'Account setup via Worksmith in progress', '2025-08-02T14:00:00Z'),
  ('Goop', 'note', 'Anna excited to use our services once set up', '2025-08-06T14:00:00Z'),
  ('Goop', 'call', 'First pickup this week; meetings with asst. manager then GM', '2025-10-15T14:00:00Z'),
  ('Goop', 'note', 'Picked up first order; pitch regular employee clothing cleaning', '2025-10-22T14:00:00Z'),
  ('Goop', 'call', 'Work is rare; they''ll message us directly when needed', '2026-01-06T16:49:00Z'),
  -- Bonne Nuit
  ('Bonne Nuit', 'call', 'Price list sent. They use the cleaner across the street; we''re the backup', '2025-08-13T14:00:00Z'),
  ('Bonne Nuit', 'call', 'Jennifer: rarely need cleaning; might use our tailor', '2025-10-15T14:00:00Z'),
  -- Prada / Zadig / J Crew
  ('Prada', 'visit', 'Jon visited — no dry cleaning or alterations need', '2026-04-01T18:00:00Z'),
  ('Zadig & Voltaire', 'visit', 'Jon visited — good conversation; alterations when needed', '2026-04-01T18:00:00Z'),
  ('J Crew', 'note', 'Added as opportunity', '2026-05-05T15:00:00Z'),
  -- EH House / Colonial / Guild Hall / Nick & Toni's / Village Bistro / Clubhouse
  ('East Hampton House', 'visit', 'Staff cleans hotel items in-house; OK to leave cards at their local-business table', '2025-07-25T14:00:00Z'),
  ('East Hampton Colonial Inn', 'note', 'No direct phone number', '2026-04-01T18:00:00Z'),
  ('Guild Hall', 'call', 'Eliza Rand (events) — voicemail re our services', '2025-08-20T14:00:00Z'),
  ('Guild Hall', 'call', 'Staff presses on-site; will use us for emergencies / event overflow', '2025-12-17T14:17:00Z'),
  ('Nick & Toni''s', 'call', 'Myka: existing service, no plans to change; wouldn''t share who', '2025-08-05T14:00:00Z'),
  ('Village Bistro', 'call', 'Voicemail re linen services', '2025-07-25T14:00:00Z'),
  ('Village Bistro', 'note', 'Website broken, no email found; opens 5pm — keep trying', '2025-11-06T14:00:00Z'),
  ('The Clubhouse', 'call', 'Nick: manager Greg is in at 4 — call back', '2025-08-13T14:00:00Z'),
  ('The Clubhouse', 'note', 'Greg: writing up our offer for their team meeting; likely no need', '2025-11-11T14:00:00Z'),
  ('The Clubhouse', 'call', 'Not interested in our services', '2026-03-06T14:00:00Z'),
  -- Allstate
  ('Allstate — Joseph Haines Agency', 'call', 'Interested in B2B work (insurance claims: smoke, mold, water damage)', '2025-05-07T13:57:00Z'),
  ('Allstate — Joseph Haines Agency', 'note', 'Wants a price sheet to use us for insurance claims', '2025-06-09T14:00:00Z'),
  ('Allstate — Joseph Haines Agency', 'visit', 'Left our information + price list at the door', '2025-10-09T14:00:00Z'),
  -- Montauk group
  ('Montauk Lake Club', 'call', 'Barbra: left detailed message for manager Jackie', '2025-06-16T14:00:00Z'),
  ('Montauk Lake Club', 'call', 'Tina x4402 — follow up to see if they need our services', '2025-12-17T14:00:00Z'),
  ('Montauk Lake Club', 'note', 'Too far away', '2026-03-05T14:00:00Z'),
  ('Bagatelle at Gosman''s', 'note', 'Needs weekly pickup/drop-off — linens + employee gear. Awaiting call back', '2025-06-20T14:00:00Z'),
  ('Bagatelle at Gosman''s', 'note', 'Did one load, they were happy — need $1k/weekly to resume (told GM). Follow up next season', '2025-07-24T14:00:00Z'),
  ('Bagatelle at Gosman''s', 'note', 'Too far with not enough volume', '2026-03-06T14:00:00Z'),
  ('Sole East Resort', 'call', 'Gina: owner bought a laundry facility — all in-house', '2025-06-13T14:00:00Z'),
  ('360 East at Montauk Downs', 'call', 'Voicemail re services — follow up', '2025-12-02T14:00:00Z'),
  ('360 East at Montauk Downs', 'call', 'They do not utilize our services', '2026-01-14T17:57:00Z'),
  ('A+ Towels & Linen', 'call', 'Mike: linen rental only; happy to hand off unwanted dry-cleaning accounts (e.g. Bagatelle)', '2025-06-20T14:00:00Z'),
  ('A+ Towels & Linen', 'call', 'Won''t handle dry cleaning out east; Montauk too far for us anyway', '2025-07-22T14:00:00Z'),
  -- Bridgehampton group
  ('Poxabogue Golf Center', 'call', 'Golf center — no need for our services', '2025-08-01T14:00:00Z'),
  ('The Bridge Golf Club', 'call', 'Voicemail for events manager', '2025-08-01T14:00:00Z'),
  ('The Bridge Golf Club', 'call', 'Natalia: contracted with Mattituck', '2025-08-05T14:00:00Z'),
  ('Wolffer Estate Vineyard', 'call', 'Forwarded to general info email', '2025-06-17T14:00:00Z'),
  ('Wolffer Estate Vineyard', 'call', 'Voicemail for Shana (club house manager)', '2025-08-04T14:00:00Z'),
  ('The Sagaponack', 'call', 'Detailed voicemail re laundry + dry cleaning collaboration', '2025-06-17T14:00:00Z'),
  ('The Water Mill', 'call', 'Voicemail — art supplies, aprons, event linens. Might be a dead end', '2025-06-16T14:00:00Z'),
  -- Hampton Bays group
  ('Hampton Maid', 'call', 'Left voicemail', '2025-06-16T14:00:00Z'),
  ('Hampton Maid', 'call', 'Line not connected (off-season)', '2026-02-26T14:00:00Z'),
  ('Hampton Maid', 'call', 'Sarah: on-site laundry — will not need dry cleaning', '2026-06-02T16:33:00Z'),
  -- North Fork / SI group
  ('Peconic Bay Yacht Club', 'call', 'Voicemail (North Fork logistics tough)', '2025-08-04T14:00:00Z'),
  ('Peconic Bay Yacht Club', 'call', 'John: contracted, undisclosed company — not interested at all', '2026-03-04T14:00:00Z'),
  ('Shelter Island Yacht Club', 'note', 'Left message for GM', '2025-06-02T14:00:00Z'),
  ('Shelter Island Yacht Club', 'call', 'Logistically hard — needs ferry', '2026-03-05T16:08:00Z'),
  ('Meadowlark North Fork', 'call', 'Voicemail: offer one free clean to compete with Mattituck', '2025-06-16T14:00:00Z'),
  ('Meadowlark North Fork', 'call', 'With Mattituck; weren''t interested last time. Reminder set for future', '2025-09-10T14:00:00Z'),
  ('Casa 44', 'note', 'Came in with an account asking about delivery', '2025-06-16T14:00:00Z'),
  ('Casa 44', 'call', 'Will do their own pickup/drop-off to track their work', '2025-09-03T14:20:00Z'),
  ('Hamptons Chutney Co.', 'call', 'Linen service contract in place for households', '2025-06-06T14:00:00Z'),
  ('Loaves & Fishes', 'call', 'Line continuously busy', '2025-06-12T14:00:00Z'),
  ('Loaves & Fishes', 'call', 'Voicemail re linen / dry cleaning services', '2025-07-25T14:00:00Z'),
  ('RG NY', 'call', 'John: equipment rented out, laundry facility on-site — not interested', '2025-06-16T14:00:00Z'),
  -- Misc services
  ('Meridith Baer (Home Staging)', 'call', 'Left voicemail; central hub not local', '2026-03-06T15:06:00Z'),
  ('Hampton Home Services', 'call', 'Own facilities for their work — not interested', '2026-03-06T15:13:00Z'),
  ('Village Bistro', 'call', 'Can''t reach when open; no messaging option', '2025-08-05T14:00:00Z')
) as v(name, kind, body, ts)
join prospects p on p.name = v.name;

-- ============================================================
-- SEED — services each active account buys
-- ============================================================
update prospects set services = '{employees}'
  where name in ('Brunello Cucinelli', 'Loewe', 'Zimmermann', 'Ralph Lauren');
update prospects set services = '{linen}'
  where name in ('Hedges Inn', 'Charles Gallanti Inc.');
update prospects set services = '{referral}'
  where name in ('Hamptons Exclusive Property Mgmt', 'Mill House Inn', 'Journey East Hampton');

-- ============================================================
-- LINK — prospects that are already delivery customers
-- (never double-add: match by normalized name)
-- ============================================================
update prospects p set customer_id = c.id
from customers c
where p.customer_id is null
  and p.deleted_at is null
  and c.deleted_at is null and c.active
  and lower(regexp_replace(c.name, '[^a-zA-Z0-9]', '', 'g'))
    = lower(regexp_replace(p.name, '[^a-zA-Z0-9]', '', 'g'));

-- ============================================================
-- TOWN — tag each prospect with its hamlet/village (from the address)
-- ============================================================
update prospects
  set town = trim(substring(address from '([^,]+),\s*NY'))
  where town is null and address ~* ',\s*NY';
