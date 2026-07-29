-- Restore the aggregate RPC used by the Team dashboard. It was present in the
-- application data layer and earlier workspace history, but absent from the
-- deployed schema, so every browser call failed with PostgREST PGRST202.
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
