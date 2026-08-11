import { count, desc, eq, gt, sql } from "drizzle-orm";
import { getDb } from "../../../db";
import { ctfEvents, members, notifications } from "../../../db/schema";
import { getTeamSession } from "../../team-auth";

export async function GET(request: Request) {
  const session = await getTeamSession(request);
  if (!session) return Response.json({ error: "Authentication required" }, { status: 401 });
  const db = await getDb();
  const upcoming = await db.select().from(ctfEvents).where(eq(ctfEvents.status, "upcoming"));
  const now = Date.now();
  for (const event of upcoming) {
    const starts = new Date(event.startsAt).getTime();
    if (starts <= now || starts - now > 10 * 60_000) continue;
    const kind = `ctf_starting:${event.id}`;
    const [existing] = await db.select({ id: notifications.id }).from(notifications).where(eq(notifications.kind, kind)).limit(1);
    if (!existing) await db.insert(notifications).values({
      actorEmail: "system",
      kind,
      message: `${event.name} починається за 10 хвилин · ${new Intl.DateTimeFormat("uk-UA", { timeZone: "Europe/Kyiv", hour: "2-digit", minute: "2-digit" }).format(new Date(starts))} за Києвом`,
    });
  }
  const rows = await db.select().from(notifications).orderBy(desc(notifications.createdAt)).limit(100);
  const [unread] = session.member.notificationsReadAt
    ? await db.select({ value: count() }).from(notifications).where(gt(notifications.createdAt, session.member.notificationsReadAt))
    : [{ value: rows.length }];
  const reminders = upcoming.filter(event => new Date(event.startsAt).getTime() - now > 10 * 60_000).map((event, index) => {
    const starts = new Date(event.startsAt).getTime();
    return {
      id: -(index + 1), actorEmail: "system", kind: "ctf_schedule",
      message: `${event.name} починається ${new Intl.DateTimeFormat("uk-UA", { timeZone: "Europe/Kyiv", dateStyle: "medium", timeStyle: "short" }).format(new Date(starts))} за Києвом`,
      createdAt: new Date(now).toISOString(),
    };
  });
  return Response.json({ notifications: [...reminders, ...rows], unreadCount: Number(unread?.value || 0) });
}

export async function PATCH(request: Request) {
  const session = await getTeamSession(request);
  if (!session) return Response.json({ error: "Authentication required" }, { status: 401 });
  const db = await getDb();
  await db.update(members).set({ notificationsReadAt: sql`CURRENT_TIMESTAMP` }).where(eq(members.email, session.member.email));
  return Response.json({ unreadCount: 0 });
}
