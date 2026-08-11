import { and, count, desc, eq, sql } from "drizzle-orm";
import { getDb } from "../../../db";
import { ctfdChallenges, ctfdIntegrations, ctfEvents, eventMembers, members, notifications, tasks } from "../../../db/schema";
import { getTeamSession } from "../../team-auth";

async function requireCaptain(request: Request) {
  const session = await getTeamSession(request);
  if (!session || session.member.role !== "captain") return null;
  return { session, db: await getDb() };
}

export async function GET(request: Request) {
  const session = await getTeamSession(request);
  if (!session) return Response.json({ error: "Authentication required" }, { status: 401 });
  const db = await getDb();
  const rows = await db.select().from(ctfEvents).orderBy(desc(ctfEvents.startsAt));
  return Response.json({ events: rows });
}

export async function POST(request: Request) {
  const identity = await requireCaptain(request);
  if (!identity) return Response.json({ error: "Captain access required" }, { status: 403 });
  const data = await request.json().catch(() => ({})) as { id?: string; name?: string; startsAt?: string; endsAt?: string; ctftimeUrl?: string };
  const name = data.name?.trim() || "";
  if (!data.id || !name || !data.startsAt) return Response.json({ error: "Name and start time are required" }, { status: 400 });
  const startsAt = new Date(data.startsAt);
  const endsAt = data.endsAt ? new Date(data.endsAt) : null;
  if (Number.isNaN(startsAt.getTime()) || (endsAt && Number.isNaN(endsAt.getTime()))) return Response.json({ error: "Некоректна дата CTF" }, { status: 400 });
  const ctftimeUrl = data.ctftimeUrl?.trim() || null;
  if (ctftimeUrl) {
    const [existing] = await identity.db.select({ id: ctfEvents.id }).from(ctfEvents).where(eq(ctfEvents.ctftimeUrl, ctftimeUrl)).limit(1);
    if (existing) return Response.json({ error: "Середовище для цього CTFtime-змагання вже створене" }, { status: 409 });
  }
  const status = startsAt.getTime() > Date.now() ? "upcoming" : "active";
  const [event] = await identity.db.insert(ctfEvents).values({ id: data.id, name, startsAt: startsAt.toISOString(), endsAt: endsAt?.toISOString() || null, ctftimeUrl, status, createdBy: identity.session.member.email }).returning();
  const startsKyiv = new Intl.DateTimeFormat("uk-UA", { timeZone: "Europe/Kyiv", dateStyle: "medium", timeStyle: "short" }).format(startsAt);
  await identity.db.insert(notifications).values({ actorEmail: identity.session.member.email, kind: "ctf_created", message: `${identity.session.member.displayName} створив середовище ${name} · старт ${startsKyiv} за Києвом` });
  return Response.json({ event }, { status: 201 });
}

export async function PATCH(request: Request) {
  const identity = await requireCaptain(request);
  if (!identity) return Response.json({ error: "Captain access required" }, { status: 403 });
  const data = await request.json().catch(() => ({})) as { id?: string; action?: "activate" | "pause" | "resume" | "archive"; place?: number; points?: number };
  if (!data.id || !data.action) return Response.json({ error: "Invalid event update" }, { status: 400 });
  const [event] = await identity.db.select().from(ctfEvents).where(eq(ctfEvents.id, data.id)).limit(1);
  if (!event) return Response.json({ error: "CTF not found" }, { status: 404 });
  if (data.action === "activate") {
    if (event.status !== "upcoming") return Response.json({ error: "Активувати можна лише майбутній CTF" }, { status: 409 });
    const [updated] = await identity.db.update(ctfEvents).set({ status: "active" }).where(eq(ctfEvents.id, data.id)).returning();
    await identity.db.insert(notifications).values({ actorEmail: identity.session.member.email, kind: "ctf_active", message: `${identity.session.member.displayName} активував ${event.name}` });
    return Response.json({ event: updated });
  }
  if (data.action === "pause") {
    if (event.status !== "active") return Response.json({ error: "Заморозити можна лише активний CTF" }, { status: 409 });
    const [updated] = await identity.db.update(ctfEvents).set({ status: "paused" }).where(eq(ctfEvents.id, data.id)).returning();
    await identity.db.insert(notifications).values({ actorEmail: identity.session.member.email, kind: "ctf_paused", message: `${identity.session.member.displayName} заморозив ${event.name}` });
    return Response.json({ event: updated });
  }
  if (data.action === "resume") {
    if (event.status !== "paused") return Response.json({ error: "Відновити можна лише заморожений CTF" }, { status: 409 });
    const [updated] = await identity.db.update(ctfEvents).set({ status: "active" }).where(eq(ctfEvents.id, data.id)).returning();
    await identity.db.insert(notifications).values({ actorEmail: identity.session.member.email, kind: "ctf_resumed", message: `${identity.session.member.displayName} відновив ${event.name}` });
    return Response.json({ event: updated });
  }
  if (event.status === "archived") return Response.json({ error: "CTF уже знаходиться в архіві" }, { status: 409 });
  const [stats] = await identity.db.select({
    attempts: count(),
    solves: sql<number>`sum(case when ${tasks.status} = 'solved' then 1 else 0 end)`,
    taskPoints: sql<number>`coalesce(sum(case when ${tasks.status} = 'solved' then ${tasks.points} else 0 end), 0)`,
    participants: sql<number>`count(distinct ${tasks.ownerEmail})`,
  }).from(tasks).where(and(eq(tasks.eventId, data.id), sql`${tasks.status} in ('solved','unsolved','progress','blocked')`));
  const [team] = await identity.db.select({ value: count() }).from(members);
  const [ctfd] = await identity.db.select().from(ctfdIntegrations).where(eq(ctfdIntegrations.eventId, data.id)).limit(1);
  const finalPoints = Number.isFinite(data.points) ? Number(data.points) : Number(ctfd?.teamScore || stats.taskPoints || 0);
  const [updated] = await identity.db.update(ctfEvents).set({
    status: "archived", finalPlace: data.place && data.place > 0 ? data.place : null, finalPoints,
    finalSolves: Number(ctfd?.solvedChallenges || stats.solves || 0), finalAttempts: Number(ctfd?.totalChallenges || stats.attempts || 0), finalMembers: Number(stats.participants || team.value),
    endsAt: new Date().toISOString(), archivedAt: new Date().toISOString(),
  }).where(eq(ctfEvents.id, data.id)).returning();
  await identity.db.insert(notifications).values({ actorEmail: identity.session.member.email, kind: "ctf_archived", message: `${identity.session.member.displayName} завершив ${event.name} — статистику заархівовано` });
  return Response.json({ event: updated });
}

export async function DELETE(request: Request) {
  const identity = await requireCaptain(request);
  if (!identity) return Response.json({ error: "Captain access required" }, { status: 403 });
  const data = await request.json().catch(() => ({})) as { id?: string };
  if (!data.id) return Response.json({ error: "CTF не вказано" }, { status: 400 });
  const [event] = await identity.db.select().from(ctfEvents).where(eq(ctfEvents.id, data.id)).limit(1);
  if (!event) return Response.json({ error: "CTF не знайдено" }, { status: 404 });
  if (event.status !== "archived") return Response.json({ error: "Видаляти можна лише CTF з архіву" }, { status: 409 });
  await identity.db.delete(ctfdChallenges).where(eq(ctfdChallenges.eventId, data.id));
  await identity.db.delete(ctfdIntegrations).where(eq(ctfdIntegrations.eventId, data.id));
  await identity.db.delete(tasks).where(eq(tasks.eventId, data.id));
  await identity.db.delete(eventMembers).where(eq(eventMembers.eventId, data.id));
  await identity.db.delete(ctfEvents).where(eq(ctfEvents.id, data.id));
  await identity.db.insert(notifications).values({ actorEmail: identity.session.member.email, kind: "ctf_deleted", message: `${identity.session.member.displayName} видалив архів ${event.name}` });
  return Response.json({ deleted: data.id });
}
