-- Returning voters can review their submitted widget answers while walking the
-- form in read-only mode. The parent response row owns voter identity, keeping
-- every other person's answers private.
drop policy if exists "voter reads own answers" on public.response_answers;
create policy "voter reads own answers" on public.response_answers for select
  to authenticated
  using (
    exists (
      select 1
        from public.responses r
       where r.id = response_id
         and r.voter_id = auth.uid()
    )
  );
