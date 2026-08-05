-- Split the retention list into the two things it actually contains.
--
-- "Lapsed" was one bucket holding two different problems: customers who
-- stopped entirely and customers still coming but spending far less. They need
-- different calls — one is "we haven't seen you", the other is "we're only
-- getting part of your business" — so the list has to say which.
--
--   lost    — nothing at all this year
--   reduced — still ordering, well below last year
alter table customer_retention
  add column if not exists category text not null default 'lost'
    check (category in ('lost', 'reduced'));

-- The analysis behind the number: which service collapsed, how visits moved,
-- whether baskets got smaller. Without it the list is just names and a figure,
-- and whoever makes the call has to re-derive the story every time.
alter table customer_retention add column if not exists reason text;
