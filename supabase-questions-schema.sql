create table if not exists public.qa_questions_state (
  id text primary key,
  state jsonb not null,
  updated_at timestamptz not null default now()
);

create or replace function public.qa_questions_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists qa_questions_state_set_updated_at on public.qa_questions_state;
create trigger qa_questions_state_set_updated_at
before update on public.qa_questions_state
for each row
execute function public.qa_questions_set_updated_at();

alter table public.qa_questions_state enable row level security;

drop policy if exists "Authenticated users can read QA questions" on public.qa_questions_state;
drop policy if exists "Authenticated users can insert QA questions" on public.qa_questions_state;
drop policy if exists "Authenticated users can update QA questions" on public.qa_questions_state;
drop policy if exists "Authenticated users can delete QA questions" on public.qa_questions_state;

create policy "Authenticated users can read QA questions"
on public.qa_questions_state
for select
to authenticated
using (id = 'qa-questions-main');

create policy "Authenticated users can insert QA questions"
on public.qa_questions_state
for insert
to authenticated
with check (id = 'qa-questions-main');

create policy "Authenticated users can update QA questions"
on public.qa_questions_state
for update
to authenticated
using (id = 'qa-questions-main')
with check (id = 'qa-questions-main');

create policy "Authenticated users can delete QA questions"
on public.qa_questions_state
for delete
to authenticated
using (id = 'qa-questions-main');
