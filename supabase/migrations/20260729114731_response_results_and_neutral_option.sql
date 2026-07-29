-- Let creators decide whether voters see the generated neutral choice.
alter table public.pages
  add column if not exists show_neutral_option boolean not null default true;

-- Save the response and all of its widget answers atomically. The caller never
-- supplies voter_id: it is always taken from the authenticated session.
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
    select 1
      from public.forms f
     where f.id = p_form_id
       and f.status = 'open'
       and (f.expires_at is null or f.expires_at > now())
  ) then
    raise exception 'Form is not accepting responses' using errcode = 'P0001';
  end if;

  -- Reject forged page/option pairs. A neutral choice is valid only when the
  -- creator left it visible and the page has at least two authored options.
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
          select 1
            from public.options o
           where o.id::text = choice.option_id
             and o.page_id = p.id
             and o.form_id = p_form_id
         );

  if v_choice_count <> (
    select count(*) from jsonb_object_keys(coalesce(p_choices, '{}'::jsonb))
  ) then
    raise exception 'Invalid form choice' using errcode = '22023';
  end if;

  insert into public.responses (
    id,
    form_id,
    voter_id,
    voter_session_id,
    choices
  )
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

-- Aggregate results for creators and, when enabled, signed-in voters. This
-- intentionally returns no voter id/email/session id; form_voters() remains the
-- separate creator-only identity view.
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
    select a.id,
           a.widget_id,
           a.value,
           a.upvotes
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
         ) as option_counts,
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
         ) as answers
    from response_stats stats
   where exists (
     select 1
       from public.forms f
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

-- Increment comment upvotes in the database so simultaneous voters cannot
-- overwrite each other with the same client-computed value.
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
