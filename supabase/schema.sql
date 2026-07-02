-- RnR 2.0 poll — run this once in the Supabase SQL editor
-- (Dashboard → SQL Editor → New query → paste → Run).

create table if not exists public.votes (
  id          uuid primary key default gen_random_uuid(),
  poll_slug   text not null default 'rnr-pills-vs-checkbox',
  choice      text not null check (choice in ('A', 'B', 'Both')),
  comment     text check (char_length(comment) <= 2000),
  created_at  timestamptz not null default now()
);

create index if not exists votes_poll_created_idx
  on public.votes (poll_slug, created_at desc);

-- Row-Level Security: the anon (public) key may insert a vote and read votes,
-- but cannot update or delete anything.
alter table public.votes enable row level security;

drop policy if exists "anon can insert votes" on public.votes;
create policy "anon can insert votes"
  on public.votes for insert
  to anon, authenticated
  with check (true);

drop policy if exists "anyone can read votes" on public.votes;
create policy "anyone can read votes"
  on public.votes for select
  to anon, authenticated
  using (true);
