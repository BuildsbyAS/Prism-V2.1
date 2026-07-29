-- Collaborators are editors: they get the same complete results access as the
-- creator, and notifications are addressed by email so an invited colleague
-- can receive the event even if they have not created an account yet.

drop policy if exists "owner read responses" on public.responses;
create policy "editors read responses" on public.responses for select
  to authenticated
  using (
    exists (
      select 1
        from public.forms f
       where f.id = form_id
         and public.is_editor(f.creator_id, f.collaborators)
    )
  );

drop policy if exists "owner read answers" on public.response_answers;
create policy "editors read answers" on public.response_answers for select
  to authenticated
  using (
    exists (
      select 1
        from public.responses r
        join public.forms f on f.id = r.form_id
       where r.id = response_id
         and public.is_editor(f.creator_id, f.collaborators)
    )
  );

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
set search_path = ''
as $$
  select r.id, u.email::text, r.submitted_at, r.choices
    from public.responses r
    left join auth.users u on u.id = r.voter_id
   where r.form_id = p_form_id
     and exists (
       select 1
         from public.forms f
        where f.id = p_form_id
          and public.is_editor(f.creator_id, f.collaborators)
     )
   order by r.submitted_at desc;
$$;

revoke all on function public.form_voters(uuid) from public;
grant execute on function public.form_voters(uuid) to authenticated;

create table if not exists public.notifications (
  id               uuid primary key default gen_random_uuid(),
  recipient_email  text not null,
  form_id           uuid references public.forms on delete set null,
  event_type        text not null check (
    event_type in (
      'form_published',
      'vote_received',
      'collaborator_added',
      'collaborator_removed',
      'form_expired',
      'final_results'
    )
  ),
  event_key         text not null,
  title             text not null,
  message           text not null,
  action_path       text,
  created_at        timestamptz not null default now(),
  read_at           timestamptz
);

create unique index if not exists notifications_recipient_event_idx
  on public.notifications (lower(recipient_email), event_key);
create index if not exists notifications_recipient_created_idx
  on public.notifications (lower(recipient_email), created_at desc);

alter table public.notifications enable row level security;

drop policy if exists "read own notifications" on public.notifications;
create policy "read own notifications" on public.notifications for select
  to authenticated
  using (
    public.is_noon_user()
    and lower(recipient_email) = lower(auth.jwt() ->> 'email')
  );

drop policy if exists "update own notifications" on public.notifications;
create policy "update own notifications" on public.notifications for update
  to authenticated
  using (
    public.is_noon_user()
    and lower(recipient_email) = lower(auth.jwt() ->> 'email')
  )
  with check (
    public.is_noon_user()
    and lower(recipient_email) = lower(auth.jwt() ->> 'email')
  );

create or replace function public.notify_form_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text;
  v_title text := coalesce(
    nullif(btrim(new.name), ''),
    nullif(btrim(new.title), ''),
    'Untitled form'
  );
begin
  if new.status = 'open' and old.status is distinct from 'open' then
    for v_email in
      select lower(u.email::text)
        from auth.users u
       where u.id = new.creator_id
      union
      select lower(c)
        from unnest(coalesce(new.collaborators, '{}'::text[])) c
    loop
      insert into public.notifications (
        recipient_email, form_id, event_type, event_key, title, message, action_path
      )
      values (
        v_email,
        new.id,
        'form_published',
        'published:' || new.id::text || ':' || coalesce(new.published_at::text, clock_timestamp()::text),
        'Form published',
        '“' || v_title || '” is live and ready for votes.',
        '/creator/' || new.id::text || '/edit'
      )
      on conflict do nothing;
    end loop;
  end if;

  for v_email in
    select lower(c)
      from unnest(coalesce(new.collaborators, '{}'::text[])) c
    except
    select lower(c)
      from unnest(coalesce(old.collaborators, '{}'::text[])) c
  loop
    insert into public.notifications (
      recipient_email, form_id, event_type, event_key, title, message, action_path
    )
    values (
      v_email,
      new.id,
      'collaborator_added',
      'collaborator-added:' || new.id::text || ':' || gen_random_uuid()::text,
      'Added as collaborator',
      'You can now edit “' || v_title || '” and see its complete results.',
      '/creator/' || new.id::text || '/edit'
    );
  end loop;

  for v_email in
    select lower(c)
      from unnest(coalesce(old.collaborators, '{}'::text[])) c
    except
    select lower(c)
      from unnest(coalesce(new.collaborators, '{}'::text[])) c
  loop
    insert into public.notifications (
      recipient_email, form_id, event_type, event_key, title, message, action_path
    )
    values (
      v_email,
      new.id,
      'collaborator_removed',
      'collaborator-removed:' || new.id::text || ':' || gen_random_uuid()::text,
      'Removed as collaborator',
      'You no longer have editor access to “' || v_title || '”.',
      '/creator'
    );
  end loop;

  return new;
end;
$$;

drop trigger if exists notify_form_change on public.forms;
create trigger notify_form_change
after update of status, published_at, collaborators on public.forms
for each row execute function public.notify_form_change();

create or replace function public.notify_vote_received()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text;
  v_title text;
begin
  select coalesce(
           nullif(btrim(f.name), ''),
           nullif(btrim(f.title), ''),
           'Untitled form'
         )
    into v_title
    from public.forms f
   where f.id = new.form_id;

  for v_email in
    select lower(u.email::text)
      from public.forms f
      join auth.users u on u.id = f.creator_id
     where f.id = new.form_id
    union
    select lower(c)
      from public.forms f
      cross join lateral unnest(coalesce(f.collaborators, '{}'::text[])) c
     where f.id = new.form_id
  loop
    insert into public.notifications (
      recipient_email, form_id, event_type, event_key, title, message, action_path, created_at
    )
    values (
      v_email,
      new.form_id,
      'vote_received',
      'vote:' || new.id::text,
      'New vote received',
      '“' || v_title || '” received a new response.',
      '/creator/' || new.form_id::text || '/results',
      new.submitted_at
    )
    on conflict do nothing;
  end loop;

  return new;
end;
$$;

drop trigger if exists notify_vote_received on public.responses;
create trigger notify_vote_received
after insert on public.responses
for each row execute function public.notify_vote_received();

create or replace function public.ensure_due_notifications()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(auth.jwt() ->> 'email');
begin
  if auth.uid() is null or not public.is_noon_user() then
    return;
  end if;

  insert into public.notifications (
    recipient_email, form_id, event_type, event_key, title, message, action_path, created_at
  )
  select v_email,
         f.id,
         'form_expired',
         'expired:' || f.id::text || ':' || f.expires_at::text,
         'Form expired',
         '“' || coalesce(nullif(btrim(f.name), ''), nullif(btrim(f.title), ''), 'Untitled form') ||
           '” is no longer accepting votes.',
         '/creator/' || f.id::text || '/results',
         greatest(f.expires_at, f.created_at)
    from public.forms f
    join auth.users u on u.id = f.creator_id
   where f.expires_at is not null
     and f.expires_at <= now()
     and f.published_at is not null
     and (
       lower(u.email::text) = v_email
       or v_email = any (
         array(select lower(c) from unnest(coalesce(f.collaborators, '{}'::text[])) c)
       )
     )
  on conflict do nothing;

  insert into public.notifications (
    recipient_email, form_id, event_type, event_key, title, message, action_path, created_at
  )
  select v_email,
         f.id,
         'final_results',
         'final-results:' || f.id::text || ':' || f.expires_at::text,
         'Final results are ready',
         'Voting has closed for “' ||
           coalesce(nullif(btrim(f.name), ''), nullif(btrim(f.title), ''), 'Untitled form') ||
           '”. Open the complete results.',
         '/creator/' || f.id::text || '/results',
         greatest(f.expires_at, f.created_at) + interval '1 millisecond'
    from public.forms f
    join auth.users u on u.id = f.creator_id
   where f.expires_at is not null
     and f.expires_at <= now()
     and f.published_at is not null
     and (
       lower(u.email::text) = v_email
       or v_email = any (
         array(select lower(c) from unnest(coalesce(f.collaborators, '{}'::text[])) c)
       )
     )
  on conflict do nothing;
end;
$$;

revoke all on function public.ensure_due_notifications() from public;

create or replace function public.form_notifications()
returns table (
  id uuid,
  form_id uuid,
  event_type text,
  title text,
  message text,
  action_path text,
  created_at timestamptz,
  read_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.is_noon_user() then
    return;
  end if;

  perform public.ensure_due_notifications();

  return query
  select n.id,
         n.form_id,
         n.event_type,
         n.title,
         n.message,
         n.action_path,
         n.created_at,
         n.read_at
    from public.notifications n
   where lower(n.recipient_email) = lower(auth.jwt() ->> 'email')
   order by n.created_at desc
   limit 100;
end;
$$;

revoke all on function public.form_notifications() from public;
grant execute on function public.form_notifications() to authenticated;
