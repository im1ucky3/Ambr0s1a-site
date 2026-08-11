import { and, desc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { ctfdChallenges, ctfEvents, notifications, tasks } from "../../../db/schema";
import { getTeamSession } from "../../team-auth";

const categories = new Set(["WEB", "PWN", "REVERSE", "CRYPTO", "OSINT", "FORENSICS", "MISC"]);

export async function GET(request: Request) {
  const session = await getTeamSession(request);
  if (!session) return Response.json({ error: "Authentication required" }, { status: 401 });
  const db = await getDb();
  const rows = await db.select().from(tasks).orderBy(desc(tasks.createdAt)).limit(300);
  return Response.json({ tasks: rows });
}

export async function POST(request: Request) {
  const session = await getTeamSession(request);
  if (!session) return Response.json({ error: "Authentication required" }, { status: 401 });
  const data = await request.json().catch(() => ({})) as { id?: string; eventId?: string; title?: string; category?: string; ctfdChallengeId?: string; sourceTaskId?: string };
  let title = data.title?.trim().replace(/\s+/g, " ") || "";
  let category = data.category?.toUpperCase() || "";
  if (!data.id || !data.eventId) return Response.json({ error: "Invalid task" }, { status: 400 });
  const db = await getDb();
  const [event] = await db.select({ status: ctfEvents.status }).from(ctfEvents).where(eq(ctfEvents.id, data.eventId)).limit(1);
  if (!event || event.status !== "active") return Response.json({ error: "Таски можна додавати лише до активного CTF" }, { status: 409 });
  let ctfdChallengeId: string | null = null;
  let points: number | null = null;
  let retrying = false;
  if (data.sourceTaskId) {
    const [source] = await db.select().from(tasks).where(and(eq(tasks.id, data.sourceTaskId), eq(tasks.eventId, data.eventId))).limit(1);
    if (!source || source.status !== "unsolved") return Response.json({ error: "Повторно можна взяти лише невиконану таску" }, { status: 409 });
    title = source.title;
    category = source.category;
    points = source.points;
    ctfdChallengeId = source.ctfdChallengeId;
    retrying = true;
  }
  if (data.ctfdChallengeId) {
    const [challenge] = await db.select().from(ctfdChallenges).where(and(eq(ctfdChallenges.id, data.ctfdChallengeId), eq(ctfdChallenges.eventId, data.eventId))).limit(1);
    if (!challenge) return Response.json({ error: "Завдання CTFd не знайдено" }, { status: 404 });
    if (challenge.solved) return Response.json({ error: "Це завдання вже виконано командою" }, { status: 409 });
    const claimed = await db.select({ status: tasks.status }).from(tasks).where(eq(tasks.ctfdChallengeId, challenge.id));
    if (claimed.some(task => task.status !== "unsolved")) return Response.json({ error: "Це завдання CTFd уже взяв інший учасник" }, { status: 409 });
    if (claimed.length) retrying = true;
    title = challenge.name;
    category = challenge.category;
    points = challenge.value;
    ctfdChallengeId = challenge.id;
  }
  if (!title || title.length > 180 || !categories.has(category)) return Response.json({ error: "Invalid task" }, { status: 400 });
  const existing = await db.select({ title: tasks.title }).from(tasks).where(eq(tasks.eventId, data.eventId));
  const normalizedTitle = title.toLocaleLowerCase("uk-UA");
  if (!retrying && existing.some(task => task.title.trim().replace(/\s+/g, " ").toLocaleLowerCase("uk-UA") === normalizedTitle)) {
    return Response.json({ error: `Таска «${title}» уже існує в цьому CTF` }, { status: 409 });
  }
  if (retrying && (await db.select({ title: tasks.title, status: tasks.status }).from(tasks).where(eq(tasks.eventId, data.eventId))).some(task => task.status !== "unsolved" && task.title.trim().replace(/\s+/g, " ").toLocaleLowerCase("uk-UA") === normalizedTitle)) {
    return Response.json({ error: `Таска «${title}» уже виконується або виконана` }, { status: 409 });
  }
  const [task] = await db.insert(tasks).values({ id: data.id, eventId: data.eventId, title, category, ownerEmail: session.member.email, ownerName: session.member.displayName, points, ctfdChallengeId }).returning();
  await db.insert(notifications).values({ actorEmail: session.member.email, kind: retrying ? "reclaimed" : "claimed", message: `${session.member.displayName} ${retrying ? "повторно взяв" : "взяв"} таску ${title}` });
  return Response.json({ task }, { status: 201 });
}

export async function PATCH(request: Request) {
  const session = await getTeamSession(request);
  if (!session) return Response.json({ error: "Authentication required" }, { status: 401 });
  const data = await request.json().catch(() => ({})) as { id?: string; status?: "solved" | "unsolved" | "blocked" | "progress"; points?: number };
  if (!data.id || !data.status || !["solved", "unsolved", "blocked", "progress"].includes(data.status)) return Response.json({ error: "Invalid update" }, { status: 400 });
  const db = await getDb();
  const [task] = await db.select().from(tasks).where(eq(tasks.id, data.id)).limit(1);
  if (!task) return Response.json({ error: "Task not found" }, { status: 404 });
  if (task.ownerEmail !== session.member.email && session.member.role !== "captain") return Response.json({ error: "Only the owner or captain can close this task" }, { status: 403 });
  const points = data.status === "solved" && Number.isFinite(data.points) && Number(data.points) >= 0 ? Math.round(Number(data.points)) : task.points;
  const [updated] = await db.update(tasks).set({ status: data.status, points, closedAt: ["solved", "unsolved"].includes(data.status) ? new Date().toISOString() : null }).where(eq(tasks.id, data.id)).returning();
  const label = data.status === "solved" ? `успішно закрив ${task.title}${points ? ` — ${points} pts` : ""}` : data.status === "unsolved" ? `завершив ${task.title} як невиконану` : `змінив ${task.title} → ${data.status.toUpperCase()}`;
  await db.insert(notifications).values({ actorEmail: session.member.email, kind: data.status, message: `${session.member.displayName} ${label}` });
  return Response.json({ task: updated });
}

export async function DELETE(request: Request) {
  const session = await getTeamSession(request);
  if (!session || session.member.role !== "captain") return Response.json({ error: "Видаляти записи може лише капітан" }, { status: 403 });
  const data = await request.json().catch(() => ({})) as { id?: string };
  if (!data.id) return Response.json({ error: "Таску не вказано" }, { status: 400 });
  const db = await getDb();
  const [task] = await db.select().from(tasks).where(eq(tasks.id, data.id)).limit(1);
  if (!task) return Response.json({ error: "Таску не знайдено" }, { status: 404 });
  await db.delete(tasks).where(eq(tasks.id, task.id));
  await db.insert(notifications).values({ actorEmail: session.member.email, kind: "task_deleted", message: `${session.member.displayName} видалив запис таски ${task.title}` });
  return Response.json({ deleted: task.id });
}
