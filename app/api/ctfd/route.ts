import { and, eq, sql } from "drizzle-orm";
import { getDb } from "../../../db";
import { ctfdChallenges, ctfdIntegrations, ctfEvents, notifications, tasks } from "../../../db/schema";
import { decryptCtfdToken, encryptCtfdToken } from "../../ctfd-crypto";
import { getTeamSession } from "../../team-auth";

type RemoteChallenge = {
  id: number;
  name: string;
  category?: string;
  value?: number;
  solves?: number;
  solved_by_me?: boolean;
};

function normalizeBaseUrl(raw: string) {
  let value: URL;
  try { value = new URL(raw.trim()); } catch { throw new Error("Вкажіть коректну адресу CTFd"); }
  if (value.protocol !== "https:") throw new Error("Для підключення CTFd потрібна HTTPS-адреса");
  if (value.username || value.password || value.search || value.hash) throw new Error("Адреса CTFd не повинна містити логін, пароль або параметри");
  const hostname = value.hostname.toLowerCase();
  const blockedName = hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local") || hostname.endsWith(".internal");
  const ipv4 = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)?.slice(1).map(Number);
  const blockedIp = ipv4 && (ipv4.some(part => part > 255) || ipv4[0] === 10 || ipv4[0] === 127 || ipv4[0] === 0 || (ipv4[0] === 169 && ipv4[1] === 254) || (ipv4[0] === 172 && ipv4[1] >= 16 && ipv4[1] <= 31) || (ipv4[0] === 192 && ipv4[1] === 168));
  if (blockedName || blockedIp || hostname.includes(":")) throw new Error("Цю адресу CTFd не можна підключити");
  value.pathname = value.pathname.replace(/\/+$/, "");
  return value.toString().replace(/\/$/, "");
}

function categoryName(value?: string) {
  const category = (value || "MISC").trim().toUpperCase();
  if (category.includes("WEB")) return "WEB";
  if (category.includes("PWN") || category.includes("BINARY")) return "PWN";
  if (category.includes("REV")) return "REVERSE";
  if (category.includes("CRYPT")) return "CRYPTO";
  if (category.includes("OSINT")) return "OSINT";
  if (category.includes("FORENS")) return "FORENSICS";
  return "MISC";
}

async function fetchChallenges(baseUrl: string, token: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(`${baseUrl}/api/v1/challenges`, {
      headers: { Authorization: `Token ${token}`, Accept: "application/json" },
      redirect: "error",
      signal: controller.signal,
    });
    const body = await response.json().catch(() => ({})) as { success?: boolean; data?: unknown; message?: string };
    if (!response.ok || body.success === false) {
      if (response.status === 401 || response.status === 403) throw new Error("CTFd відхилив токен або не надав доступ до завдань");
      throw new Error(body.message || `CTFd відповів з помилкою ${response.status}`);
    }
    if (!Array.isArray(body.data)) throw new Error("CTFd повернув невідомий формат списку завдань");
    return body.data.slice(0, 1000).flatMap(item => {
      if (!item || typeof item !== "object") return [];
      const row = item as Partial<RemoteChallenge>;
      const id = Math.round(Number(row.id));
      const name = typeof row.name === "string" ? row.name.trim() : "";
      if (!Number.isFinite(id) || id < 0 || !name) return [];
      return [{
        externalId: id,
        name: name.slice(0, 180),
        category: categoryName(row.category),
        value: Math.max(0, Math.round(Number(row.value) || 0)),
        solveCount: Math.max(0, Math.round(Number(row.solves) || 0)),
        solved: row.solved_by_me === true,
      }];
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw new Error("CTFd не відповів протягом 12 секунд");
    throw error;
  } finally { clearTimeout(timer); }
}

async function responseData(eventId: string) {
  const db = await getDb();
  const [integration] = await db.select({
    eventId: ctfdIntegrations.eventId,
    baseUrl: ctfdIntegrations.baseUrl,
    teamScore: ctfdIntegrations.teamScore,
    totalChallenges: ctfdIntegrations.totalChallenges,
    solvedChallenges: ctfdIntegrations.solvedChallenges,
    lastSyncAt: ctfdIntegrations.lastSyncAt,
    lastError: ctfdIntegrations.lastError,
  }).from(ctfdIntegrations).where(eq(ctfdIntegrations.eventId, eventId)).limit(1);
  const challenges = integration ? await db.select().from(ctfdChallenges).where(eq(ctfdChallenges.eventId, eventId)) : [];
  const categories = challenges.reduce<Record<string, { total: number; solved: number; points: number }>>((result, challenge) => {
    const current = result[challenge.category] || { total: 0, solved: 0, points: 0 };
    current.total += 1;
    if (challenge.solved) { current.solved += 1; current.points += challenge.value; }
    result[challenge.category] = current;
    return result;
  }, {});
  return { eventId, integration: integration || null, challenges, categories };
}

async function persistChallenges(eventId: string, remote: Awaited<ReturnType<typeof fetchChallenges>>, actorEmail: string, actorName: string) {
  const db = await getDb();
  const previous = await db.select({ id: ctfdChallenges.id, solved: ctfdChallenges.solved }).from(ctfdChallenges).where(eq(ctfdChallenges.eventId, eventId));
  const previouslySolved = new Set(previous.filter(item => item.solved).map(item => item.id));
  const now = new Date().toISOString();
  const rows = remote.map(challenge => ({ id: `${eventId}:${challenge.externalId}`, eventId, ...challenge, updatedAt: now }));
  await db.delete(ctfdChallenges).where(eq(ctfdChallenges.eventId, eventId));
  for (let index = 0; index < rows.length; index += 100) await db.insert(ctfdChallenges).values(rows.slice(index, index + 100));
  const solvedRows = rows.filter(row => row.solved);
  for (const challenge of solvedRows) {
    await db.update(tasks).set({ status: "solved", points: challenge.value, closedAt: now })
      .where(and(eq(tasks.ctfdChallengeId, challenge.id), eq(tasks.eventId, eventId), sql`${tasks.status} in ('progress','blocked')`));
  }
  const teamScore = solvedRows.reduce((sum, row) => sum + row.value, 0);
  await db.update(ctfdIntegrations).set({
    teamScore,
    totalChallenges: rows.length,
    solvedChallenges: solvedRows.length,
    lastSyncAt: now,
    lastError: null,
  }).where(eq(ctfdIntegrations.eventId, eventId));
  const newSolves = solvedRows.filter(row => !previouslySolved.has(row.id));
  if (newSolves.length) await db.insert(notifications).values({
    actorEmail,
    kind: "ctfd_solved",
    message: `${actorName} синхронізував CTFd: ${newSolves.length} нових solved · +${newSolves.reduce((sum, row) => sum + row.value, 0)} pts`,
  });
}

export async function GET(request: Request) {
  const session = await getTeamSession(request);
  if (!session) return Response.json({ error: "Authentication required" }, { status: 401 });
  const eventId = new URL(request.url).searchParams.get("eventId") || "";
  if (!eventId) return Response.json({ error: "CTF не вказано" }, { status: 400 });
  return Response.json(await responseData(eventId));
}

export async function POST(request: Request) {
  const session = await getTeamSession(request);
  if (!session) return Response.json({ error: "Authentication required" }, { status: 401 });
  const data = await request.json().catch(() => ({})) as { action?: "connect" | "sync"; eventId?: string; baseUrl?: string; token?: string };
  if (!data.eventId || !data.action) return Response.json({ error: "Некоректний запит CTFd" }, { status: 400 });
  const db = await getDb();
  const [event] = await db.select().from(ctfEvents).where(eq(ctfEvents.id, data.eventId)).limit(1);
  if (!event) return Response.json({ error: "CTF не знайдено" }, { status: 404 });

  if (data.action === "connect") {
    if (session.member.role !== "captain") return Response.json({ error: "Підключати CTFd може лише капітан" }, { status: 403 });
    const token = data.token?.trim() || "";
    if (!token || token.length > 1000) return Response.json({ error: "Вкажіть API-токен CTFd" }, { status: 400 });
    try {
      const baseUrl = normalizeBaseUrl(data.baseUrl || "");
      const remote = await fetchChallenges(baseUrl, token);
      const tokenCiphertext = await encryptCtfdToken(token);
      await db.insert(ctfdIntegrations).values({ eventId: event.id, baseUrl, tokenCiphertext, connectedBy: session.member.email })
        .onConflictDoUpdate({ target: ctfdIntegrations.eventId, set: { baseUrl, tokenCiphertext, connectedBy: session.member.email, lastError: null } });
      await persistChallenges(event.id, remote, session.member.email, session.member.displayName);
      await db.insert(notifications).values({ actorEmail: session.member.email, kind: "ctfd_connected", message: `${session.member.displayName} підключив CTFd до ${event.name}` });
      return Response.json(await responseData(event.id));
    } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Не вдалося підключити CTFd" }, { status: 502 }); }
  }

  const [integration] = await db.select().from(ctfdIntegrations).where(eq(ctfdIntegrations.eventId, event.id)).limit(1);
  if (!integration) return Response.json({ error: "CTFd ще не підключено" }, { status: 404 });
  if (integration.lastSyncAt && Date.now() - new Date(integration.lastSyncAt).getTime() < 15_000) return Response.json(await responseData(event.id));
  try {
    const token = await decryptCtfdToken(integration.tokenCiphertext);
    const remote = await fetchChallenges(integration.baseUrl, token);
    await persistChallenges(event.id, remote, session.member.email, session.member.displayName);
    return Response.json(await responseData(event.id));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не вдалося синхронізувати CTFd";
    await db.update(ctfdIntegrations).set({ lastError: message }).where(eq(ctfdIntegrations.eventId, event.id));
    return Response.json({ error: message }, { status: 502 });
  }
}

export async function DELETE(request: Request) {
  const session = await getTeamSession(request);
  if (!session || session.member.role !== "captain") return Response.json({ error: "Captain access required" }, { status: 403 });
  const data = await request.json().catch(() => ({})) as { eventId?: string };
  if (!data.eventId) return Response.json({ error: "CTF не вказано" }, { status: 400 });
  const db = await getDb();
  await db.update(tasks).set({ ctfdChallengeId: null }).where(eq(tasks.eventId, data.eventId));
  await db.delete(ctfdChallenges).where(eq(ctfdChallenges.eventId, data.eventId));
  await db.delete(ctfdIntegrations).where(eq(ctfdIntegrations.eventId, data.eventId));
  await db.insert(notifications).values({ actorEmail: session.member.email, kind: "ctfd_disconnected", message: `${session.member.displayName} відключив CTFd` });
  return Response.json({ disconnected: data.eventId });
}
