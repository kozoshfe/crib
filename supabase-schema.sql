create table if not exists public.qa_handbook_state (
  id text primary key,
  state jsonb not null,
  updated_at timestamptz not null default now()
);

create or replace function public.qa_handbook_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists qa_handbook_state_set_updated_at on public.qa_handbook_state;
create trigger qa_handbook_state_set_updated_at
before update on public.qa_handbook_state
for each row
execute function public.qa_handbook_set_updated_at();

alter table public.qa_handbook_state enable row level security;

drop policy if exists "Authenticated users can read QA handbook" on public.qa_handbook_state;
drop policy if exists "Authenticated users can insert QA handbook" on public.qa_handbook_state;
drop policy if exists "Authenticated users can update QA handbook" on public.qa_handbook_state;
drop policy if exists "Authenticated users can delete QA handbook" on public.qa_handbook_state;

create policy "Authenticated users can read QA handbook"
on public.qa_handbook_state
for select
to authenticated
using (id = 'qa-handbook-main');

create policy "Authenticated users can insert QA handbook"
on public.qa_handbook_state
for insert
to authenticated
with check (id = 'qa-handbook-main');

create policy "Authenticated users can update QA handbook"
on public.qa_handbook_state
for update
to authenticated
using (id = 'qa-handbook-main')
with check (id = 'qa-handbook-main');

create policy "Authenticated users can delete QA handbook"
on public.qa_handbook_state
for delete
to authenticated
using (id = 'qa-handbook-main');
