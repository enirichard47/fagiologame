-- Run once in the Supabase SQL editor for Fagiolo Heist.
grant usage on schema public to anon, authenticated;

create table if not exists public.player_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique check (username ~ '^[A-Za-z0-9_]{3,18}$'),
  account_username text not null unique check (account_username ~ '^[a-z0-9_]{3,32}$'),
  telegram_username text,
  created_at timestamptz not null default now()
);

alter table public.player_profiles add column if not exists telegram_username text;
alter table public.player_profiles add column if not exists account_username text;

-- Existing players receive their current in-game name as their initial login
-- username. Telegram handles are not used as account credentials.
with candidates as (
  select p.user_id,
         lower(p.username) as account_name,
         row_number() over (
           partition by lower(p.username)
           order by p.created_at, p.user_id
         ) as duplicate_rank
  from public.player_profiles p
  where p.account_username is null
)
update public.player_profiles p
set account_username = case when c.duplicate_rank = 1 then c.account_name else 'player_' || left(replace(p.user_id::text, '-', ''), 12) end
from candidates c
where c.user_id = p.user_id;
create unique index if not exists player_profiles_account_username_key on public.player_profiles (account_username);
alter table public.player_profiles alter column account_username set not null;

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
  requested_account_username text;
  requested_telegram_username text;
begin
  requested_username := coalesce(new.raw_user_meta_data ->> 'username', '');
  requested_username := regexp_replace(requested_username, '[^A-Za-z0-9_]', '', 'g');
  requested_username := left(requested_username, 18);
  if length(requested_username) < 3 then
    requested_username := 'Bean' || left(replace(new.id::text, '-', ''), 8);
  end if;
  requested_account_username := lower(regexp_replace(coalesce(new.raw_user_meta_data ->> 'login_username', ''), '[^A-Za-z0-9_]', '', 'g'));
  requested_account_username := left(requested_account_username, 32);
  if length(requested_account_username) < 3 then requested_account_username := lower(requested_username); end if;
  requested_telegram_username := lower(regexp_replace(coalesce(new.raw_user_meta_data ->> 'telegram_username', ''), '^@', ''));
  if requested_telegram_username !~ '^[a-z0-9_]{5,32}$' then requested_telegram_username := null; end if;
  insert into public.player_profiles (user_id, username, account_username, telegram_username)
  values (new.id, requested_username, requested_account_username, requested_telegram_username)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_fagiolo on auth.users;
create trigger on_auth_user_created_fagiolo
  after insert on auth.users
  for each row execute procedure public.create_player_profile();

-- Remove the old Telegram-based credential field after the replacement profile
-- trigger is installed. Existing login names were migrated from public names above.
alter table public.player_profiles drop column if exists login_username;

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

-- Older clients accidentally saved the timer's sub-second tick accumulator.
-- Mark those times as unknown (60s sentinel) so new valid runs can replace them.
update public.leaderboard_entries set completion_time_ms = 60000 where completion_time_ms < 1000;

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
  expected_score integer;
begin
  if player_id is null then raise exception 'Sign in to submit a score.'; end if;
  if p_level not between 1 and 3 then raise exception 'Invalid level.'; end if;
  if p_total_beans <> 22 or p_beans_collected not between 0 and p_total_beans then
    raise exception 'Invalid bean count.';
  end if;
  expected_score := 500 + (p_beans_collected * 100);
  if p_beans_collected >= 15 then expected_score := expected_score + 500; end if;
  if p_score <> expected_score then
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
grant select on public.player_profiles to service_role;

-- Private prize claims and administrator tools. Add trusted administrators to
-- game_admins from the SQL editor; never grant admin access from browser data.
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create table if not exists public.game_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.game_admins enable row level security;
revoke all on public.game_admins from anon, authenticated;
grant select on public.game_admins to service_role;

create table if not exists public.prize_claims (
  user_id uuid not null references auth.users (id) on delete cascade,
  level smallint not null check (level between 1 and 3),
  status text not null default 'eligible' check (status in ('eligible', 'code_issued', 'redeemed', 'revoked')),
  code_hash text,
  code_issued_at timestamptz,
  code_expires_at timestamptz,
  redeemed_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (user_id, level)
);
alter table public.prize_claims enable row level security;
revoke all on public.prize_claims from anon, authenticated;

create or replace function public.is_fagiolo_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.game_admins where user_id = auth.uid());
$$;

create or replace function public.get_my_profile()
returns table (username text, telegram_username text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.username, p.telegram_username
  from public.player_profiles p
  where p.user_id = auth.uid();
$$;

create or replace function public.update_my_telegram_username(p_telegram_username text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  cleaned text := lower(regexp_replace(trim(coalesce(p_telegram_username, '')), '^@', ''));
begin
  if auth.uid() is null then raise exception 'Sign in to update your account.'; end if;
  if cleaned !~ '^[a-z0-9_]{5,32}$' then
    raise exception 'Enter a Telegram username with 5–32 letters, numbers, or underscores.';
  end if;
  update public.player_profiles set telegram_username = cleaned where user_id = auth.uid();
  if not found then raise exception 'Player profile was not found.'; end if;
  return cleaned;
end;
$$;

create or replace function public.get_my_prize_claims()
returns table (level smallint, status text, code_expires_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select c.level, c.status, c.code_expires_at
  from public.prize_claims c
  where c.user_id = auth.uid() and c.status <> 'revoked'
  order by c.level;
$$;

create or replace function public.request_prize_claim(p_level integer)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  player_id uuid := auth.uid();
  claim_status text;
  claim_code text := upper(replace(gen_random_uuid()::text, '-', ''));
begin
  if player_id is null then raise exception 'Sign in to claim a prize.'; end if;
  if p_level not between 1 and 3 then raise exception 'Invalid level.'; end if;
  if not exists (select 1 from public.player_profiles p where p.user_id = player_id and p.telegram_username is not null) then
    raise exception 'Add your Telegram username to your account before requesting a claim code.';
  end if;
  select c.status into claim_status from public.prize_claims c
    where c.user_id = player_id and c.level = p_level for update;
  if claim_status is null then raise exception 'This account is not marked as a prize winner.'; end if;
  if claim_status in ('redeemed', 'revoked') then raise exception 'This prize claim is no longer available.'; end if;
  update public.prize_claims
    set status = 'code_issued',
        code_hash = encode(extensions.digest(convert_to(lower(claim_code), 'UTF8'), 'sha256'), 'hex'),
        code_issued_at = now(),
        code_expires_at = now() + interval '24 hours'
    where user_id = player_id and level = p_level;
  return claim_code;
end;
$$;

create or replace function public.admin_leaderboard_for_level(p_level integer)
returns table (
  player_id uuid, username text, telegram_username text, score integer,
  beans_collected smallint, total_beans smallint, completion_time_ms integer,
  is_winner boolean, claim_status text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_fagiolo_admin() then raise exception 'Administrator access required.'; end if;
  if p_level not between 1 and 3 then raise exception 'Invalid level.'; end if;
  return query
    select e.user_id, p.username, p.telegram_username, e.score, e.beans_collected,
           e.total_beans, e.completion_time_ms,
           coalesce(c.status in ('eligible', 'code_issued', 'redeemed'), false), c.status
    from public.leaderboard_entries e
    join public.player_profiles p on p.user_id = e.user_id
    left join public.prize_claims c on c.user_id = e.user_id and c.level = e.level
    where e.level = p_level
    order by e.score desc, e.beans_collected desc, e.completion_time_ms asc
    limit 20;
end;
$$;

create or replace function public.admin_set_prize_winner(p_user_id uuid, p_level integer, p_is_winner boolean)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_status text;
begin
  if not public.is_fagiolo_admin() then raise exception 'Administrator access required.'; end if;
  if p_level not between 1 and 3 then raise exception 'Invalid level.'; end if;
  if p_is_winner then
    if not exists (select 1 from public.leaderboard_entries e where e.user_id = p_user_id and e.level = p_level) then
      raise exception 'That player has no completed leaderboard entry for this level.';
    end if;
    insert into public.prize_claims as existing_claim (user_id, level, status)
    values (p_user_id, p_level, 'eligible')
    on conflict (user_id, level) do update set
      status = case when existing_claim.redeemed_at is null then 'eligible' else existing_claim.status end,
      code_hash = case when existing_claim.redeemed_at is null then null else existing_claim.code_hash end,
      code_issued_at = case when existing_claim.redeemed_at is null then null else existing_claim.code_issued_at end,
      code_expires_at = case when existing_claim.redeemed_at is null then null else existing_claim.code_expires_at end;
  else
    select c.status into current_status from public.prize_claims c where c.user_id = p_user_id and c.level = p_level;
    if current_status = 'redeemed' then raise exception 'A redeemed prize cannot be revoked here.'; end if;
    update public.prize_claims set status = 'revoked', code_hash = null, code_expires_at = null
      where user_id = p_user_id and level = p_level;
  end if;
  return true;
end;
$$;

create or replace function public.admin_list_prize_claims()
returns table (
  player_id uuid, level smallint, username text, telegram_username text,
  score integer, beans_collected smallint, status text,
  code_expires_at timestamptz, redeemed_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_fagiolo_admin() then raise exception 'Administrator access required.'; end if;
  return query
    select c.user_id, c.level, p.username, p.telegram_username,
           e.score, e.beans_collected, c.status, c.code_expires_at, c.redeemed_at
    from public.prize_claims c
    join public.player_profiles p on p.user_id = c.user_id
    left join public.leaderboard_entries e on e.user_id = c.user_id and e.level = c.level
    where c.status <> 'revoked'
    order by c.created_at desc;
end;
$$;

create or replace function public.admin_redeem_prize_claim(p_code text)
returns table (username text, telegram_username text, level smallint, score integer, beans_collected smallint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_code text := lower(regexp_replace(trim(coalesce(p_code, '')), '[^A-Fa-f0-9]', '', 'g'));
  found_user uuid;
  found_level smallint;
begin
  if not public.is_fagiolo_admin() then raise exception 'Administrator access required.'; end if;
  if length(normalized_code) <> 32 then raise exception 'Claim code is invalid, expired, or already used.'; end if;
  select c.user_id, c.level into found_user, found_level
  from public.prize_claims c
  where c.code_hash = encode(extensions.digest(convert_to(normalized_code, 'UTF8'), 'sha256'), 'hex')
    and c.status = 'code_issued' and c.code_expires_at > now()
  for update;
  if found_user is null then raise exception 'Claim code is invalid, expired, or already used.'; end if;
  update public.prize_claims set status = 'redeemed', redeemed_at = now(), code_hash = null
    where user_id = found_user and level = found_level;
  return query
    select p.username, p.telegram_username, e.level, e.score, e.beans_collected
    from public.player_profiles p
    join public.leaderboard_entries e on e.user_id = p.user_id and e.level = found_level
    where p.user_id = found_user;
end;
$$;

revoke all on function public.is_fagiolo_admin() from public;
revoke all on function public.get_my_profile() from public;
revoke all on function public.update_my_telegram_username(text) from public;
revoke all on function public.get_my_prize_claims() from public;
revoke all on function public.request_prize_claim(integer) from public;
revoke all on function public.admin_leaderboard_for_level(integer) from public;
revoke all on function public.admin_set_prize_winner(uuid, integer, boolean) from public;
revoke all on function public.admin_list_prize_claims() from public;
revoke all on function public.admin_redeem_prize_claim(text) from public;
grant execute on function public.is_fagiolo_admin() to authenticated;
grant execute on function public.get_my_profile() to authenticated;
grant execute on function public.update_my_telegram_username(text) to authenticated;
grant execute on function public.get_my_prize_claims() to authenticated;
grant execute on function public.request_prize_claim(integer) to authenticated;
grant execute on function public.admin_leaderboard_for_level(integer) to authenticated;
grant execute on function public.admin_set_prize_winner(uuid, integer, boolean) to authenticated;
grant execute on function public.admin_list_prize_claims() to authenticated;
grant execute on function public.admin_redeem_prize_claim(text) to authenticated;

notify pgrst, 'reload schema';

