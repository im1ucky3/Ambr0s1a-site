import { and, eq } from "drizzle-orm";
import { getDb } from "../db";
import { members } from "../db/schema";

export const ACCESS_COOKIE = "amb_access";
export const REFRESH_COOKIE = "amb_refresh";

type RuntimeConfig = { url: string; publishableKey: string; adminKey: string };
type SupabaseUser = { id: string; email?: string };
type TokenPayload = { access_token: string; refresh_token: string; expires_in?: number; user: SupabaseUser };

export type TeamMember = typeof members.$inferSelect;
export type TeamSession = { member: TeamMember; accessToken: string; refreshed?: TokenPayload };

function parseCookies(request: Request) {
  return new Map((request.headers.get("cookie") || "").split(";").map(part => part.trim()).filter(Boolean).map(part => {
    const index = part.indexOf("=");
    let value = part.slice(index + 1);
    try { value = decodeURIComponent(value); } catch { /* keep raw value */ }
    return [part.slice(0, index), value] as const;
  }));
}

export async function getSupabaseConfig(): Promise<RuntimeConfig | null> {
  const { env } = await import("cloudflare:workers");
  const runtime = env as unknown as Record<string, string | undefined>;
  const url = runtime.SUPABASE_URL?.replace(/\/$/, "") || "";
  const publishableKey = runtime.SUPABASE_PUBLISHABLE_KEY || runtime.SUPABASE_ANON_KEY || "";
  const adminKey = runtime.SUPABASE_SECRET_KEY || runtime.SUPABASE_SERVICE_ROLE_KEY || "";
  return url && publishableKey && adminKey ? { url, publishableKey, adminKey } : null;
}

async function authRequest<T>(config: RuntimeConfig, path: string, init: RequestInit = {}, key = config.publishableKey): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("apikey", key);
  if (!headers.has("content-type")) headers.set("content-type", "application/json");
  if (key.startsWith("eyJ") && !headers.has("Authorization")) headers.set("Authorization", `Bearer ${key}`);
  const response = await fetch(`${config.url}/auth/v1${path}`, {
    ...init,
    headers,
  });
  const data = await response.json().catch(() => ({})) as T & { message?: string; error_description?: string; msg?: string };
  if (!response.ok) throw new Error(data.message || data.error_description || data.msg || "Supabase Auth request failed");
  return data;
}

export function normalizeNickname(value: string) { return value.trim().toLowerCase(); }
export function validateNickname(value: string) { return /^[a-z0-9][a-z0-9_.!-]{2,23}$/i.test(value.trim()); }
export function validatePassword(value: string) { return value.length >= 8 && value.length <= 72; }
export function syntheticEmail() { return `member-${crypto.randomUUID()}@auth.ambr0s1a.team`; }

export async function signInWithPassword(email: string, password: string) {
  const config = await getSupabaseConfig();
  if (!config) throw new Error("Supabase is not configured");
  return authRequest<TokenPayload>(config, "/token?grant_type=password", { method: "POST", body: JSON.stringify({ email, password }) });
}

export async function createSupabaseUser(email: string, password: string, role: string) {
  const config = await getSupabaseConfig();
  if (!config) throw new Error("Supabase is not configured");
  const result = await authRequest<SupabaseUser | { user: SupabaseUser }>(config, "/admin/users", {
    method: "POST",
    body: JSON.stringify({ email, password, email_confirm: true, app_metadata: { team_role: role } }),
  }, config.adminKey);
  return "user" in result ? result.user : result;
}

export async function deleteSupabaseUser(userId: string) {
  const config = await getSupabaseConfig();
  if (!config) throw new Error("Supabase is not configured");
  return authRequest<Record<string, never>>(config, `/admin/users/${encodeURIComponent(userId)}`, {
    method: "DELETE",
  }, config.adminKey);
}

export async function updateSupabasePassword(accessToken: string, password: string) {
  const config = await getSupabaseConfig();
  if (!config) throw new Error("Supabase is not configured");
  return authRequest<{ user: SupabaseUser }>(config, "/user", {
    method: "PUT", headers: { Authorization: `Bearer ${accessToken}` }, body: JSON.stringify({ password }),
  });
}

async function verifyUser(config: RuntimeConfig, accessToken: string) {
  return authRequest<SupabaseUser>(config, "/user", { headers: { Authorization: `Bearer ${accessToken}` } });
}

async function refreshSession(config: RuntimeConfig, refreshToken: string) {
  return authRequest<TokenPayload>(config, "/token?grant_type=refresh_token", { method: "POST", body: JSON.stringify({ refresh_token: refreshToken }) });
}

export async function getTeamSession(request: Request): Promise<TeamSession | null> {
  const config = await getSupabaseConfig();
  if (!config) return null;
  const cookie = parseCookies(request);
  let accessToken = cookie.get(ACCESS_COOKIE) || "";
  let user: SupabaseUser | null = null;
  let refreshed: TokenPayload | undefined;
  if (accessToken) try { user = await verifyUser(config, accessToken); } catch { user = null; }
  if (!user && cookie.get(REFRESH_COOKIE)) {
    try {
      refreshed = await refreshSession(config, cookie.get(REFRESH_COOKIE)!);
      accessToken = refreshed.access_token;
      user = refreshed.user;
    } catch { return null; }
  }
  if (!user) return null;
  const db = await getDb();
  const [member] = await db.select().from(members).where(and(eq(members.authProviderId, user.id), eq(members.isActive, true))).limit(1);
  return member ? { member, accessToken, refreshed } : null;
}

function cookieLine(name: string, value: string, maxAge: number) {
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

export function withSessionCookies(response: Response, tokens?: TokenPayload) {
  if (!tokens) return response;
  response.headers.append("set-cookie", cookieLine(ACCESS_COOKIE, tokens.access_token, tokens.expires_in || 3600));
  response.headers.append("set-cookie", cookieLine(REFRESH_COOKIE, tokens.refresh_token, 60 * 60 * 24 * 30));
  return response;
}

export function clearSessionCookies(response: Response) {
  response.headers.append("set-cookie", cookieLine(ACCESS_COOKIE, "", 0));
  response.headers.append("set-cookie", cookieLine(REFRESH_COOKIE, "", 0));
  return response;
}

export function randomInviteToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function hashInviteToken(token: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}
