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
-- Helper: may the current user edit this form? The creator, or anyone they
-- listed as a collaborator. Email-matched (case-insensitively) because that is
-- what the creator types into the publish dialog — they have no way to know
-- another person's auth.users id.
-- ---------------------------------------------------------------------------
create or replace function public.is_editor(creator uuid, collaborators text[])
returns boolean language sql stable as $$
  select public.is_noon_user()
     and (creator = auth.uid()
          or lower(auth.jwt() ->> 'email') = any (array(select lower(c) from unnest(collaborators) c)))
$$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table if not exists public.forms (
  id                     uuid primary key default gen_random_uuid(),
  creator_id             uuid not null references auth.users on delete cascade,
  slug                   text unique not null,
  name                   text,                                   -- creator-facing form name; falls back to title until renamed
  title                  text,                                   -- welcome screen headline (voter-facing)
  body_copy              text,
  testing_question       text,
  usps_metrics           text,
  project_brief          text,
  hero_image_url         text,
  hero_bg                text not null default 'none',           -- backdrop preset behind the hero media
  hero_dither            boolean not null default true,          -- pixel/character texture over a gradient backdrop
  thank_you_message      text,                                   -- thank-you screen copy
  mode                   text not null default 'simple' check (mode in ('simple','canvas')),
  status                 text not null default 'draft'  check (status in ('draft','open','closed')),
  pod                    text not null default '',               -- owning pod, chosen at publish
  collaborators          text[] not null default '{}',            -- @noon.com emails who can edit alongside the creator
  expires_at             timestamptz,                            -- stops taking responses after this
  show_results_to_voters boolean not null default false,         -- the "let voters see results" toggle
  require_voter_login    boolean not null default false,
  show_time_estimate     boolean not null default false,
  estimated_minutes      int not null default 1,
  google_sheet_id        text,
  -- When the creator last opened this form's results. Responses newer than this
  -- are the "new responses" the header's Updates menu counts; null = never opened.
  responses_seen_at      timestamptz,
  results_token          uuid not null default gen_random_uuid(),
  created_at             timestamptz not null default now(),
  published_at           timestamptz
);

-- A published form has to be attributable and time-boxed. The builder blocks
-- this in two places already; the constraint is what makes it true of the data
-- rather than of one client. `name` falls back to the welcome headline, the same
-- way formName() does, so a form the creator never explicitly renamed still
-- counts as named.
alter table public.forms drop constraint if exists forms_publish_details;
alter table public.forms add constraint forms_publish_details check (
  status <> 'open'
  or (coalesce(nullif(btrim(name), ''), nullif(btrim(title), '')) is not null
      and btrim(pod) <> ''
      and expires_at is not null)
);

-- Ordered content pages between the welcome and end screens.
create table if not exists public.pages (
  id          uuid primary key default gen_random_uuid(),
  form_id     uuid not null references public.forms on delete cascade,
  type        text not null check (type in ('feedback','static')),
  order_index int not null default 0,
  title       text not null default '',
  body        text not null default '',
  show_neutral_option boolean not null default true
);

create table if not exists public.options (
  id          uuid primary key default gen_random_uuid(),
  form_id     uuid not null references public.forms on delete cascade,
  page_id     uuid not null references public.pages on delete cascade,
  name        text,
  description text,
  order_index int not null default 0,
  embed_type    text check (embed_type in ('image','video','react','figma','protopie')),
  embed_url     text,
  alt_text      text not null default '',
  is_decorative boolean not null default false,
  focal_x       int not null default 50,           -- unused: steered a crop the app no longer does
  focal_y       int not null default 50,           --   kept (with defaults) so existing rows still write
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
                 where f.id = form_id
                   and (f.status = 'open' or f.creator_id = auth.uid()
                        or public.is_editor(f.creator_id, f.collaborators)
                        or (f.status = 'closed' and auth.uid() is not null
                            and public.is_noon_user()))));

drop policy if exists "owner write pages" on public.pages;
create policy "owner write pages" on public.pages for all
  to authenticated
  using (exists (select 1 from public.forms f
                 where f.id = form_id and public.is_editor(f.creator_id, f.collaborators)))
  with check (exists (select 1 from public.forms f
                 where f.id = form_id and public.is_editor(f.creator_id, f.collaborators)));

-- FORMS: public may read a form only when it is open; the owner (a @noon.com
-- account) may do everything to their own rows.
drop policy if exists "read open forms" on public.forms;
create policy "read open forms" on public.forms for select
  to anon, authenticated
  using (status = 'open' or creator_id = auth.uid()
         or public.is_editor(creator_id, collaborators)
         or (status = 'closed' and auth.uid() is not null
             and public.is_noon_user()));

drop policy if exists "owner insert forms" on public.forms;
create policy "owner insert forms" on public.forms for insert
  to authenticated
  with check (creator_id = auth.uid() and public.is_noon_user());

drop policy if exists "owner update forms" on public.forms;
create policy "owner update forms" on public.forms for update
  to authenticated
  using (public.is_editor(creator_id, collaborators))
  with check (public.is_editor(creator_id, collaborators));

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
                 where f.id = form_id
                   and (f.status = 'open' or f.creator_id = auth.uid()
                        or public.is_editor(f.creator_id, f.collaborators)
                        or (f.status = 'closed' and auth.uid() is not null
                            and public.is_noon_user()))));

drop policy if exists "owner write options" on public.options;
create policy "owner write options" on public.options for all
  to authenticated
  using (exists (select 1 from public.forms f
                 where f.id = form_id and public.is_editor(f.creator_id, f.collaborators)))
  with check (exists (select 1 from public.forms f
                 where f.id = form_id and public.is_editor(f.creator_id, f.collaborators)));

drop policy if exists "read widgets" on public.widgets;
create policy "read widgets" on public.widgets for select
  to anon, authenticated
  using (exists (select 1 from public.forms f
                 where f.id = form_id
                   and (f.status = 'open' or f.creator_id = auth.uid()
                        or public.is_editor(f.creator_id, f.collaborators)
                        or (f.status = 'closed' and auth.uid() is not null
                            and public.is_noon_user()))));

drop policy if exists "owner write widgets" on public.widgets;
create policy "owner write widgets" on public.widgets for all
  to authenticated
  using (exists (select 1 from public.forms f
                 where f.id = form_id and public.is_editor(f.creator_id, f.collaborators)))
  with check (exists (select 1 from public.forms f
                 where f.id = form_id and public.is_editor(f.creator_id, f.collaborators)));

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

-- The form's name split away from the welcome headline it used to double as.
-- Deliberately left null on existing rows: null means "never renamed", and the
-- app falls back to title, which is exactly what those forms are called today.
alter table public.forms add column if not exists name text;

-- Generated neutral choices are visible by default for historical forms, but
-- creators can now hide them per feedback page.
alter table public.pages
  add column if not exists show_neutral_option boolean not null default true;

-- ---------------------------------------------------------------------------
-- One response per browser
-- ---------------------------------------------------------------------------
-- One response per account
-- ---------------------------------------------------------------------------
-- Voting requires a signed-in @noon.com account, and each account gets one
-- response per form. `voter_id` is the account; `voter_session_id` stays as a
-- record of which browser it came from, but no longer constrains anything.
alter table public.responses add column if not exists voter_id uuid references auth.users on delete set null;

-- The per-browser rule this replaces. Two colleagues sharing a machine are two
-- accounts and must both be able to respond, so the old index has to go.
drop index if exists public.responses_one_per_browser;

-- The real enforcement. The client checks first so the voter finds out before
-- filling the form in, but two tabs racing — or a hand-made request — still hit
-- this. Partial, so pre-login rows (voter_id null) don't collide with each other.
--
-- Creating this over existing duplicates will fail; de-duplicate first, keeping
-- each account's earliest response:
--   delete from public.responses r using public.responses keep
--    where r.form_id = keep.form_id
--      and r.voter_id = keep.voter_id
--      and r.voter_id is not null
--      and (keep.submitted_at, keep.id) < (r.submitted_at, r.id);
create unique index if not exists responses_one_per_account
  on public.responses (form_id, voter_id)
  where voter_id is not null;

-- Superseded by the "own response" select policy below: an authenticated voter
-- can now read their own row directly, so the boolean-only workaround for
-- anonymous voters is no longer needed.
drop function if exists public.has_responded(uuid, text);

-- Voting is authenticated-only, you may only file a response as yourself, and
-- only against a form that is actually taking them. The first clause stops a
-- hand-made request voting on someone else's behalf; the `exists` stops one
-- landing on a draft, a closed form, or one past its expiry.
--
-- The status check lives here rather than only in the client because the
-- creator's own preview posts to the same endpoint: a draft they were still
-- writing would otherwise collect responses from its own preview, and the
-- tally on their dashboard would count rehearsals as results.
drop policy if exists "anyone insert responses" on public.responses;
drop policy if exists "signed-in insert own response" on public.responses;
create policy "signed-in insert own response" on public.responses for insert
  to authenticated
  with check (
    voter_id = auth.uid()
    and public.is_noon_user()
    and exists (
      select 1 from public.forms f
       where f.id = form_id
         and f.status = 'open'
         and (f.expires_at is null or f.expires_at > now())
    )
  );

-- So a voter can be told "you've already responded" before filling the form in.
-- Scoped to their own rows: it reveals nothing about anyone else's answers.
drop policy if exists "voter reads own response" on public.responses;
create policy "voter reads own response" on public.responses for select
  to authenticated
  using (voter_id = auth.uid());

-- Answers follow the same rule: only attachable to a response you own.
drop policy if exists "anyone insert answers" on public.response_answers;
drop policy if exists "signed-in insert own answers" on public.response_answers;
create policy "signed-in insert own answers" on public.response_answers for insert
  to authenticated
  with check (exists (select 1 from public.responses r
                      where r.id = response_id and r.voter_id = auth.uid()));

-- ---------------------------------------------------------------------------
-- Who responded (creator only)
-- ---------------------------------------------------------------------------
-- The results page lists respondents by name. That needs `auth.users`, which no
-- client may read, and `responses`, which is owner-only — so it goes through a
-- security definer RPC rather than a query.
--
-- The `exists` clause is the access control: it runs with the definer's rights,
-- so the caller's own id is the only thing that decides whether any rows come
-- back. A non-owner asking for someone else's form gets an empty set, not an
-- error — there is nothing to probe.
--
-- Deliberately no `voter_email` column on `responses`: denormalising it would
-- mean trusting the client to state who it is, and the address would then rot
-- when someone's account changes.
create or replace function public.form_voters(p_form_id uuid)
returns table (
  response_id  uuid,
  voter_email  text,
  submitted_at timestamptz,
  choices      jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select r.id, u.email::text, r.submitted_at, r.choices
    from public.responses r
    left join auth.users u on u.id = r.voter_id
   where r.form_id = p_form_id
     and exists (
       select 1 from public.forms f
        where f.id = p_form_id and f.creator_id = auth.uid()
     )
   order by r.submitted_at desc;
$$;

revoke all on function public.form_voters(uuid) from public;
grant execute on function public.form_voters(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Team feed
-- ---------------------------------------------------------------------------
-- Every published form in the workspace — open and closed, by any creator —
-- with the dashboard metadata, response tally, and author needed by Team.
--
-- RLS deliberately hides other creators' response rows and auth.users. This
-- narrowly scoped security-definer function returns one aggregate row per form
-- without granting access to either of those source sets.
-- The caller must be an authenticated workspace user; anonymous clients cannot
-- execute it.
drop function if exists public.team_forms();
create or replace function public.team_forms()
returns table (
  id                uuid,
  slug              text,
  name              text,
  title             text,
  testing_question  text,
  status            text,
  creator_id        uuid,
  creator_email     text,
  expires_at        timestamptz,
  pod               text,
  collaborators     text[],
  hero_image_url    text,
  hero_bg           text,
  hero_dither       boolean,
  show_results_to_voters boolean,
  viewer_has_responded boolean,
  response_count    bigint,
  last_response_at  timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select f.id,
         f.slug,
         f.name,
         f.title,
         f.testing_question,
         f.status,
         f.creator_id,
         u.email::text,
         f.expires_at,
         f.pod,
         f.collaborators,
         f.hero_image_url,
         f.hero_bg,
         f.hero_dither,
         f.show_results_to_voters,
         coalesce(bool_or(r.voter_id = auth.uid()), false),
         count(r.id),
         max(r.submitted_at)
    from public.forms f
    join auth.users u on u.id = f.creator_id
    left join public.responses r on r.form_id = f.id
   where f.status in ('open', 'closed')
     and auth.uid() is not null
     and public.is_noon_user()
   group by f.id, u.email
   order by coalesce(f.published_at, f.created_at) desc;
$$;

revoke all on function public.team_forms() from public;
grant execute on function public.team_forms() to authenticated;

-- ---------------------------------------------------------------------------
-- Atomic response submission and aggregate voter results
-- ---------------------------------------------------------------------------
drop function if exists public.submit_form_response(uuid, text, jsonb, jsonb);
create function public.submit_form_response(
  p_form_id uuid,
  p_voter_session_id text,
  p_choices jsonb,
  p_answers jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_response_id uuid := gen_random_uuid();
  v_answer_count integer := 0;
  v_choice_count integer := 0;
begin
  if auth.uid() is null or not public.is_noon_user() then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.forms f
     where f.id = p_form_id
       and f.status = 'open'
       and (f.expires_at is null or f.expires_at > now())
  ) then
    raise exception 'Form is not accepting responses' using errcode = 'P0001';
  end if;

  select count(*)::integer
    into v_choice_count
    from jsonb_each_text(coalesce(p_choices, '{}'::jsonb)) choice(page_id, option_id)
    join public.pages p
      on p.id::text = choice.page_id
     and p.form_id = p_form_id
     and p.type = 'feedback'
   where (
          choice.option_id = 'tie'
          and p.show_neutral_option
          and (select count(*) from public.options o where o.page_id = p.id) >= 2
         )
      or exists (
          select 1 from public.options o
           where o.id::text = choice.option_id
             and o.page_id = p.id
             and o.form_id = p_form_id
         );

  if v_choice_count <> (
    select count(*) from jsonb_object_keys(coalesce(p_choices, '{}'::jsonb))
  ) then
    raise exception 'Invalid form choice' using errcode = '22023';
  end if;

  insert into public.responses (id, form_id, voter_id, voter_session_id, choices)
  values (
    v_response_id,
    p_form_id,
    auth.uid(),
    p_voter_session_id,
    coalesce(p_choices, '{}'::jsonb)
  );

  insert into public.response_answers (response_id, widget_id, value)
  select v_response_id, w.id, answer.value
    from jsonb_each(coalesce(p_answers, '{}'::jsonb)) answer(widget_id, value)
    join public.widgets w
      on w.id::text = answer.widget_id
     and w.form_id = p_form_id
    join public.pages p
      on p.id = w.page_id
     and p.form_id = p_form_id
     and p.type = 'feedback';

  get diagnostics v_answer_count = row_count;
  if v_answer_count <> (
    select count(*) from jsonb_object_keys(coalesce(p_answers, '{}'::jsonb))
  ) then
    raise exception 'Invalid widget answer' using errcode = '22023';
  end if;

  return v_response_id;
end;
$$;

revoke all on function public.submit_form_response(uuid, text, jsonb, jsonb) from public;
grant execute on function public.submit_form_response(uuid, text, jsonb, jsonb) to authenticated;

drop function if exists public.form_results(uuid);
create function public.form_results(p_form_id uuid)
returns table (
  total bigint,
  first_at timestamptz,
  last_at timestamptz,
  option_counts jsonb,
  answers jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  with response_stats as (
    select count(*) as total,
           min(r.submitted_at) as first_at,
           max(r.submitted_at) as last_at
      from public.responses r
     where r.form_id = p_form_id
  ),
  choice_counts as (
    select case
             when choice.option_id = 'tie' then 'tie:' || choice.page_id
             else choice.option_id
           end as bucket,
           count(*) as vote_count
      from public.responses r
      cross join lateral jsonb_each_text(coalesce(r.choices, '{}'::jsonb))
        choice(page_id, option_id)
     where r.form_id = p_form_id
     group by 1
  ),
  answer_rows as (
    select a.id, a.widget_id, a.value, a.upvotes
      from public.response_answers a
      join public.responses r on r.id = a.response_id
     where r.form_id = p_form_id
  )
  select stats.total,
         stats.first_at,
         stats.last_at,
         coalesce(
           (select jsonb_object_agg(c.bucket, c.vote_count) from choice_counts c),
           '{}'::jsonb
         ),
         coalesce(
           (
             select jsonb_agg(
               jsonb_build_object(
                 'id', a.id,
                 'widget_id', a.widget_id,
                 'value', a.value,
                 'upvotes', a.upvotes
               )
               order by a.id
             )
             from answer_rows a
           ),
           '[]'::jsonb
         )
    from response_stats stats
   where exists (
     select 1 from public.forms f
      where f.id = p_form_id
        and auth.uid() is not null
        and public.is_noon_user()
        and (
          public.is_editor(f.creator_id, f.collaborators)
          or (f.show_results_to_voters and f.status in ('open', 'closed'))
        )
   );
$$;

revoke all on function public.form_results(uuid) from public;
grant execute on function public.form_results(uuid) to authenticated;

drop function if exists public.upvote_form_answer(uuid);
create function public.upvote_form_answer(p_answer_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_upvotes integer;
begin
  if auth.uid() is null or not public.is_noon_user() then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  update public.response_answers a
     set upvotes = a.upvotes + 1
   where a.id = p_answer_id
     and exists (
       select 1
         from public.responses r
         join public.forms f on f.id = r.form_id
        where r.id = a.response_id
          and f.show_results_to_voters
          and f.status in ('open', 'closed')
     )
  returning a.upvotes into v_upvotes;

  if v_upvotes is null then
    raise exception 'Answer is not available for voting' using errcode = '42501';
  end if;

  return v_upvotes;
end;
$$;

revoke all on function public.upvote_form_answer(uuid) from public;
grant execute on function public.upvote_form_answer(uuid) to authenticated;
