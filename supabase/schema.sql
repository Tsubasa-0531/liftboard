-- Lift Board 独立アプリ版のデータベース定義（Supabase の SQL Editor に貼って Run）
-- 何度実行しても壊れないように書いてある（再実行で関数とポリシーを更新）。
--
-- 設計：アプリの各ドキュメントを jsonb の doc 列に入れ、権限判定に使う列（user_id, team_id）だけを外に出す。
-- Claude版の「members/{uid}」「members/{uid}/months/{月}」「live/{uid}」「exercises/{id}」と1対1に対応する。

create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 40),
  code text not null unique,
  created_by uuid references auth.users on delete set null,
  created_at timestamptz not null default now()
);
create table if not exists public.members (
  user_id uuid primary key references auth.users on delete cascade,
  team_id uuid not null references public.teams on delete cascade,
  doc jsonb not null default '{}',
  updated_at timestamptz not null default now()
);
create table if not exists public.months (
  user_id uuid not null references auth.users on delete cascade,
  month text not null check (month ~ '^\d{4}-\d{2}$'),
  team_id uuid not null references public.teams on delete cascade,
  doc jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, month)
);
create table if not exists public.live (
  user_id uuid primary key references auth.users on delete cascade,
  team_id uuid not null references public.teams on delete cascade,
  doc jsonb not null,
  updated_at timestamptz not null default now()
);
create table if not exists public.exercises (
  id text primary key,
  team_id uuid not null references public.teams on delete cascade,
  created_by uuid default auth.uid() references auth.users on delete set null,
  doc jsonb not null
);
create table if not exists public.push_subs (
  endpoint text primary key,
  user_id uuid not null references auth.users on delete cascade,
  team_id uuid not null references public.teams on delete cascade,
  sub jsonb not null,
  created_at timestamptz not null default now()
);
create table if not exists public.notify_log (
  user_id uuid not null references auth.users on delete cascade,
  kind text not null,
  at timestamptz not null default now(),
  primary key (user_id, kind)
);
-- サーバー専用の設定（通知用の鍵など）。ポリシーを作らないので利用者からは読めない
create table if not exists public.app_secrets (
  name text primary key,
  value text not null
);
create index if not exists members_team on public.members(team_id);
create index if not exists live_team on public.live(team_id);
create index if not exists months_team on public.months(team_id);
create index if not exists push_team on public.push_subs(team_id);

-- 自分の所属チーム（RLSの中で使う。security definer で members のRLSを経由せず引く）
create or replace function public.my_team() returns uuid
language sql stable security definer set search_path = public as $$
  select team_id from public.members where user_id = auth.uid()
$$;

-- チーム作成：招待コード（紛らわしい文字を除いた8文字）を発行し、作成者を参加させる
create or replace function public.create_team(p_name text, p_nick text) returns json
language plpgsql security definer set search_path = public as $$
declare t uuid; c text; alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  loop
    c := '';
    for i in 1..8 loop c := c || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1); end loop;
    exit when not exists (select 1 from teams where code = c);
  end loop;
  insert into teams(name, code, created_by) values (trim(p_name), c, auth.uid()) returning id into t;
  perform public._enter_team(t, p_nick);
  return json_build_object('team_id', t, 'code', c, 'name', trim(p_name));
end $$;

-- チーム参加（別チームから移る場合は自分の記録も一緒に移す）
create or replace function public.join_team(p_code text, p_nick text) returns json
language plpgsql security definer set search_path = public as $$
declare t teams;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select * into t from teams where code = upper(trim(p_code));
  if not found then raise exception 'team code not found'; end if;
  perform public._enter_team(t.id, p_nick);
  return json_build_object('team_id', t.id, 'code', t.code, 'name', t.name);
end $$;

create or replace function public._enter_team(t uuid, p_nick text) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into members(user_id, team_id, doc)
    values (auth.uid(), t, jsonb_build_object('nick', left(trim(coalesce(p_nick, '')), 20),
      'joinedAt', floor(extract(epoch from now()) * 1000), 'v', 1))
  on conflict (user_id) do update
    set team_id = excluded.team_id,
        doc = members.doc || jsonb_build_object('nick', left(trim(coalesce(p_nick, '')), 20));
  update months set team_id = t where user_id = auth.uid();
  update live set team_id = t where user_id = auth.uid();
  update push_subs set team_id = t where user_id = auth.uid();
end $$;
revoke all on function public._enter_team(uuid, text) from public, anon, authenticated;

-- 行レベルセキュリティ：読むのは同じチーム、書くのは自分の行だけ
alter table public.teams enable row level security;
alter table public.members enable row level security;
alter table public.months enable row level security;
alter table public.live enable row level security;
alter table public.exercises enable row level security;
alter table public.push_subs enable row level security;
alter table public.notify_log enable row level security;
alter table public.app_secrets enable row level security;

drop policy if exists teams_read on public.teams;
create policy teams_read on public.teams for select to authenticated using (id = public.my_team());

do $$ declare tb text; begin
  foreach tb in array array['members', 'months', 'live'] loop
    execute format('drop policy if exists %1$s_read on public.%1$s', tb);
    execute format('drop policy if exists %1$s_ins on public.%1$s', tb);
    execute format('drop policy if exists %1$s_upd on public.%1$s', tb);
    execute format('drop policy if exists %1$s_del on public.%1$s', tb);
    execute format('create policy %1$s_read on public.%1$s for select to authenticated using (user_id = auth.uid() or team_id = public.my_team())', tb);
    execute format('create policy %1$s_ins on public.%1$s for insert to authenticated with check (user_id = auth.uid() and team_id = public.my_team())', tb);
    execute format('create policy %1$s_upd on public.%1$s for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid() and team_id = public.my_team())', tb);
    execute format('create policy %1$s_del on public.%1$s for delete to authenticated using (user_id = auth.uid())', tb);
  end loop;
end $$;

drop policy if exists ex_read on public.exercises;
drop policy if exists ex_ins on public.exercises;
drop policy if exists ex_upd on public.exercises;
create policy ex_read on public.exercises for select to authenticated using (team_id = public.my_team());
create policy ex_ins on public.exercises for insert to authenticated with check (team_id = public.my_team());
create policy ex_upd on public.exercises for update to authenticated using (created_by = auth.uid()) with check (team_id = public.my_team());

drop policy if exists push_own on public.push_subs;
create policy push_own on public.push_subs for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and team_id = public.my_team());
-- notify_log はサーバー（Edge Function）専用：ポリシーなし＝利用者からは見えない

-- 表への権限（プロジェクト設定で自動付与をオフにしていても動くように明示する。中身の制限は上のRLS）
grant usage on schema public to authenticated, service_role;
grant select on public.teams to authenticated;
grant select, insert, update, delete on public.members, public.months, public.live, public.exercises, public.push_subs to authenticated;
revoke all on public.app_secrets, public.notify_log from anon, authenticated;
grant all on all tables in schema public to service_role;
grant execute on function public.create_team(text, text), public.join_team(text, text), public.my_team() to authenticated;

-- リアルタイム配信の対象にする
do $$ begin
  begin alter publication supabase_realtime add table public.members; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.live; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.exercises; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.months; exception when duplicate_object then null; end;
end $$;
