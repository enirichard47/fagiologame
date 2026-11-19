type SupabaseUser = {
  id: string;
  email?: string;
  user_metadata?: { username?: string };
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

const SESSION_KEY = 'fagiolo-online-session';

export class FagioloOnline {
  private readonly url = (import.meta.env.VITE_SUPABASE_URL ?? '').replace(/\/$/, '');
  private readonly anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';
  private session: SupabaseSession | null = this.readSession();

  get isConfigured() { return Boolean(this.url && this.anonKey); }
  get user() { return this.session?.user ?? null; }
  get username() { return this.session?.user.user_metadata?.username ?? this.session?.user.email?.split('@')[0] ?? ''; }

  async restoreSession() {
    if (this.session && this.session.expires_at < Date.now() / 1000 + 60) {
      try { await this.refreshSession(); } catch { this.setSession(null); }
    }
    return this.user;
  }

  async signUp(username: string, email: string, password: string) {
    this.requireConfiguration();
    const data = await this.request(`/auth/v1/signup?redirect_to=${encodeURIComponent(window.location.origin)}`, {
      method: 'POST',
      body: JSON.stringify({ email, password, data: { username } }),
    }, this.anonKey, false);
    if (data.access_token && data.refresh_token) this.setSession(this.toSession(data));
    else this.setSession(null);
    return { user: data.user as SupabaseUser | undefined, needsEmailConfirmation: !data.access_token };
  }

  async signIn(email: string, password: string) {
    this.requireConfiguration();
    const data = await this.request('/auth/v1/token?grant_type=password', {
      method: 'POST', body: JSON.stringify({ email, password }),
    }, this.anonKey, false);
    this.setSession(this.toSession(data));
    return this.user;
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
    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: Date.now() / 1000 + Number(data.expires_in ?? 3600),
      user: data.user,
    };
  }

  private readSession(): SupabaseSession | null {
    try {
      const stored = localStorage.getItem(SESSION_KEY);
      return stored ? JSON.parse(stored) as SupabaseSession : null;
    } catch { return null; }
  }

  private setSession(session: SupabaseSession | null) {
    this.session = session;
    if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else localStorage.removeItem(SESSION_KEY);
    window.dispatchEvent(new CustomEvent('fagiolo-auth-change', { detail: session?.user ?? null }));
  }
}

