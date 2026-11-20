# Supabase setup

1. Create a Supabase project and open its SQL Editor.
2. Run [`schema.sql`](schema.sql). The updated script can be rerun on an existing project; it adds private account usernames, migrates existing accounts to use their current in-game name as their initial login username, and keeps Telegram names private for prize contact.
3. Run [`admin-dashboard.sql`](admin-dashboard.sql) in the SQL Editor to enable level availability controls, dashboard metrics, audited score removal, and per-level/all-level leaderboard resets. Each clear archives the board, records the manually selected winner or falls back to first place, and creates a prize claim only for a manually selected winner. This migration is safe to rerun.
4. Copy `.env.example` to `.env.local`, set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`, and restart Vite.
5. Install the Supabase CLI if needed, then sign in and link this folder to your Supabase project. The project ref is the part before `.supabase.co` in your project URL:

   ```powershell
   npx supabase login
   npx supabase link --project-ref YOUR_PROJECT_REF
   ```

   For this project, the ref is `agukinvtaqftsnghsfco`. Then deploy the username authentication function and set its private server key:

   ```powershell
   npx supabase secrets set SUPABASE_SERVICE_ROLE_KEY="YOUR_SERVICE_ROLE_KEY"
   npx supabase functions deploy username-auth --no-verify-jwt
   ```

   The service role key must stay in Supabase Function secrets. Never put it in `.env.local` or browser code. The function creates an internal Supabase Auth identity and signs players in with their account username and password. The in-game name is public and can be different; the Telegram username is optional, private prize-contact information, and never a login credential. `/admin` accepts the password of the single account authorized in `game_admins`, without asking for its username.

   After deployment, check the `username-auth` function logs in the Supabase Dashboard if account creation still fails. Supabase documents the CLI sign-in, project linking, and function deployment flow in its [Edge Function deployment guide](https://supabase.com/docs/guides/functions/deploy).

Existing accounts are migrated to use their current in-game name as their initial account username, with their existing password. New players can choose a separate account username and public in-game name. Players can add a Telegram username in their profile before requesting a prize claim; it is never used to sign in.

## Add an administrator

1. Create your game account with your account username and password.
2. In the SQL Editor, add that account to the private admin list. Use the account username:

   ```sql
   insert into public.game_admins (user_id)
   select user_id from public.player_profiles
   where account_username = lower('yourAccountUsername')
   on conflict (user_id) do nothing;
   ```

3. Open the game at `/admin` and enter that account's password. Password-only admin sign-in requires exactly one account in `game_admins`; the dashboard checks that role on the server.

Only the in-game name appears on the leaderboard. Telegram usernames are private and are returned only to the signed-in player or admin-only database functions. The admin page can review each level's leaderboard, open or close levels, remove suspicious scores with a reason recorded in moderation history, select a manual winner before a board reset, and redeem claim codes. If no manual winner is selected, the highest-ranked player wins without a prize when the board is cleared. Confirmed wins appear in the player's profile.

Claim codes are random, single-use, stored as hashes, and expire at the end of the winner's seven-day claim window, which starts when the board is finalized. A replacement code does not extend that deadline. Before redeeming a code, compare the Telegram sender's username with the private profile shown in the admin page. Telegram contact names are user-entered and are not independently verified by Telegram.

There is currently no in-game password recovery. If a player forgets their password, verify their Telegram ownership and use a secure administrator reset process before restoring access.

The leaderboard stores one best completed run per player per level. Ranking is highest score, then most beans, then fastest completion. The database checks the current score formula, but the browser still reports its run data. This is not fully cheat-proof for high-stakes competition; review prize winners before sending rewards.
