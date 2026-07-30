-- Three changes, all mirrored in schema.sql.
--
-- 1. Responses only count for a published, unexpired form. The creator's own
--    preview posts to the same endpoint as a voter, so without this a draft
--    collected responses from its own rehearsals and the tally on the dashboard
--    counted them as results.
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

-- 2. The publish dialog names the form's owner. creator_id is an auth.users id
--    and auth.users is unreadable from a client, so this needs a definer
--    function — scoped to that form's own editors rather than being a general
--    id→email lookup.
create or replace function public.form_owner_email(p_form_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select u.email::text
    from public.forms f
    join auth.users u on u.id = f.creator_id
   where f.id = p_form_id
     and public.is_editor(f.creator_id, f.collaborators);
$$;

revoke all on function public.form_owner_email(uuid) from public;
grant execute on function public.form_owner_email(uuid) to authenticated;

-- 3. Creators can reword a page's neutral choice ("Both feel equal"). Empty
--    means "use the generated wording", which depends on the option count — so
--    existing rows are left blank rather than backfilled with today's text.
alter table public.pages
  add column if not exists neutral_label text not null default '';
