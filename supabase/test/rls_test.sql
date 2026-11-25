-- ローカルPostgresで RLS を検証するテスト（Supabaseの auth を最小限スタブ化）
\set ON_ERROR_STOP 1
do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
create schema auth;
create table if not exists auth.users(id uuid primary key);
do $$ begin create role service_role nologin bypassrls; exception when duplicate_object then null; end $$;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create publication supabase_realtime;
grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;
\i supabase/schema.sql
\i supabase/schema.sql
grant usage on schema public to authenticated;
insert into auth.users values ('00000000-0000-0000-0000-00000000000a'), ('00000000-0000-0000-0000-00000000000b'), ('00000000-0000-0000-0000-00000000000c');

create function pg_temp.as_user(u text) returns void language plpgsql as $$ begin perform set_config('request.jwt.claim.sub', u, false); end $$;
\set ON_ERROR_STOP 0
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select (create_team('Keio', 'ツバサ')->>'code') as code \gset
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select join_team(:'code', 'ケンタ') is not null as b_joined;
select join_team('WRONGCODE', 'x');                        -- 期待：エラー team code not found
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
select create_team('Other', 'よそ') is not null as c_created;

select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
insert into months(user_id, month, team_id, doc) values (auth.uid(), '2026-11', my_team(), '{"sessions":{}}');
insert into live(user_id, team_id, doc) values (auth.uid(), my_team(), '{"active":true}');
insert into months(user_id, month, team_id, doc) values ('00000000-0000-0000-0000-00000000000b', '2026-11', my_team(), '{}');  -- 期待：RLS違反
update members set doc = '{"nick":"乗っ取り"}' where user_id = '00000000-0000-0000-0000-00000000000b';                        -- 期待：0行
insert into teams(name, code) values ('x', 'y');                                                                                -- 期待：RLS違反
select _enter_team(my_team(), 'x');                                                                                              -- 期待：権限なし

select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select 'B sees team members' as t, count(*) from members;          -- 期待 2
select 'B sees A months' as t, count(*) from months;               -- 期待 1
select 'B sees A live' as t, count(*) from live;                   -- 期待 1
select 'B sees teams' as t, count(*) from teams;                   -- 期待 1
select 'B sees notify_log' as t, count(*) from notify_log;         -- 期待 0
select 'B sees app_secrets' as t, count(*) from app_secrets;       -- 期待 0
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
select 'C sees members' as t, count(*) from members;               -- 期待 1（自分だけ）
select 'C sees months' as t, count(*) from months;                 -- 期待 0
select 'C sees live' as t, count(*) from live;                     -- 期待 0
insert into exercises(id, team_id, doc) values ('c_x', my_team(), '{"name":"x"}');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select 'A sees C exercise' as t, count(*) from exercises;          -- 期待 0
-- A がCのチームへ移籍 → A の記録も移り、Bからは見えなくなる
reset role; select code as ccode from teams where name = 'Other' \gset
set role authenticated; select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select join_team(:'ccode', 'ツバサ') is not null as a_moved;
select 'A still sees own months' as t, count(*) from months;       -- 期待 1
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select 'B sees A months after move' as t, count(*) from months;    -- 期待 0
