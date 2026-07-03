-- Mebelchi — Supabase schema. Run this once in the SQL Editor (Supabase dashboard →
-- SQL Editor → New query → paste → Run). Safe to re-run (idempotent-ish: guards + drops).
--
-- Two tables that mirror the app's local model:
--   profiles  ← model/settings.ts  Settings   (one row per auth user)
--   projects  ← model/projects.ts  SavedProject (many per user)
-- Row-Level Security ensures a user can only ever see/edit their OWN rows — this is
-- what makes it safe to ship the public anon key in the client bundle.

-- =====================================================================
-- profiles: the B2B designer's profile + company + preferences
-- =====================================================================
create table if not exists public.profiles (
  id              uuid primary key references auth.users (id) on delete cascade,
  name            text        not null default '',
  phone           text        not null default '',
  email           text        not null default '',
  company         text        not null default '',
  company_phone   text        not null default '',
  company_address text        not null default '',
  currency        text        not null default 'UZS',
  language        text        not null default 'ru',
  updated_at      timestamptz not null default now()
);

-- =====================================================================
-- projects: saved kitchen designs (the whole design slice as JSON)
-- id is the client-generated UUID so local and cloud share the same key
-- =====================================================================
create table if not exists public.projects (
  id          uuid primary key,
  owner       uuid        not null references auth.users (id) on delete cascade,
  name        text        not null default 'Проект',
  client      text        not null default '',
  state       jsonb       not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists projects_owner_updated_idx
  on public.projects (owner, updated_at desc);

-- =====================================================================
-- Row-Level Security — every user sees only their own data
-- =====================================================================
alter table public.profiles enable row level security;
alter table public.projects enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
drop policy if exists "profiles_insert_own" on public.profiles;
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_select_own" on public.profiles for select using  (auth.uid() = id);
create policy "profiles_insert_own" on public.profiles for insert with check (auth.uid() = id);
create policy "profiles_update_own" on public.profiles for update using  (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "projects_all_own" on public.projects;
create policy "projects_all_own" on public.projects
  for all using (auth.uid() = owner) with check (auth.uid() = owner);

-- =====================================================================
-- Auto-create a profile row when a user signs up
-- =====================================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, coalesce(new.email, ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =====================================================================
-- Account deletion (App Store / Play require an in-app delete). A user can
-- delete ONLY themselves (auth.uid()); the ON DELETE CASCADE on profiles/projects
-- removes all their data automatically. SECURITY DEFINER runs as the function owner
-- (postgres), which may remove the auth.users row.
-- =====================================================================
create or replace function public.delete_own_account()
returns void
language sql
security definer
set search_path = public, auth
as $$
  delete from auth.users where id = auth.uid();
$$;

revoke all on function public.delete_own_account() from public, anon;
grant execute on function public.delete_own_account() to authenticated;
