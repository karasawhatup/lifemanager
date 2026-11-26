-- MCP 用の個人トークン。LIFEMANAGER の設定画面から発行する。
-- SQL Editor にこのファイルを全部貼って、一度 Run する。
-- 再実行しても、既にあるトークンは消えない。
--
-- 生のトークンは保存しない。SHA-256 の16進だけを置く。
-- 外部の AI にはこの表のハッシュを見せない。service_role もクライアントに渡さない。
-- Edge Function だけが service_role でハッシュを引き、その行の owner_id として読み書きする。

begin;

create table if not exists public.mcp_access_tokens (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  label text not null,
  token_prefix text not null,
  token_hash text not null,
  scope text not null,
  audience text,
  issued_via text not null default 'app',
  revoked_at timestamptz,
  last_used_at timestamptz,
  window_started_at timestamptz,
  window_count integer not null default 0,
  created_at timestamptz not null default now(),
  constraint mcp_access_tokens_label check (char_length(btrim(label)) between 1 and 80),
  constraint mcp_access_tokens_prefix check (char_length(token_prefix) between 8 and 32),
  constraint mcp_access_tokens_hash check (token_hash ~ '^[0-9a-f]{64}$'),
  constraint mcp_access_tokens_scope check (scope in ('read', 'write')),
  constraint mcp_access_tokens_audience check (audience is null or char_length(audience) between 8 and 300),
  constraint mcp_access_tokens_via check (issued_via in ('app', 'oauth')),
  constraint mcp_access_tokens_window check (window_count between 0 and 100000),
  constraint mcp_access_tokens_hash_key unique (token_hash)
);

create index if not exists mcp_access_tokens_owner_idx
  on public.mcp_access_tokens (owner_id, created_at desc);

create table if not exists public.mcp_oauth_clients (
  client_id text primary key,
  redirect_uris text[] not null,
  client_name text,
  created_at timestamptz not null default now(),
  constraint mcp_oauth_clients_id check (char_length(client_id) between 8 and 200),
  constraint mcp_oauth_clients_uris check (cardinality(redirect_uris) between 1 and 8),
  constraint mcp_oauth_clients_name check (client_name is null or char_length(client_name) <= 80)
);

create table if not exists public.mcp_oauth_codes (
  code_hash text primary key,
  owner_id uuid not null references auth.users (id) on delete cascade,
  client_id text not null,
  redirect_uri text not null,
  scope text not null,
  label text not null,
  code_challenge text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now(),
  constraint mcp_oauth_codes_hash check (code_hash ~ '^[0-9a-f]{64}$'),
  constraint mcp_oauth_codes_scope check (scope in ('read', 'write')),
  constraint mcp_oauth_codes_label check (char_length(btrim(label)) between 1 and 80),
  constraint mcp_oauth_codes_challenge check (char_length(code_challenge) between 43 and 128),
  constraint mcp_oauth_codes_redirect check (char_length(redirect_uri) between 8 and 300)
);

create table if not exists public.mcp_oauth_refresh (
  token_hash text primary key,
  access_token_id uuid not null references public.mcp_access_tokens (id) on delete cascade,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint mcp_oauth_refresh_hash check (token_hash ~ '^[0-9a-f]{64}$')
);

create index if not exists mcp_oauth_refresh_access_idx
  on public.mcp_oauth_refresh (access_token_id);

comment on table public.mcp_access_tokens is 'MCP の個人トークン。token_hash は SHA-256 の16進。生のトークンは置かない。scope は read か write。';
comment on column public.mcp_access_tokens.token_prefix is '画面に出す先頭12文字。秘密の全体ではない。';
comment on column public.mcp_access_tokens.scope is 'read は参照だけ。write は追加・更新・削除もできる。';
comment on column public.mcp_access_tokens.issued_via is 'app は設定画面。oauth は Claude / ChatGPT の接続画面。';
comment on table public.mcp_oauth_clients is 'OAuth の公開クライアント。秘密は持たない。PKCE を必須にする。';
comment on table public.mcp_oauth_codes is '認可コードのハッシュ。数分で失効し、一度しか使えない。';
comment on table public.mcp_oauth_refresh is 'リフレッシュトークンのハッシュ。生の値は置かない。';

-- 本人がラベルやハッシュや権限を後から書き換えられないようにする。
-- 取り消しは一度だけ。service_role の回数カウント更新は通す。
create or replace function public.mcp_tokens_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.token_hash is distinct from old.token_hash
     or new.owner_id is distinct from old.owner_id
     or new.scope is distinct from old.scope
     or new.label is distinct from old.label
     or new.token_prefix is distinct from old.token_prefix
     or new.issued_via is distinct from old.issued_via
     or new.audience is distinct from old.audience
     or new.created_at is distinct from old.created_at
     or new.id is distinct from old.id
  then
    raise exception 'mcp token fields are immutable';
  end if;
  if old.revoked_at is not null and new.revoked_at is distinct from old.revoked_at then
    raise exception 'revoked tokens stay revoked';
  end if;
  return new;
end;
$$;

revoke all on function public.mcp_tokens_guard() from public, anon, authenticated;

drop trigger if exists trg_mcp_access_tokens_guard on public.mcp_access_tokens;
create trigger trg_mcp_access_tokens_guard
  before update on public.mcp_access_tokens
  for each row execute function public.mcp_tokens_guard();

alter table public.mcp_access_tokens enable row level security;
alter table public.mcp_access_tokens force row level security;
alter table public.mcp_oauth_clients enable row level security;
alter table public.mcp_oauth_clients force row level security;
alter table public.mcp_oauth_codes enable row level security;
alter table public.mcp_oauth_codes force row level security;
alter table public.mcp_oauth_refresh enable row level security;
alter table public.mcp_oauth_refresh force row level security;

drop policy if exists mcp_access_tokens_owner_select on public.mcp_access_tokens;
create policy mcp_access_tokens_owner_select
  on public.mcp_access_tokens
  for select
  to authenticated
  using (owner_id = auth.uid());

drop policy if exists mcp_access_tokens_owner_insert on public.mcp_access_tokens;
create policy mcp_access_tokens_owner_insert
  on public.mcp_access_tokens
  for insert
  to authenticated
  with check (owner_id = auth.uid());

drop policy if exists mcp_access_tokens_owner_update on public.mcp_access_tokens;
create policy mcp_access_tokens_owner_update
  on public.mcp_access_tokens
  for update
  to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

revoke all on table public.mcp_access_tokens from anon, authenticated;
revoke all on table public.mcp_oauth_clients from anon, authenticated;
revoke all on table public.mcp_oauth_codes from anon, authenticated;
revoke all on table public.mcp_oauth_refresh from anon, authenticated;

grant select (
  id, label, token_prefix, scope, issued_via, revoked_at, last_used_at, created_at
) on public.mcp_access_tokens to authenticated;

grant insert (
  owner_id, label, token_prefix, token_hash, scope
) on public.mcp_access_tokens to authenticated;

grant update (revoked_at) on public.mcp_access_tokens to authenticated;

grant select, insert, update, delete on
  public.mcp_access_tokens,
  public.mcp_oauth_clients,
  public.mcp_oauth_codes,
  public.mcp_oauth_refresh
to service_role;

commit;

notify pgrst, 'reload schema';
