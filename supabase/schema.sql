-- Run once in the Supabase SQL editor for Fagiolo Heist.
grant usage on schema public to anon, authenticated;

create table if not exists public.player_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique check (username ~ '^[A-Za-z0-9_]{3,18}$'),
  created_at timestamptz not null default now()
);

alter table public.player_profiles enable row level security;
drop policy if exists "Usernames are public for the leaderboard" on public.player_profiles;
drop policy if exists "Players can update their own profile" on public.player_profiles;

create or replace function public.create_player_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_username text;
begin
  requested_username := coalesce(new.raw_user_meta_data ->> 'username', split_part(new.email, '@', 1));
  requested_username := regexp_replace(requested_username, '[^A-Za-z0-9_]', '', 'g');
  requested_username := left(requested_username, 18);
  if length(requested_username) < 3 then
    requested_username := 'Bean' || left(replace(new.id::text, '-', ''), 8);
  end if;
  insert into public.player_profiles (user_id, username)
  values (new.id, requested_username)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_fagiolo on auth.users;
create trigger on_auth_user_created_fagiolo
  after insert on auth.users
  for each row execute procedure public.create_player_profile();

create table if not exists public.leaderboard_entries (
  user_id uuid not null references auth.users (id) on delete cascade,
  level smallint not null check (level between 1 and 3),
  score integer not null check (score between 500 and 3200),
  beans_collected smallint not null check (beans_collected between 0 and 22),
  total_beans smallint not null check (total_beans = 22),
  completion_time_ms integer not null check (completion_time_ms between 1 and 60000),
  updated_at timestamptz not null default now(),
  primary key (user_id, level),
  check (beans_collected <= total_beans)
);

alter table public.leaderboard_entries enable row level security;
drop policy if exists "Completed runs are public" on public.leaderboard_entries;
create index if not exists leaderboard_entries_level_rank
  on public.leaderboard_entries (level, score desc, beans_collected desc, completion_time_ms asc);

create or replace view public.leaderboard_public
with (security_barrier = true, security_invoker = false)
as
  select e.level, p.username, e.score, e.beans_collected, e.total_beans,
         e.completion_time_ms, e.updated_at
  from public.leaderboard_entries e
  join public.player_profiles p on p.user_id = e.user_id;

create or replace function public.submit_level_score(
  p_level integer,
  p_score integer,
  p_beans_collected integer,
  p_total_beans integer,
  p_completion_time_ms integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  player_id uuid := auth.uid();
  changed_rows integer;
begin
  if player_id is null then raise exception 'Sign in to submit a score.'; end if;
  if p_level not between 1 and 3 then raise exception 'Invalid level.'; end if;
  if p_total_beans <> 22 or p_beans_collected not between 0 and p_total_beans then
    raise exception 'Invalid bean count.';
  end if;
  if p_score <> 500 + (p_beans_collected * 100) + case when p_beans_collected >= 15 then 500 else 0 end then
    raise exception 'Score does not match the level reward rules.';
  end if;
  if p_completion_time_ms not between 1 and 60000 then raise exception 'Invalid completion time.'; end if;

  insert into public.leaderboard_entries (
    user_id, level, score, beans_collected, total_beans, completion_time_ms, updated_at
  ) values (
    player_id, p_level, p_score, p_beans_collected, p_total_beans, p_completion_time_ms, now()
  )
  on conflict (user_id, level) do update set
    score = excluded.score,
    beans_collected = excluded.beans_collected,
    total_beans = excluded.total_beans,
    completion_time_ms = excluded.completion_time_ms,
    updated_at = now()
  where excluded.score > leaderboard_entries.score
     or (excluded.score = leaderboard_entries.score and excluded.beans_collected > leaderboard_entries.beans_collected)
     or (excluded.score = leaderboard_entries.score and excluded.beans_collected = leaderboard_entries.beans_collected
         and excluded.completion_time_ms < leaderboard_entries.completion_time_ms);
  get diagnostics changed_rows = row_count;
  return changed_rows > 0;
end;
$$;

revoke all on function public.submit_level_score(integer, integer, integer, integer, integer) from public;
grant execute on function public.submit_level_score(integer, integer, integer, integer, integer) to authenticated;
grant select on public.leaderboard_public to anon, authenticated;
revoke all on public.leaderboard_entries from anon, authenticated;
revoke all on public.player_profiles from anon, authenticated;

notify pgrst, 'reload schema';

