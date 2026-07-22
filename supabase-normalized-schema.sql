-- Перехід від JSON-сховища до звичайних таблиць Supabase.
-- Запускати один раз у Supabase Dashboard -> SQL Editor.
-- Старі qa_*_state таблиці НЕ видаляються: це резервна копія до перевірки сайту.

begin;

-- Якщо запускали попередній скрипт з view, замінюємо ці view на таблиці.
do $$
declare view_name text;
begin
  foreach view_name in array array['qa_test_known_questions', 'qa_questions', 'qa_question_categories', 'qa_handbook_questions', 'qa_handbook_categories']
  loop
    if exists (select 1 from pg_class where relnamespace = 'public'::regnamespace and relname = view_name and relkind = 'v') then
      execute format('drop view public.%I', view_name);
    end if;
  end loop;
end;
$$;

create table if not exists public.qa_handbook_categories (
  id text primary key,
  name text not null,
  sort_order integer not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.qa_handbook_questions (
  id text primary key,
  category_id text not null references public.qa_handbook_categories(id) on delete cascade,
  question text not null,
  answer text not null,
  study_status text not null default '',
  sort_order integer not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.qa_question_categories (
  id text primary key,
  name text not null,
  source text not null default 'handbook',
  sort_order integer not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.qa_questions (
  id text primary key,
  category_id text not null references public.qa_question_categories(id) on delete cascade,
  source text not null default 'manual',
  question text not null,
  note text not null default '',
  done boolean not null default false,
  covered_by text,
  created_at timestamptz,
  sort_order integer not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.qa_test_known_questions (
  question_id text primary key,
  known boolean not null default true,
  updated_at timestamptz not null default now()
);

create index if not exists qa_handbook_questions_category_id_idx on public.qa_handbook_questions(category_id);
create index if not exists qa_questions_category_id_idx on public.qa_questions(category_id);
create index if not exists qa_questions_covered_by_idx on public.qa_questions(covered_by);

create or replace function public.qa_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists qa_handbook_categories_set_updated_at on public.qa_handbook_categories;
create trigger qa_handbook_categories_set_updated_at before update on public.qa_handbook_categories for each row execute function public.qa_set_updated_at();
drop trigger if exists qa_handbook_questions_set_updated_at on public.qa_handbook_questions;
create trigger qa_handbook_questions_set_updated_at before update on public.qa_handbook_questions for each row execute function public.qa_set_updated_at();
drop trigger if exists qa_question_categories_set_updated_at on public.qa_question_categories;
create trigger qa_question_categories_set_updated_at before update on public.qa_question_categories for each row execute function public.qa_set_updated_at();
drop trigger if exists qa_questions_set_updated_at on public.qa_questions;
create trigger qa_questions_set_updated_at before update on public.qa_questions for each row execute function public.qa_set_updated_at();
drop trigger if exists qa_test_known_questions_set_updated_at on public.qa_test_known_questions;
create trigger qa_test_known_questions_set_updated_at before update on public.qa_test_known_questions for each row execute function public.qa_set_updated_at();

-- Одноразово переносимо вміст старих JSON-рядків.
insert into public.qa_handbook_categories (id, name, sort_order, updated_at)
select category.value ->> 'id', category.value ->> 'name', category.ordinality, source.updated_at
from public.qa_handbook_state source
cross join lateral jsonb_array_elements(coalesce(source.state -> 'categories', '[]'::jsonb)) with ordinality category(value, ordinality)
on conflict (id) do update set name = excluded.name, sort_order = excluded.sort_order, updated_at = excluded.updated_at;

insert into public.qa_handbook_questions (id, category_id, question, answer, study_status, sort_order, updated_at)
select md5(source.id || ':' || question.ordinality::text), question.value ->> 'categoryId', question.value ->> 'question', question.value ->> 'answer', coalesce(question.value ->> 'studyStatus', ''), question.ordinality, source.updated_at
from public.qa_handbook_state source
cross join lateral jsonb_array_elements(coalesce(source.state -> 'questions', '[]'::jsonb)) with ordinality question(value, ordinality)
on conflict (id) do update set category_id = excluded.category_id, question = excluded.question, answer = excluded.answer, study_status = excluded.study_status, sort_order = excluded.sort_order, updated_at = excluded.updated_at;

insert into public.qa_question_categories (id, name, source, sort_order, updated_at)
select category.value ->> 'id', category.value ->> 'name', coalesce(category.value ->> 'source', 'handbook'), category.ordinality, source.updated_at
from public.qa_questions_state source
cross join lateral jsonb_array_elements(coalesce(source.state -> 'categories', '[]'::jsonb)) with ordinality category(value, ordinality)
on conflict (id) do update set name = excluded.name, source = excluded.source, sort_order = excluded.sort_order, updated_at = excluded.updated_at;

insert into public.qa_questions (id, category_id, source, question, note, done, covered_by, created_at, sort_order, updated_at)
select coalesce(question.value ->> 'id', md5(source.id || ':' || question.ordinality::text)), question.value ->> 'categoryId', coalesce(question.value ->> 'source', 'manual'), question.value ->> 'question', coalesce(question.value ->> 'note', ''), coalesce((question.value ->> 'done')::boolean, false), nullif(question.value ->> 'coveredBy', ''), nullif(question.value ->> 'createdAt', '')::timestamptz, question.ordinality, source.updated_at
from public.qa_questions_state source
cross join lateral jsonb_array_elements(coalesce(source.state -> 'questions', '[]'::jsonb)) with ordinality question(value, ordinality)
on conflict (id) do update set category_id = excluded.category_id, source = excluded.source, question = excluded.question, note = excluded.note, done = excluded.done, covered_by = excluded.covered_by, created_at = excluded.created_at, sort_order = excluded.sort_order, updated_at = excluded.updated_at;

insert into public.qa_test_known_questions (question_id, known, updated_at)
select known.key, coalesce((known.value #>> '{}')::boolean, false), source.updated_at
from public.qa_test_known_state source
cross join lateral jsonb_each(coalesce(source.state -> 'knownQuestionStatus', '{}'::jsonb)) known(key, value)
on conflict (question_id) do update set known = excluded.known, updated_at = excluded.updated_at;

alter table public.qa_handbook_categories enable row level security;
alter table public.qa_handbook_questions enable row level security;
alter table public.qa_question_categories enable row level security;
alter table public.qa_questions enable row level security;
alter table public.qa_test_known_questions enable row level security;

drop policy if exists "Authenticated users manage handbook categories" on public.qa_handbook_categories;
drop policy if exists "Authenticated users manage handbook questions" on public.qa_handbook_questions;
drop policy if exists "Authenticated users manage question categories" on public.qa_question_categories;
drop policy if exists "Authenticated users manage questions" on public.qa_questions;
drop policy if exists "Authenticated users manage known test questions" on public.qa_test_known_questions;
drop policy if exists "Demo users read handbook categories" on public.qa_handbook_categories;
drop policy if exists "Demo users read handbook questions" on public.qa_handbook_questions;

create policy "Authenticated users manage handbook categories" on public.qa_handbook_categories for all to authenticated using (true) with check (true);
create policy "Authenticated users manage handbook questions" on public.qa_handbook_questions for all to authenticated using (true) with check (true);
create policy "Authenticated users manage question categories" on public.qa_question_categories for all to authenticated using (true) with check (true);
create policy "Authenticated users manage questions" on public.qa_questions for all to authenticated using (true) with check (true);
create policy "Authenticated users manage known test questions" on public.qa_test_known_questions for all to authenticated using (true) with check (true);
create policy "Demo users read handbook categories" on public.qa_handbook_categories for select to anon using (true);
create policy "Demo users read handbook questions" on public.qa_handbook_questions for select to anon using (true);

commit;
