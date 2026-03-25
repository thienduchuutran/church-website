-- Allow signed-in users to read only their own admins row (frontend whitelist check in lib/auth.tsx).
-- With RLS enabled and zero policies, the Data API returns no rows for anon/authenticated.

alter table public.admins enable row level security;

create policy admins_select_own_email
  on public.admins
  for select
  to authenticated
  using (email = (auth.jwt() ->> 'email'));
