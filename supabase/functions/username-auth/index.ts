const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json" },
});

const normalizeAccountUsername = (value: unknown) => String(value ?? "").trim().toLowerCase();
const normalizeTelegramUsername = (value: unknown) => String(value ?? "").trim().replace(/^@/, "").toLowerCase();
const isValidAccountUsername = (value: string) => /^[a-z0-9_]{3,32}$/.test(value);
const isValidTelegramUsername = (value: string) => /^[a-z0-9_]{5,32}$/.test(value);

Deno.serve(async request => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ message: "Method not allowed." }, 405);

  const projectUrl = Deno.env.get("SUPABASE_URL")?.replace(/\/$/, "");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!projectUrl || !anonKey || !serviceKey) return json({ message: "Username sign-in is not configured on the server." }, 503);

  const serviceHeaders = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" };
  const requestAuth = async (alias: string, password: string) => {
    const response = await fetch(`${projectUrl}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { apikey: anonKey, "Content-Type": "application/json" },
      body: JSON.stringify({ email: alias, password }),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error("Username or password is incorrect.");
    const user = { ...(data.user ?? {}) };
    delete user.email;
    return json({ ...data, user });
  };

  try {
    const body = await request.json();
    const action = String(body?.action ?? "");
    const loginUsername = normalizeAccountUsername(body?.login_username);
    const telegramUsername = normalizeTelegramUsername(body?.telegram_username);
    const password = String(body?.password ?? "");
    if (action !== "signup" && action !== "login" && action !== "admin_login") return json({ message: "Unknown account action." }, 400);
    if (action !== "admin_login" && !isValidAccountUsername(loginUsername)) return json({ message: "Account username must be 3–32 letters, numbers, or underscores." }, 400);
    if (action === "signup" && telegramUsername && !isValidTelegramUsername(telegramUsername)) return json({ message: "Telegram username must be 5–32 letters, numbers, or underscores." }, 400);
    if (password.length < 8 || password.length > 72) return json({ message: "Password must be 8–72 characters." }, 400);

    if (action === "admin_login") {
      const adminsResponse = await fetch(`${projectUrl}/rest/v1/game_admins?select=user_id&limit=2`, { headers: serviceHeaders });
      if (!adminsResponse.ok) return json({ message: "Could not verify administrator access. Please try again." }, 503);
      const admins = await adminsResponse.json().catch(() => []);
      if (!admins.length) return json({ message: "No administrator account is configured yet." }, 403);
      if (admins.length !== 1) return json({ message: "Password-only admin sign-in requires exactly one authorized administrator." }, 409);

      const accountResponse = await fetch(`${projectUrl}/auth/v1/admin/users/${encodeURIComponent(admins[0].user_id)}`, { headers: serviceHeaders });
      const account = await accountResponse.json().catch(() => null);
      const internalAlias = account?.user?.email ?? account?.email;
      if (!accountResponse.ok || !internalAlias) return json({ message: "Could not verify administrator access. Please try again." }, 503);
      return await requestAuth(internalAlias, password);
    }

    if (action === "signup") {
      const gameUsername = String(body?.username ?? "").trim() || loginUsername;
      if (!/^[A-Za-z0-9_]{3,18}$/.test(gameUsername)) return json({ message: "In-game name must be 3–18 letters, numbers, or underscores." }, 400);

      const accountQuery = new URLSearchParams({ select: "user_id", account_username: `eq.${loginUsername}`, limit: "1" });
      const accountCheck = await fetch(`${projectUrl}/rest/v1/player_profiles?${accountQuery}`, { headers: serviceHeaders });
      if (!accountCheck.ok) return json({ message: "Could not check account username. Please try again." }, 503);
      const existingAccounts = await accountCheck.json().catch(() => []);
      if (existingAccounts.length) return json({ message: "That account username is already taken." }, 409);

      const gameQuery = new URLSearchParams({ select: "user_id", username: `eq.${gameUsername}`, limit: "1" });
      const gameCheck = await fetch(`${projectUrl}/rest/v1/player_profiles?${gameQuery}`, { headers: serviceHeaders });
      if (!gameCheck.ok) return json({ message: "Could not check in-game name. Please try again." }, 503);
      const existingNames = await gameCheck.json().catch(() => []);
      if (existingNames.length) return json({ message: "That in-game name is already taken." }, 409);

      // Supabase Auth requires an email or phone as its internal password identity.
      // This random, non-deliverable alias is never shown to or collected from players.
      const internalAlias = `player-${crypto.randomUUID()}@accounts.invalid`;
      const createResponse = await fetch(`${projectUrl}/auth/v1/admin/users`, {
        method: "POST",
        headers: serviceHeaders,
        body: JSON.stringify({
          email: internalAlias,
          password,
          email_confirm: true,
          user_metadata: { login_username: loginUsername, username: gameUsername, telegram_username: telegramUsername || null },
        }),
      });
      const created = await createResponse.json().catch(() => null);
      if (!createResponse.ok) {
        const message = String(created?.msg ?? created?.message ?? "Could not create the account.");
        if (/duplicate|already|unique/i.test(message)) return json({ message: "That account username or in-game name is already taken." }, 409);
        return json({ message: "Could not create the account. Please try again." }, 400);
      }
      try {
        return await requestAuth(internalAlias, password);
      } catch (error) {
        const userId = created?.user?.id ?? created?.id;
        if (userId) await fetch(`${projectUrl}/auth/v1/admin/users/${userId}`, { method: "DELETE", headers: serviceHeaders }).catch(() => undefined);
        throw error;
      }
    }

    if (action === "login") {
      const query = new URLSearchParams({ select: "user_id", account_username: `eq.${loginUsername}`, limit: "1" });
      const profileResponse = await fetch(`${projectUrl}/rest/v1/player_profiles?${query}`, { headers: serviceHeaders });
      if (!profileResponse.ok) return json({ message: "Username or password is incorrect." }, 401);
      const profiles = await profileResponse.json().catch(() => []);
      const userId = profiles?.[0]?.user_id;
      if (!userId) return json({ message: "Username or password is incorrect." }, 401);

      const accountResponse = await fetch(`${projectUrl}/auth/v1/admin/users/${encodeURIComponent(userId)}`, { headers: serviceHeaders });
      const account = await accountResponse.json().catch(() => null);
      const internalAlias = account?.user?.email ?? account?.email;
      if (!accountResponse.ok || !internalAlias) return json({ message: "Username or password is incorrect." }, 401);
      return await requestAuth(internalAlias, password);
    }

    return json({ message: "Unknown account action." }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not complete account request.";
    return json({ message }, 400);
  }
});
