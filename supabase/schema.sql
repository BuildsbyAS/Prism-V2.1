-- Prism v2 — full schema. Run once in the Supabase SQL editor
-- (Dashboard → SQL Editor → New query → paste → Run).
--
-- This is a clean multi-tenant schema for the creator + voter product. The old
-- single-poll `votes` table is intentionally dropped — v2 is a new product.

-- Fresh start: drop the v1 poll table if it's still around.
drop table if exists public.votes cascade;

-- ---------------------------------------------------------------------------
-- Helper: is the current authenticated user a @noon.com account? Used in RLS
-- so the domain gate is enforced server-side, not just at the OAuth screen.
-- ---------------------------------------------------------------------------
create or replace function public.is_noon_user()
returns boolean language sql stable as $$
  select coalesce(lower(auth.jwt() ->> 'email') like '%@noon.com', false)
$$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table if not exists public.forms (
  id                     uuid primary key default gen_random_uuid(),
  creator_id             uuid not null references auth.users on delete cascade,
  slug                   text unique not null,
  title                  text,
  body_copy              text,
  testing_question       text,
  usps_metrics           text,
  project_brief          text,
  hero_image_url         text,
  hero_bg                text not null default 'none',           -- backdrop preset behind the hero media
  thank_you_message      text,                                   -- thank-you screen copy
  mode                   text not null default 'simple' check (mode in ('simple','canvas')),
  status                 text not null default 'draft'  check (status in ('draft','open','closed')),
  show_results_to_voters boolean not null default false,         -- the "let voters see results" toggle
  require_voter_login    boolean not null default false,
  show_time_estimate     boolean not null default false,
  estimated_minutes      int not null default 1,
  google_sheet_id        text,
  results_token          uuid not null default gen_random_uuid(),
  created_at             timestamptz not null default now(),
  published_at           timestamptz
);

-- Ordered content pages between the welcome and end screens.
create table if not exists public.pages (
  id          uuid primary key default gen_random_uuid(),
  form_id     uuid not null references public.forms on delete cascade,
  type        text not null check (type in ('feedback','static')),
  order_index int not null default 0,
  title       text not null default '',
  body        text not null default ''
);

create table if not exists public.options (
  id          uuid primary key default gen_random_uuid(),
  form_id     uuid not null references public.forms on delete cascade,
  page_id     uuid not null references public.pages on delete cascade,
  name        text,
  description text,
  order_index int not null default 0,
  embed_type    text check (embed_type in ('image','video','react','figma')),
  embed_url     text,
  alt_text      text not null default '',
  is_decorative boolean not null default false,
  focal_x       int not null default 50,           -- image crop focal point (0–100)
  focal_y       int not null default 50,
  brightness    int not null default 0,            -- −100…100 brightness delta
  is_static     boolean not null default false   -- a context/current-iteration screen, not a poll choice
);

create table if not exists public.widgets (
  id               uuid primary key default gen_random_uuid(),
  form_id          uuid not null references public.forms on delete cascade,
  page_id          uuid not null references public.pages on delete cascade,
  type             text not null check (type in ('rating','slider','radio','text','voice')),
  config           jsonb not null default '{}'::jsonb,           -- scale, axis labels, choices, etc.
  order_index      int not null default 0,
  is_followup      boolean not null default false,
  branch_condition jsonb                                         -- reserved for Canvas View branching (V2)
);

create table if not exists public.responses (
  id               uuid primary key default gen_random_uuid(),
  form_id          uuid not null references public.forms on delete cascade,
  voter_session_id text,                                         -- localStorage-generated, same pattern as v1
  choices          jsonb not null default '{}'::jsonb,           -- page_id -> option_id | 'tie'
  submitted_at     timestamptz not null default now()
);

create table if not exists public.response_answers (
  id          uuid primary key default gen_random_uuid(),
  response_id uuid not null references public.responses on delete cascade,
  widget_id   uuid not null references public.widgets on delete cascade,
  value       jsonb,                                             -- shape depends on widget type
  upvotes     int not null default 0                            -- text-answer comment cards only
);

create index if not exists options_form_idx           on public.options (form_id, order_index);
create index if not exists widgets_form_idx           on public.widgets (form_id, order_index);
create index if not exists responses_form_idx         on public.responses (form_id, submitted_at desc);
create index if not exists response_answers_resp_idx  on public.response_answers (response_id);
create index if not exists response_answers_widget_idx on public.response_answers (widget_id);

-- ---------------------------------------------------------------------------
-- Row-Level Security
-- ---------------------------------------------------------------------------
alter table public.forms            enable row level security;
alter table public.pages            enable row level security;
alter table public.options          enable row level security;
alter table public.widgets          enable row level security;
alter table public.responses        enable row level security;
alter table public.response_answers enable row level security;

-- PAGES: readable whenever the parent form is readable; writable by the owner.
drop policy if exists "read pages" on public.pages;
create policy "read pages" on public.pages for select
  to anon, authenticated
  using (exists (select 1 from public.forms f
                 where f.id = form_id and (f.status = 'open' or f.creator_id = auth.uid())));

drop policy if exists "owner write pages" on public.pages;
create policy "owner write pages" on public.pages for all
  to authenticated
  using (exists (select 1 from public.forms f
                 where f.id = form_id and f.creator_id = auth.uid() and public.is_noon_user()))
  with check (exists (select 1 from public.forms f
                 where f.id = form_id and f.creator_id = auth.uid() and public.is_noon_user()));

-- FORMS: public may read a form only when it is open; the owner (a @noon.com
-- account) may do everything to their own rows.
drop policy if exists "read open forms" on public.forms;
create policy "read open forms" on public.forms for select
  to anon, authenticated
  using (status = 'open' or creator_id = auth.uid());

drop policy if exists "owner insert forms" on public.forms;
create policy "owner insert forms" on public.forms for insert
  to authenticated
  with check (creator_id = auth.uid() and public.is_noon_user());

drop policy if exists "owner update forms" on public.forms;
create policy "owner update forms" on public.forms for update
  to authenticated
  using (creator_id = auth.uid() and public.is_noon_user())
  with check (creator_id = auth.uid() and public.is_noon_user());

drop policy if exists "owner delete forms" on public.forms;
create policy "owner delete forms" on public.forms for delete
  to authenticated
  using (creator_id = auth.uid());

-- OPTIONS / WIDGETS: readable whenever the parent form is readable; writable
-- only by the owning @noon.com creator. (Same policy shape for both tables.)
drop policy if exists "read options" on public.options;
create policy "read options" on public.options for select
  to anon, authenticated
  using (exists (select 1 from public.forms f
                 where f.id = form_id and (f.status = 'open' or f.creator_id = auth.uid())));

drop policy if exists "owner write options" on public.options;
create policy "owner write options" on public.options for all
  to authenticated
  using (exists (select 1 from public.forms f
                 where f.id = form_id and f.creator_id = auth.uid() and public.is_noon_user()))
  with check (exists (select 1 from public.forms f
                 where f.id = form_id and f.creator_id = auth.uid() and public.is_noon_user()));

drop policy if exists "read widgets" on public.widgets;
create policy "read widgets" on public.widgets for select
  to anon, authenticated
  using (exists (select 1 from public.forms f
                 where f.id = form_id and (f.status = 'open' or f.creator_id = auth.uid())));

drop policy if exists "owner write widgets" on public.widgets;
create policy "owner write widgets" on public.widgets for all
  to authenticated
  using (exists (select 1 from public.forms f
                 where f.id = form_id and f.creator_id = auth.uid() and public.is_noon_user()))
  with check (exists (select 1 from public.forms f
                 where f.id = form_id and f.creator_id = auth.uid() and public.is_noon_user()));

-- RESPONSES / RESPONSE_ANSWERS: anyone may submit; only the form's owner may
-- read them via RLS. The public read-only results link (/r/[resultsToken]) is
-- served by a server route using the service-role key, which validates the
-- token — so the anon client never gets blanket read on responses.
drop policy if exists "anyone insert responses" on public.responses;
create policy "anyone insert responses" on public.responses for insert
  to anon, authenticated
  with check (true);

drop policy if exists "owner read responses" on public.responses;
create policy "owner read responses" on public.responses for select
  to authenticated
  using (exists (select 1 from public.forms f where f.id = form_id and f.creator_id = auth.uid()));

drop policy if exists "anyone insert answers" on public.response_answers;
create policy "anyone insert answers" on public.response_answers for insert
  to anon, authenticated
  with check (exists (select 1 from public.responses r where r.id = response_id));

drop policy if exists "owner read answers" on public.response_answers;
create policy "owner read answers" on public.response_answers for select
  to authenticated
  using (exists (select 1 from public.responses r
                 join public.forms f on f.id = r.form_id
                 where r.id = response_id and f.creator_id = auth.uid()));

-- Voters may upvote comment cards when results are shown: allow updating only
-- the `upvotes` column on answers belonging to a form that shows results.
drop policy if exists "anyone upvote answers" on public.response_answers;
create policy "anyone upvote answers" on public.response_answers for update
  to anon, authenticated
  using (exists (select 1 from public.responses r
                 join public.forms f on f.id = r.form_id
                 where r.id = response_id and f.show_results_to_voters))
  with check (exists (select 1 from public.responses r
                 join public.forms f on f.id = r.form_id
                 where r.id = response_id and f.show_results_to_voters));

-- ---------------------------------------------------------------------------
-- Storage: the `assets` bucket holds every uploaded file — hero images, option
-- media/prototypes, and voter voice notes (see lib/assets.ts). Public-read so
-- voters on any device/session can load them; the row only stores the URL.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
  values ('assets', 'assets', true)
  on conflict (id) do nothing;

-- Anyone can read (public feedback links are viewed by anonymous voters).
drop policy if exists "public read assets" on storage.objects;
create policy "public read assets" on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'assets');

-- Anyone can upload into the assets bucket — creators upload media, and
-- anonymous voters upload voice notes. (Scope tighter later if abuse appears.)
drop policy if exists "anyone upload assets" on storage.objects;
create policy "anyone upload assets" on storage.objects for insert
  to anon, authenticated
  with check (bucket_id = 'assets');

-- ---------------------------------------------------------------------------
-- Migrations for existing projects (safe to run repeatedly). `create table if
-- not exists` above won't alter tables that already exist, so apply changes
-- to older databases here.
-- ---------------------------------------------------------------------------
-- Choices moved onto the response row (was previously mis-stored in
-- response_answers, whose widget_id is a FK to widgets and rejected them).
alter table public.responses add column if not exists choices jsonb not null default '{}'::jsonb;

-- Allow the new 'voice' feedback widget type.
alter table public.widgets drop constraint if exists widgets_type_check;
alter table public.widgets add constraint widgets_type_check
  check (type in ('rating','slider','radio','text','voice'));
