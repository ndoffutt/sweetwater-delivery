-- Client-side crash/error log. Populated by logClientError() from the app's
-- error boundaries and the global window error/unhandledrejection catcher.
-- Gives us visibility into what actually breaks in the field (previously the
-- app had no boundaries and no logging, so a driver crash left no trace).
create table if not exists client_errors (
  id         uuid primary key default gen_random_uuid(),
  message    text,
  stack      text,
  source     text,          -- boundary:driver | boundary:app | boundary:root | window.onerror | unhandledrejection
  url        text,
  digest     text,          -- Next.js error digest, when present
  user_agent text,
  user_name  text,          -- session name at time of crash, if signed in
  created_at timestamptz not null default now()
);

create index if not exists client_errors_created_at_idx on client_errors (created_at desc);
