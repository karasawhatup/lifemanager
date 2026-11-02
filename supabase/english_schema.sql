-- 英語学習ツールの表。LIFEMANAGER と同じ Supabase プロジェクトに足す。
-- SQL Editor にこのファイルを全部貼って、一度 Run する。
-- 既存の予定・Todo などの表とデータは変更しない。
-- touch_updated_at は schema.sql と同じ内容で置き換えるだけ。
-- 再実行しても落ちない（create if not exists、policy と trigger は作り直す）。
--
-- ボットは service_role で RLS を通る。insert / update では必ず owner_id を入れる。
-- created_by / added_by / answered_by / corrected_by / reviewed_by は
-- app（本人）| tutor（チューター）| writer（ライター）| researcher（リサーチャー）。
-- 日付の列は Asia/Tokyo のカレンダー日。

begin;

create extension if not exists pgcrypto;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.eng_expressions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  term text not null,
  meaning text not null,
  example text,
  tags text[] not null default '{}',
  learned_on date not null default ((timezone('Asia/Tokyo', now()))::date),
  created_by text not null default 'app',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint eng_expressions_term check (char_length(btrim(term)) between 1 and 200),
  constraint eng_expressions_meaning check (char_length(btrim(meaning)) between 1 and 1000),
  constraint eng_expressions_example check (example is null or char_length(example) <= 2000),
  constraint eng_expressions_tags check (cardinality(tags) <= 16),
  constraint eng_expressions_created_by check (created_by in ('app', 'tutor', 'writer', 'researcher'))
);

create index if not exists eng_expressions_owner_date_idx
  on public.eng_expressions (owner_id, learned_on desc, created_at desc);

create table if not exists public.eng_resources (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  url text not null,
  title text not null,
  kind text not null default 'other',
  note text,
  recorded_on date not null default ((timezone('Asia/Tokyo', now()))::date),
  added_by text not null default 'app',
  created_by text not null default 'app',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint eng_resources_url check (
    char_length(btrim(url)) between 1 and 2000
    and btrim(url) ~* '^https?://'
  ),
  constraint eng_resources_title check (char_length(btrim(title)) between 1 and 300),
  constraint eng_resources_kind check (kind in ('article', 'video', 'other')),
  constraint eng_resources_note check (note is null or char_length(note) <= 2000),
  constraint eng_resources_added_by check (added_by in ('app', 'tutor', 'writer', 'researcher')),
  constraint eng_resources_created_by check (created_by in ('app', 'tutor', 'writer', 'researcher'))
);

create index if not exists eng_resources_owner_date_idx
  on public.eng_resources (owner_id, recorded_on desc, created_at desc);

create table if not exists public.eng_questions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  question text not null,
  answer text,
  status text not null default 'open',
  created_by text not null default 'app',
  answered_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint eng_questions_question check (char_length(btrim(question)) between 1 and 4000),
  constraint eng_questions_answer check (answer is null or char_length(answer) <= 8000),
  constraint eng_questions_status check (status in ('open', 'answered')),
  constraint eng_questions_created_by check (created_by in ('app', 'tutor', 'writer', 'researcher')),
  constraint eng_questions_answered_by check (
    answered_by is null or answered_by in ('tutor', 'writer', 'researcher')
  ),
  constraint eng_questions_answer_pair check (
    (status = 'open' and answer is null and answered_by is null)
    or (
      status = 'answered'
      and answer is not null
      and char_length(btrim(answer)) >= 1
      and answered_by is not null
    )
  )
);

create index if not exists eng_questions_owner_status_idx
  on public.eng_questions (owner_id, status, created_at desc);

create table if not exists public.eng_essays (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null default '',
  original_text text not null,
  corrected_text text,
  explanation text,
  status text not null default 'pending',
  created_by text not null default 'app',
  corrected_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint eng_essays_title check (char_length(title) <= 200),
  constraint eng_essays_original check (char_length(btrim(original_text)) between 1 and 8000),
  constraint eng_essays_corrected check (corrected_text is null or char_length(corrected_text) <= 8000),
  constraint eng_essays_explanation check (explanation is null or char_length(explanation) <= 8000),
  constraint eng_essays_status check (status in ('pending', 'corrected')),
  constraint eng_essays_created_by check (created_by in ('app', 'tutor', 'writer', 'researcher')),
  constraint eng_essays_corrected_by check (
    corrected_by is null or corrected_by in ('tutor', 'writer')
  ),
  constraint eng_essays_corrected_pair check (
    (
      status = 'pending'
      and corrected_text is null
      and explanation is null
      and corrected_by is null
    )
    or (
      status = 'corrected'
      and corrected_text is not null
      and char_length(btrim(corrected_text)) >= 1
      and explanation is not null
      and char_length(btrim(explanation)) >= 1
      and corrected_by is not null
    )
  )
);

create index if not exists eng_essays_owner_status_idx
  on public.eng_essays (owner_id, status, created_at desc);

create table if not exists public.eng_assignments (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null,
  instructions text not null,
  due_on date,
  answer text,
  feedback text,
  status text not null default 'assigned',
  created_by text not null default 'tutor',
  reviewed_by text,
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint eng_assignments_title check (char_length(btrim(title)) between 1 and 200),
  constraint eng_assignments_instructions check (char_length(btrim(instructions)) between 1 and 8000),
  constraint eng_assignments_answer check (answer is null or char_length(answer) <= 8000),
  constraint eng_assignments_feedback check (feedback is null or char_length(feedback) <= 8000),
  constraint eng_assignments_status check (status in ('assigned', 'submitted', 'reviewed')),
  constraint eng_assignments_created_by check (created_by in ('app', 'tutor', 'writer', 'researcher')),
  constraint eng_assignments_reviewed_by check (
    reviewed_by is null or reviewed_by in ('tutor', 'writer', 'researcher')
  ),
  constraint eng_assignments_flow check (
    (
      status = 'assigned'
      and answer is null
      and feedback is null
      and reviewed_by is null
      and submitted_at is null
    )
    or (
      status = 'submitted'
      and answer is not null
      and char_length(btrim(answer)) >= 1
      and feedback is null
      and reviewed_by is null
      and submitted_at is not null
    )
    or (
      status = 'reviewed'
      and answer is not null
      and char_length(btrim(answer)) >= 1
      and feedback is not null
      and char_length(btrim(feedback)) >= 1
      and reviewed_by is not null
      and submitted_at is not null
    )
  )
);

create index if not exists eng_assignments_owner_status_idx
  on public.eng_assignments (owner_id, status, due_on);

comment on table public.eng_expressions is '使った表現と単語。learned_on は東京の日付。created_by は app, tutor, writer, researcher。';
comment on table public.eng_resources is '学習に使った記事・動画・その他のURL。added_by が記録した人。';
comment on table public.eng_questions is '文法や表現の質問。open のあいだ answer は null。答えるときは status, answer, answered_by を同時に書く。';
comment on table public.eng_essays is '英作文。pending は未添削。corrected にするときは corrected_text, explanation, corrected_by を同時に書く。説明は日本語。';
comment on table public.eng_assignments is '課題。assigned は未提出。提出で submitted。フィードバックで reviewed。';
comment on column public.eng_resources.kind is 'article, video, other';
comment on column public.eng_questions.status is 'open, answered';
comment on column public.eng_essays.status is 'pending, corrected';
comment on column public.eng_assignments.status is 'assigned, submitted, reviewed';

do $$
declare t text;
begin
  foreach t in array array[
    'eng_expressions', 'eng_resources', 'eng_questions', 'eng_essays', 'eng_assignments'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_owner', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid())',
      t || '_owner',
      t
    );
    execute format('drop trigger if exists %I on public.%I', 'trg_' || t || '_updated', t);
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.touch_updated_at()',
      'trg_' || t || '_updated',
      t
    );
    execute format('revoke all on table public.%I from anon', t);
  end loop;
end $$;

grant select, insert, update, delete on
  public.eng_expressions,
  public.eng_resources,
  public.eng_questions,
  public.eng_essays,
  public.eng_assignments
to authenticated, service_role;

create or replace view public.eng_open_questions
with (security_invoker = true) as
select *
from public.eng_questions
where status = 'open';

create or replace view public.eng_pending_essays
with (security_invoker = true) as
select *
from public.eng_essays
where status = 'pending';

create or replace view public.eng_unsubmitted_assignments
with (security_invoker = true) as
select *
from public.eng_assignments
where status = 'assigned';

create or replace view public.eng_submitted_assignments
with (security_invoker = true) as
select *
from public.eng_assignments
where status = 'submitted';

create or replace view public.eng_today_expressions
with (security_invoker = true) as
select *
from public.eng_expressions
where learned_on = (timezone('Asia/Tokyo', now()))::date;

create or replace view public.eng_today_resources
with (security_invoker = true) as
select *
from public.eng_resources
where recorded_on = (timezone('Asia/Tokyo', now()))::date;

grant select on
  public.eng_open_questions,
  public.eng_pending_essays,
  public.eng_unsubmitted_assignments,
  public.eng_submitted_assignments,
  public.eng_today_expressions,
  public.eng_today_resources
to authenticated, service_role;

revoke all on
  public.eng_open_questions,
  public.eng_pending_essays,
  public.eng_unsubmitted_assignments,
  public.eng_submitted_assignments,
  public.eng_today_expressions,
  public.eng_today_resources
from anon;

comment on view public.eng_open_questions is '未回答の質問。';
comment on view public.eng_pending_essays is '未添削の英作文。';
comment on view public.eng_unsubmitted_assignments is '未提出の課題。';
comment on view public.eng_submitted_assignments is '提出済みでフィードバック待ちの課題。';
comment on view public.eng_today_expressions is '東京の今日の表現メモ。';
comment on view public.eng_today_resources is '東京の今日に記録した教材URL。';

commit;

-- Realtime。失敗しても表は残る。既存の表は触らない。
do $$
declare t text;
begin
  foreach t in array array[
    'eng_expressions', 'eng_resources', 'eng_questions', 'eng_essays', 'eng_assignments'
  ]
  loop
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
exception
  when undefined_object then
    raise notice 'supabase_realtime が無いので、Dashboard の Database > Publications で eng_* の5表を有効にしてください';
end $$;

notify pgrst, 'reload schema';
