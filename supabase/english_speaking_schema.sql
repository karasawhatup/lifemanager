-- 英語の会話と発音の表。LIFEMANAGER と同じ Supabase プロジェクトに足す。
-- SQL Editor にこのファイルを全部貼って、一度 Run する。
-- 既存の予定・英語学習の表と、その中のデータは変更しない。
-- touch_updated_at は schema.sql と同じ内容で置き換えるだけ。
-- 再実行しても落ちない（create if not exists、policy と trigger は作り直す）。
--
-- ボットは service_role で RLS を通る。insert / update では必ず owner_id を入れる。
-- 日付の列 recorded_on は Asia/Tokyo のカレンダー日。started_at は時刻つき。

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

create table if not exists public.eng_speaking_sessions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  scenario text not null,
  topic text not null default '',
  level text not null,
  max_minutes integer not null default 10,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  duration_seconds integer,
  transcript jsonb not null default '[]'::jsonb,
  feedback jsonb,
  model text,
  created_by text not null default 'app',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint eng_speaking_scenario check (
    scenario in ('free_talk', 'daily_life', 'campus_life', 'travel', 'job_interview', 'custom')
  ),
  constraint eng_speaking_topic check (
    char_length(topic) <= 200
    and (scenario <> 'custom' or char_length(btrim(topic)) >= 1)
  ),
  constraint eng_speaking_level check (level in ('a2', 'b1', 'b2')),
  constraint eng_speaking_max_minutes check (max_minutes between 1 and 20),
  constraint eng_speaking_duration check (
    duration_seconds is null or duration_seconds between 0 and 2400
  ),
  constraint eng_speaking_ended check (ended_at is null or ended_at >= started_at),
  constraint eng_speaking_transcript_array check (jsonb_typeof(transcript) = 'array'),
  constraint eng_speaking_transcript_size check (octet_length(transcript::text) <= 200000),
  constraint eng_speaking_feedback_object check (feedback is null or jsonb_typeof(feedback) = 'object'),
  constraint eng_speaking_feedback_size check (feedback is null or octet_length(feedback::text) <= 20000),
  constraint eng_speaking_model check (model is null or char_length(model) <= 80),
  constraint eng_speaking_created_by check (created_by in ('app', 'tutor', 'writer', 'researcher'))
);

create index if not exists eng_speaking_sessions_owner_started_idx
  on public.eng_speaking_sessions (owner_id, started_at desc);

create table if not exists public.eng_pronunciation_attempts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  mode text not null,
  reference_text text,
  recognized_text text not null default '',
  accuracy numeric(5, 2),
  fluency numeric(5, 2),
  completeness numeric(5, 2),
  prosody numeric(5, 2),
  pronunciation numeric(5, 2),
  words jsonb not null default '[]'::jsonb,
  focus text,
  source text not null default 'manual',
  session_id uuid references public.eng_speaking_sessions (id) on delete set null,
  recorded_on date not null default ((timezone('Asia/Tokyo', now()))::date),
  created_by text not null default 'app',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint eng_pronunciation_mode check (mode in ('read_aloud', 'unscripted')),
  constraint eng_pronunciation_reference check (
    (
      mode = 'read_aloud'
      and reference_text is not null
      and char_length(btrim(reference_text)) between 1 and 500
    )
    or (
      mode = 'unscripted'
      and (reference_text is null or char_length(reference_text) <= 500)
    )
  ),
  constraint eng_pronunciation_recognized check (char_length(recognized_text) <= 2000),
  constraint eng_pronunciation_accuracy check (accuracy is null or accuracy between 0 and 100),
  constraint eng_pronunciation_fluency check (fluency is null or fluency between 0 and 100),
  constraint eng_pronunciation_completeness check (completeness is null or completeness between 0 and 100),
  constraint eng_pronunciation_prosody check (prosody is null or prosody between 0 and 100),
  constraint eng_pronunciation_score check (pronunciation is null or pronunciation between 0 and 100),
  constraint eng_pronunciation_words_array check (jsonb_typeof(words) = 'array'),
  constraint eng_pronunciation_words_size check (octet_length(words::text) <= 100000),
  constraint eng_pronunciation_focus check (focus is null or char_length(focus) <= 40),
  constraint eng_pronunciation_source check (source in ('manual', 'conversation')),
  constraint eng_pronunciation_created_by check (created_by in ('app', 'tutor', 'writer', 'researcher'))
);

create index if not exists eng_pronunciation_attempts_owner_date_idx
  on public.eng_pronunciation_attempts (owner_id, recorded_on desc, created_at desc);

create index if not exists eng_pronunciation_attempts_session_idx
  on public.eng_pronunciation_attempts (session_id);

comment on table public.eng_speaking_sessions is '音声会話の記録。transcript は {role,text,at} の配列。feedback は good_points, mistakes, expressions。';
comment on table public.eng_pronunciation_attempts is '発音評価の1回分。words は単語と音素の点数。recorded_on は東京の日付。';
comment on column public.eng_speaking_sessions.scenario is 'free_talk, daily_life, campus_life, travel, job_interview, custom';
comment on column public.eng_speaking_sessions.level is 'a2, b1, b2';
comment on column public.eng_speaking_sessions.transcript is '[{role:user|assistant,text,at}]';
comment on column public.eng_speaking_sessions.feedback is '{good_points:[], mistakes:[{original,correction,note}], expressions:[{term,meaning,example}]}';
comment on column public.eng_pronunciation_attempts.mode is 'read_aloud は台本あり。unscripted は台本なし。';
comment on column public.eng_pronunciation_attempts.words is '[{word,accuracy,error_type,phonemes:[{phoneme,accuracy}]}]';
comment on column public.eng_pronunciation_attempts.source is 'manual か conversation（会話の文を読み直したとき）';

do $$
declare t text;
begin
  foreach t in array array['eng_speaking_sessions', 'eng_pronunciation_attempts']
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
  public.eng_speaking_sessions,
  public.eng_pronunciation_attempts
to authenticated, service_role;

create or replace view public.eng_today_speaking
with (security_invoker = true) as
select *
from public.eng_speaking_sessions
where (timezone('Asia/Tokyo', started_at))::date = (timezone('Asia/Tokyo', now()))::date;

create or replace view public.eng_recent_speaking
with (security_invoker = true) as
select *
from public.eng_speaking_sessions
where started_at >= (timezone('Asia/Tokyo', now()) - interval '14 days');

create or replace view public.eng_today_pronunciation
with (security_invoker = true) as
select *
from public.eng_pronunciation_attempts
where recorded_on = (timezone('Asia/Tokyo', now()))::date;

create or replace view public.eng_recent_pronunciation
with (security_invoker = true) as
select *
from public.eng_pronunciation_attempts
where recorded_on >= ((timezone('Asia/Tokyo', now()))::date - 30);

grant select on
  public.eng_today_speaking,
  public.eng_recent_speaking,
  public.eng_today_pronunciation,
  public.eng_recent_pronunciation
to authenticated, service_role;

revoke all on
  public.eng_today_speaking,
  public.eng_recent_speaking,
  public.eng_today_pronunciation,
  public.eng_recent_pronunciation
from anon;

comment on view public.eng_today_speaking is '東京の今日の会話。';
comment on view public.eng_recent_speaking is '過去14日の会話。';
comment on view public.eng_today_pronunciation is '東京の今日の発音評価。';
comment on view public.eng_recent_pronunciation is '過去30日の発音評価。';

commit;

-- Realtime。失敗しても表は残る。既存の表は触らない。
do $$
declare t text;
begin
  foreach t in array array['eng_speaking_sessions', 'eng_pronunciation_attempts']
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
    raise notice 'supabase_realtime が無いので、Dashboard の Database > Publications で eng_speaking_sessions と eng_pronunciation_attempts を有効にしてください';
end $$;

notify pgrst, 'reload schema';
