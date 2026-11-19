# Connect Supabase

1. Create a Supabase project and enable email/password sign-in under **Authentication → Providers → Email**.
2. In **Authentication → URL Configuration**, allow the local game origin (`http://localhost:5173`) and the production game origin so email confirmation can return to the game.
3. Open the Supabase SQL Editor and run [`schema.sql`](schema.sql).
4. Copy the root `.env.example` file to `.env.local`. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from the Supabase project's API settings. Restart the Vite dev server after editing the environment file.

Use only the public anon/publishable key in this browser app. Never expose a Supabase `service_role` key.

The leaderboard stores one best completed run per player per level. Ranking is highest score, then most beans, then fastest completion. The database checks the current score formula, but the browser still reports its run data. That keeps the first version simple; it is not fully cheat-proof for high-stakes competition.
