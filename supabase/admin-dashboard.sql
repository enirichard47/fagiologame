-- Admin dashboard controls, score moderation, and a moderation audit trail.
-- Safe to run more than once in the Supabase SQL editor.

create table if not exists public.game_level_settings (
  level smallint primary key check (level between 1 and 3),
  is_open boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);
insert into public.game_level_settings (level, is_open)
values (1, true), (2, true), (3, true)
on conflict (level) do nothing;
alter table public.game_level_settings enable row level security;
revoke all on public.game_level_settings from anon, authenticated;

create or replace function public.submit_level_score(
  p_level integer, p_score integer, p_beans_collected integer,
  p_total_beans integer, p_completion_time_ms integer
)
returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  player_id uuid := auth.uid();
  changed_rows integer;
  expected_score integer;
  level_is_open boolean;
begin
  if player_id is null then raise exception 'Sign in to submit a score.'; end if;
  if p_level not between 1 and 3 then raise exception 'Invalid level.'; end if;
  select s.is_open into level_is_open from public.game_level_settings s where s.level = p_level for share;
  if not coalesce(level_is_open, false) then raise exception 'This level is closed and is not accepting scores.'; end if;
  if p_total_beans <> 22 or p_beans_collected not between 0 and p_total_beans then
    raise exception 'Invalid bean count.';
  end if;
  expected_score := 500 + (p_beans_collected * 100);
  if p_beans_collected >= 15 then expected_score := expected_score + 500; end if;
  if p_score <> expected_score then raise exception 'Score does not match the level reward rules.'; end if;
  if p_completion_time_ms not between 1 and 60000 then raise exception 'Invalid completion time.'; end if;
  insert into public.leaderboard_entries
    (user_id, level, score, beans_collected, total_beans, completion_time_ms, updated_at)
  values (player_id, p_level, p_score, p_beans_collected, p_total_beans, p_completion_time_ms, now())
  on conflict (user_id, level) do update set
    score = excluded.score, beans_collected = excluded.beans_collected,
    total_beans = excluded.total_beans, completion_time_ms = excluded.completion_time_ms, updated_at = now()
  where excluded.score > leaderboard_entries.score
     or (excluded.score = leaderboard_entries.score and excluded.beans_collected > leaderboard_entries.beans_collected)
     or (excluded.score = leaderboard_entries.score and excluded.beans_collected = leaderboard_entries.beans_collected
         and excluded.completion_time_ms < leaderboard_entries.completion_time_ms);
  get diagnostics changed_rows = row_count;
  return changed_rows > 0;
end;
$$;

create table if not exists public.score_moderation_log (
  id bigint generated always as identity primary key,
  player_id uuid not null,
  level smallint not null check (level between 1 and 3),
  admin_id uuid references auth.users(id) on delete set null,
  score integer not null,
  beans_collected smallint not null,
  total_beans smallint not null,
  completion_time_ms integer not null,
  reason text not null,
  deleted_at timestamptz not null default now()
);
alter table public.score_moderation_log enable row level security;
revoke all on public.score_moderation_log from anon, authenticated;

create table if not exists public.leaderboard_reset_batches (
  reset_id uuid primary key default gen_random_uuid(),
  admin_id uuid references auth.users(id) on delete set null,
  level smallint check (level between 1 and 3),
  entries_removed integer not null default 0,
  cleared_at timestamptz not null default now()
);
create table if not exists public.leaderboard_reset_entries (
  reset_id uuid not null references public.leaderboard_reset_batches(reset_id) on delete cascade,
  player_id uuid not null,
  username text,
  level smallint not null check (level between 1 and 3),
  score integer not null,
  beans_collected smallint not null,
  total_beans smallint not null,
  completion_time_ms integer not null,
  primary key (reset_id, player_id, level)
);
create table if not exists public.leaderboard_winner_history (
  winner_id bigint generated always as identity primary key,
  reset_id uuid not null references public.leaderboard_reset_batches(reset_id) on delete cascade,
  level smallint not null check (level between 1 and 3),
  player_id uuid not null,
  username text not null,
  score integer not null,
  beans_collected smallint not null,
  total_beans smallint not null,
  completion_time_ms integer not null,
  selection_method text not null check (selection_method in ('admin', 'leaderboard')),
  recorded_at timestamptz not null default now(),
  unique (reset_id, level)
);
create table if not exists public.leaderboard_winner_selections (
  level smallint primary key check (level between 1 and 3),
  player_id uuid not null,
  selected_by uuid references auth.users(id) on delete set null,
  selected_at timestamptz not null default now()
);
alter table public.leaderboard_reset_batches enable row level security;
alter table public.leaderboard_reset_entries enable row level security;
alter table public.leaderboard_winner_history enable row level security;
alter table public.leaderboard_winner_selections enable row level security;
revoke all on public.leaderboard_reset_batches from anon, authenticated;
revoke all on public.leaderboard_reset_entries from anon, authenticated;
revoke all on public.leaderboard_winner_history from anon, authenticated;
revoke all on public.leaderboard_winner_selections from anon, authenticated;

-- Claims become per confirmed competition win, allowing repeat wins per level.
alter table public.prize_claims add column if not exists claim_id bigint generated by default as identity;
alter table public.prize_claims add column if not exists winner_id bigint references public.leaderboard_winner_history(winner_id);
alter table public.prize_claims add column if not exists score integer;
alter table public.prize_claims add column if not exists beans_collected smallint;
alter table public.prize_claims add column if not exists total_beans smallint;
alter table public.prize_claims add column if not exists claim_deadline timestamptz;
alter table public.prize_claims drop constraint if exists prize_claims_status_check;
alter table public.prize_claims add constraint prize_claims_status_check
  check (status in ('eligible', 'code_issued', 'redeemed', 'revoked', 'expired'));
update public.prize_claims
  set claim_deadline = now() + interval '7 days',
      code_expires_at = case when status = 'code_issued' then now() + interval '7 days' else code_expires_at end
  where claim_deadline is null and status in ('eligible', 'code_issued');
do $$
declare
  primary_name text;
  primary_definition text;
begin
  select c.conname, pg_get_constraintdef(c.oid) into primary_name, primary_definition from pg_constraint c
  where c.conrelid = 'public.prize_claims'::regclass and c.contype = 'p';
  if primary_name is not null and primary_definition <> 'PRIMARY KEY (claim_id)' then
    execute format('alter table public.prize_claims drop constraint %I', primary_name);
    primary_name := null;
  end if;
  if primary_name is null then
    alter table public.prize_claims add constraint prize_claims_pkey primary key (claim_id);
  end if;
end;
$$;
create unique index if not exists prize_claims_winner_id_unique on public.prize_claims(winner_id) where winner_id is not null;

drop function if exists public.get_my_prize_claims();
create function public.get_my_prize_claims()
returns table (claim_id bigint, level smallint, status text, code_expires_at timestamptz, claim_deadline timestamptz, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select c.claim_id, c.level,
         case when c.status in ('eligible', 'code_issued') and c.claim_deadline <= now() then 'expired' else c.status end,
         c.code_expires_at, c.claim_deadline, c.created_at
  from public.prize_claims c
  where c.user_id = auth.uid() and c.status <> 'revoked'
  order by c.created_at desc;
$$;

drop function if exists public.request_prize_claim(integer);
drop function if exists public.request_prize_claim(bigint);
create function public.request_prize_claim(p_claim_id bigint)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  player_id uuid := auth.uid();
  claim_status text;
  claim_code text := upper(replace(gen_random_uuid()::text, '-', ''));
begin
  if player_id is null then raise exception 'Sign in to claim a prize.'; end if;
  if not exists (select 1 from public.player_profiles p where p.user_id = player_id and p.telegram_username is not null) then
    raise exception 'Add your Telegram username to your account before requesting a claim code.';
  end if;
  select c.status into claim_status from public.prize_claims c
    where c.claim_id = p_claim_id and c.user_id = player_id for update;
  if claim_status is null then raise exception 'This account is not marked as a prize winner.'; end if;
  if claim_status in ('redeemed', 'revoked', 'expired') then raise exception 'This prize claim is no longer available.'; end if;
  if exists (select 1 from public.prize_claims c where c.claim_id = p_claim_id and c.claim_deadline <= now()) then
    update public.prize_claims set status = 'expired', code_hash = null, code_expires_at = null
      where claim_id = p_claim_id and user_id = player_id;
    return null;
  end if;
  update public.prize_claims
    set status = 'code_issued',
        code_hash = encode(extensions.digest(convert_to(lower(claim_code), 'UTF8'), 'sha256'), 'hex'),
        code_issued_at = now(), code_expires_at = claim_deadline
    where claim_id = p_claim_id and user_id = player_id;
  return claim_code;
end;
$$;

create or replace function public.get_my_win_summary()
returns table (total_wins bigint, level_1_wins bigint, level_2_wins bigint, level_3_wins bigint)
language sql stable security definer set search_path = '' as $$
  select count(*)::bigint,
         count(*) filter (where w.level = 1)::bigint,
         count(*) filter (where w.level = 2)::bigint,
         count(*) filter (where w.level = 3)::bigint
  from public.leaderboard_winner_history w where w.player_id = auth.uid();
$$;

-- Repair times saved by older clients, which stored only the timer tick remainder.
update public.leaderboard_entries set completion_time_ms = 60000 where completion_time_ms < 1000;

-- Keep the admin review list to the top 20 runs for the selected level.
create or replace function public.admin_leaderboard_for_level(p_level integer)
returns table (
  player_id uuid, username text, telegram_username text, score integer,
  beans_collected smallint, total_beans smallint, completion_time_ms integer,
  is_winner boolean, claim_status text
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_fagiolo_admin() then raise exception 'Administrator access required.'; end if;
  if p_level not between 1 and 3 then raise exception 'Invalid level.'; end if;
  return query
    select e.user_id, p.username, p.telegram_username, e.score, e.beans_collected,
           e.total_beans, e.completion_time_ms,
           coalesce(s.player_id = e.user_id, false), null::text
    from public.leaderboard_entries e
    join public.player_profiles p on p.user_id = e.user_id
    left join public.leaderboard_winner_selections s on s.level = e.level
    where e.level = p_level
    order by e.score desc, e.beans_collected desc, e.completion_time_ms asc
    limit 20;
end;
$$;

create or replace function public.admin_set_prize_winner(p_user_id uuid, p_level integer, p_is_winner boolean)
returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_fagiolo_admin() then raise exception 'Administrator access required.'; end if;
  if p_level not between 1 and 3 then raise exception 'Invalid level.'; end if;
  if p_is_winner then
    if not exists (select 1 from public.leaderboard_entries e where e.user_id = p_user_id and e.level = p_level) then
      raise exception 'That player has no current leaderboard score for this level.';
    end if;
    insert into public.leaderboard_winner_selections (level, player_id, selected_by, selected_at)
    values (p_level, p_user_id, auth.uid(), now())
    on conflict (level) do update set player_id = excluded.player_id, selected_by = auth.uid(), selected_at = now();
  else
    delete from public.leaderboard_winner_selections where level = p_level and player_id = p_user_id;
  end if;
  return true;
end;
$$;

drop function if exists public.admin_list_prize_claims();
create function public.admin_list_prize_claims()
returns table (
  player_id uuid, level smallint, username text, telegram_username text,
  score integer, beans_collected smallint, status text,
  code_expires_at timestamptz, redeemed_at timestamptz, created_at timestamptz, claim_deadline timestamptz
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_fagiolo_admin() then raise exception 'Administrator access required.'; end if;
  return query
    select c.user_id, c.level, p.username, p.telegram_username,
           coalesce(c.score, e.score), coalesce(c.beans_collected, e.beans_collected),
           case when c.status in ('eligible', 'code_issued') and c.claim_deadline <= now() then 'expired' else c.status end,
           c.code_expires_at, c.redeemed_at, c.created_at, c.claim_deadline
    from public.prize_claims c
    join public.player_profiles p on p.user_id = c.user_id
    left join public.leaderboard_entries e on e.user_id = c.user_id and e.level = c.level
    where c.status <> 'revoked'
    order by c.created_at desc;
end;
$$;

create or replace function public.admin_redeem_prize_claim(p_code text)
returns table (username text, telegram_username text, level smallint, score integer, beans_collected smallint)
language plpgsql security definer set search_path = '' as $$
declare
  normalized_code text := lower(regexp_replace(trim(coalesce(p_code, '')), '[^A-Fa-f0-9]', '', 'g'));
  found_claim_id bigint;
  found_user uuid;
  found_level smallint;
  found_score integer;
  found_beans smallint;
begin
  if not public.is_fagiolo_admin() then raise exception 'Administrator access required.'; end if;
  if length(normalized_code) <> 32 then raise exception 'Claim code is invalid, expired, or already used.'; end if;
  select c.claim_id, c.user_id, c.level, coalesce(c.score, e.score), coalesce(c.beans_collected, e.beans_collected)
    into found_claim_id, found_user, found_level, found_score, found_beans
  from public.prize_claims c
  left join public.leaderboard_entries e on e.user_id = c.user_id and e.level = c.level
  where c.code_hash = encode(extensions.digest(convert_to(normalized_code, 'UTF8'), 'sha256'), 'hex')
    and c.status = 'code_issued' and c.code_expires_at > now()
  for update of c;
  if found_user is null then raise exception 'Claim code is invalid, expired, or already used.'; end if;
  update public.prize_claims set status = 'redeemed', redeemed_at = now(), code_hash = null
    where claim_id = found_claim_id;
  return query
    select p.username, p.telegram_username, found_level, found_score, found_beans
    from public.player_profiles p where p.user_id = found_user;
end;
$$;

create or replace function public.get_level_settings()
returns table (level smallint, is_open boolean)
language sql stable security definer set search_path = '' as $$
  select s.level, s.is_open from public.game_level_settings s order by s.level;
$$;

create or replace function public.admin_get_level_settings()
returns table (level smallint, is_open boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_fagiolo_admin() then raise exception 'Administrator access required.'; end if;
  return query select s.level, s.is_open from public.game_level_settings s order by s.level;
end;
$$;

create or replace function public.admin_set_level_open(p_level integer, p_is_open boolean)
returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_fagiolo_admin() then raise exception 'Administrator access required.'; end if;
  if p_level not between 1 and 3 then raise exception 'Invalid level.'; end if;
  insert into public.game_level_settings (level, is_open, updated_at, updated_by)
  values (p_level, p_is_open, now(), auth.uid())
  on conflict (level) do update set is_open = excluded.is_open, updated_at = now(), updated_by = auth.uid();
  return true;
end;
$$;

create or replace function public.admin_dashboard_overview()
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if not public.is_fagiolo_admin() then raise exception 'Administrator access required.'; end if;
  select jsonb_build_object(
    'players', (select count(*) from public.player_profiles),
    'scores', (select count(*) from public.leaderboard_entries),
    'pending_claims', (select count(*) from public.prize_claims where status in ('eligible', 'code_issued') and claim_deadline > now())
  ) into result;
  return result;
end;
$$;

create or replace function public.admin_delete_leaderboard_score(p_user_id uuid, p_level integer, p_reason text)
returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  prior public.leaderboard_entries%rowtype;
  cleaned_reason text := left(trim(coalesce(p_reason, '')), 80);
begin
  if not public.is_fagiolo_admin() then raise exception 'Administrator access required.'; end if;
  if p_level not between 1 and 3 then raise exception 'Invalid level.'; end if;
  if cleaned_reason not in ('impossible_score', 'invalid_run', 'duplicate_or_exploit', 'other') then
    raise exception 'Choose a valid moderation reason.';
  end if;
  select * into prior from public.leaderboard_entries where user_id = p_user_id and level = p_level for update;
  if not found then raise exception 'That score no longer exists.'; end if;
  insert into public.score_moderation_log
    (player_id, level, admin_id, score, beans_collected, total_beans, completion_time_ms, reason)
  values
    (prior.user_id, prior.level, auth.uid(), prior.score, prior.beans_collected, prior.total_beans, prior.completion_time_ms, cleaned_reason);
  delete from public.leaderboard_entries where user_id = p_user_id and level = p_level;
  delete from public.leaderboard_winner_selections where player_id = p_user_id and level = p_level;
  return true;
end;
$$;

create or replace function public.admin_score_moderation_log()
returns table (player_id uuid, username text, level smallint, score integer, reason text, deleted_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_fagiolo_admin() then raise exception 'Administrator access required.'; end if;
  return query
    select l.player_id, p.username, l.level, l.score, l.reason, l.deleted_at
    from public.score_moderation_log l
    left join public.player_profiles p on p.user_id = l.player_id
    order by l.deleted_at desc
    limit 100;
end;
$$;

create or replace function public.admin_clear_leaderboard(p_level integer default null)
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  batch_id uuid;
  removed integer;
  current_level smallint;
  selected_user uuid;
  chosen public.leaderboard_entries%rowtype;
  chosen_name text;
  manual_winner boolean;
  new_winner_id bigint;
begin
  if not public.is_fagiolo_admin() then raise exception 'Administrator access required.'; end if;
  if p_level is not null and p_level not between 1 and 3 then raise exception 'Invalid level.'; end if;
  perform 1 from public.game_level_settings s
    where p_level is null or s.level = p_level order by s.level for share;
  if exists (select 1 from public.game_level_settings s
      where (p_level is null or s.level = p_level) and s.is_open) then
    raise exception 'Close the selected level or levels before clearing so the final standings are frozen.';
  end if;
  insert into public.leaderboard_reset_batches (admin_id, level)
  values (auth.uid(), p_level) returning reset_id into batch_id;
  lock table public.leaderboard_entries in exclusive mode;
  lock table public.leaderboard_winner_selections in exclusive mode;
  insert into public.leaderboard_reset_entries
    (reset_id, player_id, username, level, score, beans_collected, total_beans, completion_time_ms)
  select batch_id, e.user_id, p.username, e.level, e.score, e.beans_collected, e.total_beans, e.completion_time_ms
  from public.leaderboard_entries e
  left join public.player_profiles p on p.user_id = e.user_id
  where p_level is null or e.level = p_level;
  get diagnostics removed = row_count;
  for current_level in
    select distinct e.level from public.leaderboard_entries e where p_level is null or e.level = p_level
  loop
    selected_user := null;
    select s.player_id into selected_user from public.leaderboard_winner_selections s where s.level = current_level;
    select e.* into chosen from public.leaderboard_entries e
      where e.level = current_level
      order by case when e.user_id = selected_user then 0 else 1 end,
               e.score desc, e.beans_collected desc, e.completion_time_ms asc
      limit 1;
    if found then
      manual_winner := selected_user is not null and chosen.user_id = selected_user;
      select coalesce(p.username, 'Player') into chosen_name
        from public.player_profiles p where p.user_id = chosen.user_id;
      insert into public.leaderboard_winner_history
        (reset_id, level, player_id, username, score, beans_collected, total_beans, completion_time_ms, selection_method)
      values
        (batch_id, current_level, chosen.user_id, coalesce(chosen_name, 'Player'), chosen.score,
         chosen.beans_collected, chosen.total_beans, chosen.completion_time_ms,
         case when manual_winner then 'admin' else 'leaderboard' end)
      returning winner_id into new_winner_id;
      if manual_winner then
        insert into public.prize_claims
          (user_id, level, status, winner_id, score, beans_collected, total_beans, created_at, claim_deadline)
        values
          (chosen.user_id, current_level, 'eligible', new_winner_id, chosen.score,
           chosen.beans_collected, chosen.total_beans, now(), now() + interval '7 days');
      end if;
    end if;
  end loop;
  delete from public.leaderboard_entries e where p_level is null or e.level = p_level;
  delete from public.leaderboard_winner_selections s where p_level is null or s.level = p_level;
  update public.leaderboard_reset_batches set entries_removed = removed where reset_id = batch_id;
  return removed;
end;
$$;

drop function if exists public.admin_leaderboard_reset_history();
create or replace function public.admin_leaderboard_reset_history()
returns table (reset_id uuid, level smallint, entries_removed integer, cleared_at timestamptz, winner_summary text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_fagiolo_admin() then raise exception 'Administrator access required.'; end if;
  return query
    select b.reset_id, b.level, b.entries_removed, b.cleared_at,
      (select string_agg('L' || w.level::text || ': ' || w.username ||
        case when w.selection_method = 'admin' then ' (selected)' else ' (top score)' end, ' · ' order by w.level)
       from public.leaderboard_winner_history w where w.reset_id = b.reset_id)
    from public.leaderboard_reset_batches b order by b.cleared_at desc limit 50;
end;
$$;

revoke all on function public.get_level_settings() from public;
revoke all on function public.submit_level_score(integer, integer, integer, integer, integer) from public;
revoke all on function public.get_my_prize_claims() from public;
revoke all on function public.request_prize_claim(bigint) from public;
revoke all on function public.get_my_win_summary() from public;
revoke all on function public.admin_leaderboard_for_level(integer) from public;
revoke all on function public.admin_set_prize_winner(uuid, integer, boolean) from public;
revoke all on function public.admin_list_prize_claims() from public;
revoke all on function public.admin_redeem_prize_claim(text) from public;
revoke all on function public.admin_get_level_settings() from public;
revoke all on function public.admin_set_level_open(integer, boolean) from public;
revoke all on function public.admin_dashboard_overview() from public;
revoke all on function public.admin_delete_leaderboard_score(uuid, integer, text) from public;
revoke all on function public.admin_score_moderation_log() from public;
revoke all on function public.admin_clear_leaderboard(integer) from public;
revoke all on function public.admin_leaderboard_reset_history() from public;
grant execute on function public.get_level_settings() to anon, authenticated;
grant execute on function public.submit_level_score(integer, integer, integer, integer, integer) to authenticated;
grant execute on function public.get_my_prize_claims() to authenticated;
grant execute on function public.request_prize_claim(bigint) to authenticated;
grant execute on function public.get_my_win_summary() to authenticated;
grant execute on function public.admin_leaderboard_for_level(integer) to authenticated;
grant execute on function public.admin_set_prize_winner(uuid, integer, boolean) to authenticated;
grant execute on function public.admin_list_prize_claims() to authenticated;
grant execute on function public.admin_redeem_prize_claim(text) to authenticated;
grant execute on function public.admin_get_level_settings() to authenticated;
grant execute on function public.admin_set_level_open(integer, boolean) to authenticated;
grant execute on function public.admin_dashboard_overview() to authenticated;
grant execute on function public.admin_delete_leaderboard_score(uuid, integer, text) to authenticated;
grant execute on function public.admin_score_moderation_log() to authenticated;
grant execute on function public.admin_clear_leaderboard(integer) to authenticated;
grant execute on function public.admin_leaderboard_reset_history() to authenticated;

notify pgrst, 'reload schema';
