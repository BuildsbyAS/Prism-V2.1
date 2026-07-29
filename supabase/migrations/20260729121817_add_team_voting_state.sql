-- Team cards need to distinguish a form the viewer can still vote on from one
-- they have already submitted. Return only the boolean state; individual
-- response rows and voter identities remain protected.
drop function if exists public.team_forms();
create function public.team_forms()
returns table (
  id                       uuid,
  slug                     text,
  name                     text,
  title                    text,
  testing_question         text,
  status                   text,
  creator_id               uuid,
  creator_email            text,
  expires_at               timestamptz,
  pod                      text,
  collaborators            text[],
  hero_image_url           text,
  hero_bg                  text,
  hero_dither              boolean,
  show_results_to_voters   boolean,
  viewer_has_responded     boolean,
  response_count           bigint,
  last_response_at         timestamptz
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

-- A closed form can no longer accept votes, but it still belongs in the
-- authenticated Team workspace for preview and shared results. Keep anonymous
-- access limited to open forms.
drop policy if exists "read open forms" on public.forms;
create policy "read open forms" on public.forms for select
  to anon, authenticated
  using (
    status = 'open'
    or creator_id = auth.uid()
    or public.is_editor(creator_id, collaborators)
    or (status = 'closed' and auth.uid() is not null and public.is_noon_user())
  );

drop policy if exists "read pages" on public.pages;
create policy "read pages" on public.pages for select
  to anon, authenticated
  using (exists (
    select 1
      from public.forms f
     where f.id = form_id
       and (
         f.status = 'open'
         or f.creator_id = auth.uid()
         or public.is_editor(f.creator_id, f.collaborators)
         or (f.status = 'closed' and auth.uid() is not null and public.is_noon_user())
       )
  ));

drop policy if exists "read options" on public.options;
create policy "read options" on public.options for select
  to anon, authenticated
  using (exists (
    select 1
      from public.forms f
     where f.id = form_id
       and (
         f.status = 'open'
         or f.creator_id = auth.uid()
         or public.is_editor(f.creator_id, f.collaborators)
         or (f.status = 'closed' and auth.uid() is not null and public.is_noon_user())
       )
  ));

drop policy if exists "read widgets" on public.widgets;
create policy "read widgets" on public.widgets for select
  to anon, authenticated
  using (exists (
    select 1
      from public.forms f
     where f.id = form_id
       and (
         f.status = 'open'
         or f.creator_id = auth.uid()
         or public.is_editor(f.creator_id, f.collaborators)
         or (f.status = 'closed' and auth.uid() is not null and public.is_noon_user())
       )
  ));
