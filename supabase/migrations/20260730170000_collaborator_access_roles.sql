-- Editors keep the historical collaborators column. View-only access is kept
-- separately so existing forms and editor permissions remain backwards-compatible.
alter table public.forms
  add column if not exists viewers text[] not null default '{}';

-- Normalize existing editor emails before the trigger starts comparing role
-- lists. This keeps historical mixed-case values from looking like an access
-- change during an editor's next ordinary autosave.
update public.forms
   set collaborators = array(
     select distinct lower(btrim(email)) as normalized
       from unnest(coalesce(collaborators, '{}'::text[])) email
      where btrim(email) <> ''
      order by normalized
   );

alter table public.forms
  drop constraint if exists forms_collaborator_roles_do_not_overlap;
alter table public.forms
  add constraint forms_collaborator_roles_do_not_overlap
  check (not collaborators && viewers);

create or replace function public.can_view_form(
  creator uuid,
  collaborators text[],
  viewers text[]
)
returns boolean
language sql
stable
as $$
  select public.is_noon_user()
     and (
       creator = auth.uid()
       or lower(auth.jwt() ->> 'email') = any (
         array(select lower(c) from unnest(coalesce(collaborators, '{}'::text[])) c)
       )
       or lower(auth.jwt() ->> 'email') = any (
         array(select lower(v) from unnest(coalesce(viewers, '{}'::text[])) v)
       )
     )
$$;

-- Read-only collaborators may read every part of a draft. Only owners/editors
-- satisfy the existing write policies.
drop policy if exists "read open forms" on public.forms;
create policy "read open forms" on public.forms for select
  to anon, authenticated
  using (
    status = 'open'
    or public.can_view_form(creator_id, collaborators, viewers)
    or (status = 'closed' and auth.uid() is not null and public.is_noon_user())
  );

drop policy if exists "read pages" on public.pages;
create policy "read pages" on public.pages for select
  to anon, authenticated
  using (
    exists (
      select 1
        from public.forms f
       where f.id = form_id
         and (
           f.status = 'open'
           or public.can_view_form(f.creator_id, f.collaborators, f.viewers)
           or (f.status = 'closed' and auth.uid() is not null and public.is_noon_user())
         )
    )
  );

drop policy if exists "read options" on public.options;
create policy "read options" on public.options for select
  to anon, authenticated
  using (
    exists (
      select 1
        from public.forms f
       where f.id = form_id
         and (
           f.status = 'open'
           or public.can_view_form(f.creator_id, f.collaborators, f.viewers)
           or (f.status = 'closed' and auth.uid() is not null and public.is_noon_user())
         )
    )
  );

drop policy if exists "read widgets" on public.widgets;
create policy "read widgets" on public.widgets for select
  to anon, authenticated
  using (
    exists (
      select 1
        from public.forms f
       where f.id = form_id
         and (
           f.status = 'open'
           or public.can_view_form(f.creator_id, f.collaborators, f.viewers)
           or (f.status = 'closed' and auth.uid() is not null and public.is_noon_user())
         )
    )
  );

-- Editors control the document, but only the owner controls who has access.
create or replace function public.protect_form_access()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_role text := coalesce(auth.jwt() ->> 'role', '');
begin
  new.collaborators := array(
    select distinct lower(btrim(email)) as normalized
      from unnest(coalesce(new.collaborators, '{}'::text[])) email
     where btrim(email) <> ''
     order by normalized
  );
  new.viewers := array(
    select distinct lower(btrim(email)) as normalized
      from unnest(coalesce(new.viewers, '{}'::text[])) email
     where btrim(email) <> ''
     order by normalized
  );

  if exists (
    select 1
      from unnest(new.collaborators || new.viewers) email
     where lower(email) not like '%@noon.com'
  ) then
    raise exception 'Collaborators must use @noon.com accounts' using errcode = '22023';
  end if;

  if new.collaborators && new.viewers then
    raise exception 'A collaborator cannot have both edit and view access' using errcode = '22023';
  end if;

  if v_role <> 'service_role' then
    if new.creator_id is distinct from old.creator_id then
      raise exception 'Form ownership cannot be transferred' using errcode = '42501';
    end if;
    if auth.uid() is distinct from old.creator_id
       and (
         new.collaborators is distinct from old.collaborators
         or new.viewers is distinct from old.viewers
       ) then
      raise exception 'Only the owner can manage collaborators' using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists protect_form_access on public.forms;
create trigger protect_form_access
before update of creator_id, collaborators, viewers on public.forms
for each row execute function public.protect_form_access();

-- View-only collaborators need the owner's identity for the access list and
-- presence bar, but this remains a form-scoped lookup.
create or replace function public.form_owner_email(p_form_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select u.email::text
    from public.forms f
    join auth.users u on u.id = f.creator_id
   where f.id = p_form_id
     and public.can_view_form(f.creator_id, f.collaborators, f.viewers);
$$;

revoke all on function public.form_owner_email(uuid) from public;
grant execute on function public.form_owner_email(uuid) to authenticated;

-- The Team feed includes both role lists so avatars and access-aware client
-- routing do not silently omit view-only collaborators.
drop function if exists public.team_forms();
create function public.team_forms()
returns table (
  id uuid,
  slug text,
  name text,
  title text,
  testing_question text,
  status text,
  creator_id uuid,
  creator_email text,
  expires_at timestamptz,
  pod text,
  collaborators text[],
  viewers text[],
  hero_image_url text,
  hero_bg text,
  hero_dither boolean,
  show_results_to_voters boolean,
  viewer_has_responded boolean,
  response_count bigint,
  last_response_at timestamptz
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
         f.viewers,
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

-- Collaboration notifications now understand both roles and role changes.
create or replace function public.notify_form_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_access record;
  v_title text := coalesce(
    nullif(btrim(new.name), ''),
    nullif(btrim(new.title), ''),
    'Untitled form'
  );
begin
  if new.status = 'open' and old.status is distinct from 'open' then
    for v_access in
      select lower(u.email::text) as email
        from auth.users u
       where u.id = new.creator_id
      union
      select lower(c) from unnest(coalesce(new.collaborators, '{}'::text[])) c
      union
      select lower(v) from unnest(coalesce(new.viewers, '{}'::text[])) v
    loop
      insert into public.notifications (
        recipient_email, form_id, event_type, event_key, title, message, action_path
      )
      values (
        v_access.email, new.id, 'form_published',
        'published:' || new.id::text || ':' ||
          coalesce(new.published_at::text, clock_timestamp()::text),
        'Form published',
        '“' || v_title || '” is live and ready for votes.',
        '/creator/' || new.id::text || '/edit'
      )
      on conflict do nothing;
    end loop;
  end if;

  for v_access in
    with old_access as (
      select lower(c) as email from unnest(coalesce(old.collaborators, '{}'::text[])) c
      union
      select lower(v) from unnest(coalesce(old.viewers, '{}'::text[])) v
    ),
    new_access as (
      select lower(c) as email, 'edit'::text as access
        from unnest(coalesce(new.collaborators, '{}'::text[])) c
      union all
      select lower(v), 'view'::text
        from unnest(coalesce(new.viewers, '{}'::text[])) v
    )
    select n.email, n.access
      from new_access n
     where not exists (select 1 from old_access o where o.email = n.email)
  loop
    insert into public.notifications (
      recipient_email, form_id, event_type, event_key, title, message, action_path
    )
    values (
      v_access.email, new.id, 'collaborator_added',
      'collaborator-added:' || new.id::text || ':' || gen_random_uuid()::text,
      'Added as collaborator',
      case
        when v_access.access = 'edit'
          then 'You can now edit “' || v_title || '” and see its complete results.'
        else 'You can now view every page in “' || v_title || '”.'
      end,
      '/creator/' || new.id::text || '/edit'
    );
  end loop;

  for v_access in
    with old_access as (
      select lower(c) as email from unnest(coalesce(old.collaborators, '{}'::text[])) c
      union
      select lower(v) from unnest(coalesce(old.viewers, '{}'::text[])) v
    ),
    new_access as (
      select lower(c) as email from unnest(coalesce(new.collaborators, '{}'::text[])) c
      union
      select lower(v) from unnest(coalesce(new.viewers, '{}'::text[])) v
    )
    select o.email
      from old_access o
     where not exists (select 1 from new_access n where n.email = o.email)
  loop
    insert into public.notifications (
      recipient_email, form_id, event_type, event_key, title, message, action_path
    )
    values (
      v_access.email, new.id, 'collaborator_removed',
      'collaborator-removed:' || new.id::text || ':' || gen_random_uuid()::text,
      'Removed as collaborator',
      'You no longer have access to “' || v_title || '”.',
      '/creator'
    );
  end loop;

  for v_access in
    with old_access as (
      select lower(c) as email, 'edit'::text as access
        from unnest(coalesce(old.collaborators, '{}'::text[])) c
      union all
      select lower(v), 'view'::text
        from unnest(coalesce(old.viewers, '{}'::text[])) v
    ),
    new_access as (
      select lower(c) as email, 'edit'::text as access
        from unnest(coalesce(new.collaborators, '{}'::text[])) c
      union all
      select lower(v), 'view'::text
        from unnest(coalesce(new.viewers, '{}'::text[])) v
    )
    select n.email, n.access
      from new_access n
      join old_access o on o.email = n.email
     where o.access <> n.access
  loop
    insert into public.notifications (
      recipient_email, form_id, event_type, event_key, title, message, action_path
    )
    values (
      v_access.email, new.id, 'collaborator_added',
      'collaborator-access:' || new.id::text || ':' || gen_random_uuid()::text,
      'Access updated',
      case
        when v_access.access = 'edit'
          then 'You now have edit access to “' || v_title || '”.'
        else 'You now have view-only access to “' || v_title || '”.'
      end,
      '/creator/' || new.id::text || '/edit'
    );
  end loop;

  return new;
end;
$$;

drop trigger if exists notify_form_change on public.forms;
create trigger notify_form_change
after update of status, published_at, collaborators, viewers on public.forms
for each row execute function public.notify_form_change();
