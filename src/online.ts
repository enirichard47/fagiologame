type SupabaseUser = {
  id: string;
  user_metadata?: { login_username?: string; username?: string; telegram_username?: string };
};

type SupabaseSession = {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  user: SupabaseUser;
};

export type LeaderboardEntry = {
  level: number;
  username: string;
  score: number;
  beans_collected: number;
  total_beans: number;
  completion_time_ms: number;
};

export type PlayerPrizeClaim = { claim_id: number; level: number; status: 'eligible' | 'code_issued' | 'redeemed' | 'revoked' | 'expired'; code_expires_at: string | null; claim_deadline: string | null; created_at: string };
export type PlayerWinSummary = { total_wins: number; level_1_wins: number; level_2_wins: number; level_3_wins: number };
export type AdminLeaderboardEntry = {
  player_id: string; username: string; telegram_username: string | null; score: number;
  beans_collected: number; total_beans: number; completion_time_ms: number;
  is_winner: boolean; claim_status: string | null;
};
export type AdminPrizeClaim = {
  player_id: string; level: number; username: string; telegram_username: string | null;
  score: number | null; beans_collected: number | null; status: string;
  code_expires_at: string | null; redeemed_at: string | null; created_at: string; claim_deadline: string | null;
};
export type AdminLevelSetting = { level: number; is_open: boolean };
export type AdminOverview = { players: number; scores: number; pending_claims: number };
export type AdminModerationRecord = { player_id: string; username: string | null; level: number; score: number; reason: string; deleted_at: string };
export type AdminLeaderboardReset = { reset_id: string; level: number | null; entries_removed: number; cleared_at: string; winner_summary: string | null };

const SESSION_KEY = 'fagiolo-online-session';

export class FagioloOnline {
  private readonly url = (import.meta.env.VITE_SUPABASE_URL ?? '').replace(/\/$/, '');
  private readonly anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';
  private session: SupabaseSession | null = this.readSession();

  get isConfigured() { return Boolean(this.url && this.anonKey); }
  get user() { return this.session?.user ?? null; }
  get username() { return this.session?.user.user_metadata?.username ?? ''; }
  get loginUsername() { return this.session?.user.user_metadata?.login_username ?? this.username; }
  get telegramUsername() { return this.session?.user.user_metadata?.telegram_username ?? ''; }

  async restoreSession() {
    if (this.session && this.session.expires_at < Date.now() / 1000 + 60) {
      try { await this.refreshSession(); } catch { this.setSession(null); }
    }
    return this.user;
  }

  async signUp(loginUsername: string, username: string, telegramUsername: string, password: string) {
    const data = await this.usernameAuth({ action: 'signup', login_username: loginUsername, username, telegram_username: telegramUsername, password });
    this.setSession(this.toSession(data));
    return this.user;
  }

  async signIn(loginUsername: string, password: string) {
    const data = await this.usernameAuth({ action: 'login', login_username: loginUsername, password });
    this.setSession(this.toSession(data));
    return this.user;
  }

  async signInAdmin(password: string) {
    const data = await this.usernameAuth({ action: 'admin_login', password });
    this.setSession(this.toSession(data));
    return this.user;
  }

  private async usernameAuth(body: Record<string, string>) {
    this.requireConfiguration();
    let response: Response;
    try {
      response = await fetch(`${this.url}/functions/v1/username-auth`, {
        method: 'POST',
        headers: { apikey: this.anonKey, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch {
      throw new Error('Could not reach the username sign-in service. Deploy the username-auth Supabase function and check your project URL.');
    }
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(data?.message ?? 'Could not complete account request. Please try again.');
    return data;
  }

  async signOut() {
    const session = this.session;
    this.setSession(null);
    if (session && this.isConfigured) {
      try { await this.request('/auth/v1/logout', { method: 'POST' }, session.access_token); } catch { /* Local sign-out still succeeds. */ }
    }
  }

  async getLeaderboard(level: number) {
    this.requireConfiguration();
    const query = new URLSearchParams({
      select: 'level,username,score,beans_collected,total_beans,completion_time_ms',
      level: `eq.${level}`,
      order: 'score.desc,beans_collected.desc,completion_time_ms.asc',
      limit: '20',
    });
    return await this.request(`/rest/v1/leaderboard_public?${query}`) as LeaderboardEntry[];
  }

  async submitScore(level: number, score: number, beans: number, totalBeans: number, elapsedMs: number) {
    this.requireConfiguration();
    if (!this.session) throw new Error('Sign in to save your score to the leaderboard.');
    const saved = await this.request('/rest/v1/rpc/submit_level_score', {
      method: 'POST',
      body: JSON.stringify({
        p_level: level,
        p_score: score,
        p_beans_collected: beans,
        p_total_beans: totalBeans,
        p_completion_time_ms: elapsedMs,
      }),
    });
    return Boolean(saved);
  }

  async getMyProfile() {
    const rows = await this.rpc<{ username: string; telegram_username: string | null }[]>('get_my_profile', {});
    return rows[0] ?? null;
  }

  async updateTelegramUsername(telegramUsername: string) {
    const saved = await this.rpc<string>('update_my_telegram_username', { p_telegram_username: telegramUsername });
    if (this.session) {
      this.session.user.user_metadata = { ...this.session.user.user_metadata, telegram_username: saved };
      localStorage.setItem(SESSION_KEY, JSON.stringify(this.session));
      window.dispatchEvent(new CustomEvent('fagiolo-auth-change', { detail: this.session.user }));
    }
    return saved;
  }

  async isAdmin() { return Boolean(await this.rpc<boolean>('is_fagiolo_admin', {})); }
  async getMyPrizeClaims() { return await this.rpc<PlayerPrizeClaim[]>('get_my_prize_claims', {}); }
  async requestPrizeClaim(claimId: number) {
    const code = await this.rpc<string | null>('request_prize_claim', { p_claim_id: claimId });
    if (!code) throw new Error('The one-week claim window has ended. This reward can no longer be claimed.');
    return code;
  }
  async getMyWinSummary() { return await this.rpc<PlayerWinSummary[]>('get_my_win_summary', {}); }
  async getAdminLeaderboard(level: number) {
    return await this.rpc<AdminLeaderboardEntry[]>('admin_leaderboard_for_level', { p_level: level });
  }
  async getAdminLevelSettings() { return await this.rpc<AdminLevelSetting[]>('admin_get_level_settings', {}); }
  async setAdminLevelOpen(level: number, isOpen: boolean) {
    return await this.rpc<boolean>('admin_set_level_open', { p_level: level, p_is_open: isOpen });
  }
  async getLevelSettings() {
    this.requireConfiguration();
    return await this.request('/rest/v1/rpc/get_level_settings', { method: 'POST', body: '{}' }, this.anonKey, false) as AdminLevelSetting[];
  }
  async getAdminOverview() { return await this.rpc<AdminOverview>('admin_dashboard_overview', {}); }
  async deleteAdminScore(userId: string, level: number, reason: string) {
    return await this.rpc<boolean>('admin_delete_leaderboard_score', { p_user_id: userId, p_level: level, p_reason: reason });
  }
  async getAdminModerationLog() { return await this.rpc<AdminModerationRecord[]>('admin_score_moderation_log', {}); }
  async clearAdminLeaderboard(level: number | null) {
    return await this.rpc<number>('admin_clear_leaderboard', { p_level: level });
  }
  async getAdminLeaderboardResets() { return await this.rpc<AdminLeaderboardReset[]>('admin_leaderboard_reset_history', {}); }
  async setPrizeWinner(userId: string, level: number, isWinner: boolean) {
    return await this.rpc<boolean>('admin_set_prize_winner', { p_user_id: userId, p_level: level, p_is_winner: isWinner });
  }
  async getAdminPrizeClaims() { return await this.rpc<AdminPrizeClaim[]>('admin_list_prize_claims', {}); }
  async redeemPrizeClaim(code: string) {
    const rows = await this.rpc<{ username: string; telegram_username: string | null; level: number; score: number | null; beans_collected: number | null }[]>('admin_redeem_prize_claim', { p_code: code });
    return rows[0] ?? null;
  }

  private async rpc<T>(name: string, body: Record<string, unknown>): Promise<T> {
    this.requireConfiguration();
    if (!this.session) throw new Error('Sign in to continue.');
    return await this.request(`/rest/v1/rpc/${name}`, { method: 'POST', body: JSON.stringify(body) }) as T;
  }

  private requireConfiguration() {
    if (!this.isConfigured) throw new Error('Add your Supabase project URL and anon key to .env.local to enable online features.');
  }

  private async refreshSession() {
    if (!this.session?.refresh_token) throw new Error('Your session expired. Please sign in again.');
    const data = await this.request('/auth/v1/token?grant_type=refresh_token', {
      method: 'POST', body: JSON.stringify({ refresh_token: this.session.refresh_token }),
    }, this.anonKey, false);
    this.setSession(this.toSession(data));
  }

  private async request(path: string, init: RequestInit = {}, bearer?: string, refresh = true): Promise<any> {
    this.requireConfiguration();
    if (refresh && this.session && this.session.expires_at < Date.now() / 1000 + 60) await this.refreshSession();
    const token = bearer ?? this.session?.access_token ?? this.anonKey;
    const response = await fetch(`${this.url}${path}`, {
      ...init,
      headers: {
        apikey: this.anonKey,
        Authorization: `Bearer ${token}`,
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      },
    });
    const data = response.status === 204 ? null : await response.json().catch(() => null);
    if (!response.ok) throw new Error(data?.msg ?? data?.message ?? data?.hint ?? 'Supabase request failed. Please try again.');
    return data;
  }

  private toSession(data: any): SupabaseSession {
    if (!data?.access_token || !data?.refresh_token || !data?.user?.id) throw new Error('Supabase did not return a valid session.');
    const user = { ...data.user };
    delete user.email;
    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: Date.now() / 1000 + Number(data.expires_in ?? 3600),
      user,
    };
  }

  private readSession(): SupabaseSession | null {
    try {
      const stored = localStorage.getItem(SESSION_KEY);
      if (!stored) return null;
      const session = JSON.parse(stored) as SupabaseSession;
      const user = session.user as SupabaseUser & { email?: string };
      if (user?.email) {
        delete user.email;
        localStorage.setItem(SESSION_KEY, JSON.stringify(session));
      }
      return session;
    } catch { return null; }
  }

  private setSession(session: SupabaseSession | null) {
    this.session = session;
    if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else localStorage.removeItem(SESSION_KEY);
    window.dispatchEvent(new CustomEvent('fagiolo-auth-change', { detail: session?.user ?? null }));
  }
}

