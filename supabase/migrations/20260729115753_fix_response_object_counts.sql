-- jsonb_object_length is not available on the linked Postgres project. Count
-- object keys instead while keeping submission atomic.
create or replace function public.submit_form_response(
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
