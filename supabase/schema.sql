-- LIFEMANAGER schema
-- 一人用。アプリは anon key + その人のログインで読み書きする。
-- ボットは service_role キーを使い、RLS を迂回する。insert では必ず owner_id を入れる。
-- 日付は Asia/Tokyo のカレンダー日。時刻は 10 分単位。終わりだけ 24:00:00 を許す。
-- SQL Editor にこのファイルを全部貼って、一度だけ Run する。

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

create table public.schedule_blocks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date date not null,
  start_time time(0) not null,
  end_time time(0) not null,
  title text not null,
  category text not null,
  status text not null default 'planned',
  notes text,
  source text not null default 'app',
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint schedule_blocks_title check (char_length(btrim(title)) between 1 and 500),
  constraint schedule_blocks_category check (
    category in (
      'prep', 'class', 'club', 'travel', 'meal', 'bath', 'laundry',
      'english', 'moodle', 'todo', 'wish', 'free', 'buffer'
    )
  ),
  constraint schedule_blocks_status check (status in ('planned', 'done', 'skipped')),
  constraint schedule_blocks_source check (source in ('app', 'bot')),
  constraint schedule_blocks_order check (end_time > start_time),
  constraint schedule_blocks_ten_min check (
    start_time < time '24:00'
    and extract(minute from start_time)::int % 10 = 0
    and extract(second from start_time)::int = 0
    and extract(minute from end_time)::int % 10 = 0
    and extract(second from end_time)::int = 0
  )
);

create index schedule_blocks_owner_date_idx
  on public.schedule_blocks (owner_id, date, start_time);

create table public.todos (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null,
  rank text not null,
  due_date date,
  estimated_minutes integer,
  status text not null default 'open',
  notes text,
  source text not null default 'app',
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint todos_title check (char_length(btrim(title)) between 1 and 500),
  constraint todos_rank check (rank in ('A', 'B', 'C')),
  constraint todos_status check (status in ('open', 'done')),
  constraint todos_source check (source in ('app', 'bot')),
  constraint todos_minutes check (
    estimated_minutes is null
    or (estimated_minutes between 10 and 600 and estimated_minutes % 10 = 0)
  )
);

create index todos_owner_rank_idx on public.todos (owner_id, rank, status);

create table public.wishes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null,
  category text not null default 'other',
  notes text,
  done boolean not null default false,
  source text not null default 'app',
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint wishes_title check (char_length(btrim(title)) between 1 and 500),
  constraint wishes_category check (
    category in ('restaurant', 'karaoke', 'game', 'shopping', 'outing', 'other')
  ),
  constraint wishes_source check (source in ('app', 'bot'))
);

create index wishes_owner_done_idx on public.wishes (owner_id, done);

create table public.wake_sleep_logs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  type text not null,
  logged_at timestamptz not null,
  notes text,
  source text not null default 'app',
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint wake_sleep_logs_type check (type in ('wake', 'sleep')),
  constraint wake_sleep_logs_source check (source in ('app', 'bot'))
);

create index wake_sleep_logs_owner_time_idx
  on public.wake_sleep_logs (owner_id, logged_at desc);

create table public.change_requests (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  body text not null,
  status text not null default 'open',
  bot_response text,
  source text not null default 'app',
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint change_requests_body check (char_length(btrim(body)) between 1 and 4000),
  constraint change_requests_status check (status in ('open', 'handled')),
  constraint change_requests_source check (source in ('app', 'bot'))
);

create index change_requests_owner_status_idx
  on public.change_requests (owner_id, status, created_at desc);

create table public.travel_times (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  from_place text not null,
  to_place text not null,
  minutes integer not null,
  notes text,
  source text not null default 'app',
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint travel_times_places check (
    char_length(btrim(from_place)) between 1 and 80
    and char_length(btrim(to_place)) between 1 and 80
    and btrim(from_place) <> btrim(to_place)
  ),
  constraint travel_times_minutes check (minutes between 1 and 1440),
  constraint travel_times_source check (source in ('app', 'bot')),
  constraint travel_times_route unique (owner_id, from_place, to_place)
);

create index travel_times_owner_idx on public.travel_times (owner_id);

create table public.settings (
  owner_id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default 'XOLDA',
  timezone text not null default 'Asia/Tokyo',
  buffer_minutes_per_day integer not null default 120,
  prep_minutes integer not null default 40,
  english_minutes_per_day integer not null default 60,
  meal_minutes integer not null default 40,
  bath_minutes integer not null default 30,
  laundry_interval_days integer not null default 3,
  day_length_hours integer not null default 16,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint settings_name check (char_length(btrim(display_name)) between 1 and 40),
  constraint settings_buffer check (buffer_minutes_per_day between 0 and 1440),
  constraint settings_prep check (prep_minutes between 0 and 600),
  constraint settings_english check (english_minutes_per_day between 0 and 600),
  constraint settings_meal check (meal_minutes between 0 and 300),
  constraint settings_bath check (bath_minutes between 0 and 300),
  constraint settings_laundry check (laundry_interval_days between 1 and 30),
  constraint settings_day_length check (day_length_hours between 8 and 24)
);

comment on table public.schedule_blocks is '1日の予定。date は東京の日付。start/end は10分単位。';
comment on column public.schedule_blocks.category is 'prep, class, club, travel, meal, bath, laundry, english, moodle, todo, wish, free, buffer';
comment on column public.schedule_blocks.status is 'planned, done, skipped';
comment on column public.schedule_blocks.source is 'app または bot';
comment on table public.todos is 'やること。rank は A が最も緊急。';
comment on table public.wishes is '小さなやりたいこと。全部を予定に入れる必要はない。';
comment on table public.wake_sleep_logs is '起床と就寝の記録。同じ日に複数あっても、現在以前で最も遅い wake をその日の起床とする。';
comment on table public.change_requests is '本人からの予定変更の要望。ボットは open を読み、bot_response を書いて status を handled にする。';
comment on table public.travel_times is '場所から場所への分数。from_place / to_place。';
comment on table public.settings is 'ボットが予定を組むときに読む数字。timezone は Asia/Tokyo。';

do $$
declare t text;
begin
  foreach t in array array[
    'schedule_blocks', 'todos', 'wishes', 'wake_sleep_logs',
    'change_requests', 'travel_times', 'settings'
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
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.touch_updated_at()',
      'trg_' || t || '_updated',
      t
    );
    execute format('revoke all on table public.%I from anon', t);
  end loop;
end $$;

grant select, insert, update, delete on
  public.schedule_blocks,
  public.todos,
  public.wishes,
  public.wake_sleep_logs,
  public.change_requests,
  public.travel_times,
  public.settings
to authenticated, service_role;

-- ボット向けの短い入口。元テーブルの RLS を継承する。
create view public.today_blocks
with (security_invoker = true) as
select *
from public.schedule_blocks
where date = (timezone('Asia/Tokyo', now()))::date;

create view public.today_wake_sleep
with (security_invoker = true) as
select *
from public.wake_sleep_logs
where (timezone('Asia/Tokyo', logged_at))::date = (timezone('Asia/Tokyo', now()))::date;

create view public.open_change_requests
with (security_invoker = true) as
select *
from public.change_requests
where status = 'open';

create view public.open_todos
with (security_invoker = true) as
select *
from public.todos
where status = 'open';

grant select on
  public.today_blocks,
  public.today_wake_sleep,
  public.open_change_requests,
  public.open_todos
to authenticated, service_role;

revoke all on
  public.today_blocks,
  public.today_wake_sleep,
  public.open_change_requests,
  public.open_todos
from anon;

comment on view public.today_blocks is '東京の今日の予定。';
comment on view public.open_change_requests is '未対応の修正要望。';

commit;

-- Realtime。失敗してもテーブル自体は残る。
do $$
declare t text;
begin
  foreach t in array array[
    'schedule_blocks', 'todos', 'wishes', 'wake_sleep_logs',
    'change_requests', 'travel_times', 'settings'
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
    raise notice 'supabase_realtime が無いので、Dashboard の Database > Publications で各テーブルを有効にしてください';
end $$;
