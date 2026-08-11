import { and, asc, count, eq, ne } from "drizzle-orm";
import { getDb } from "../../../db";
import { members, notifications } from "../../../db/schema";
import { deleteSupabaseUser, getTeamSession } from "../../team-auth";

export async function GET(request: Request) {
  const session = await getTeamSession(request);
  if (!session) return Response.json({ error: "Authentication required" }, { status: 401 });
  const db = await getDb();
  const rows = await db.select({ email: members.email, username: members.username, displayName: members.displayName, avatarKey: members.avatarKey, role: members.role, primaryCategory: members.primaryCategory, secondaryCategory: members.secondaryCategory }).from(members).where(eq(members.isActive, true)).orderBy(asc(members.displayName));
  return Response.json({ members: rows });
}

const roles = ["captain", "coordinator", "infra", "member"] as const;
const categories = ["WEB", "PWN", "REVERSE", "CRYPTO", "OSINT", "FORENSICS", "MISC"] as const;

export async function PATCH(request: Request) {
  const session = await getTeamSession(request);
  if (!session || session.member.role !== "captain") {
    return Response.json({ error: "Captain access required" }, { status: 403 });
  }

  const data = await request.json().catch(() => ({})) as {
    email?: string;
    role?: typeof roles[number];
    primaryCategory?: typeof categories[number];
    secondaryCategory?: typeof categories[number];
  };
  const email = data.email?.trim() || "";
  if (!email || !data.role || !data.primaryCategory || !data.secondaryCategory) {
    return Response.json({ error: "Укажіть учасника, роль і дві категорії" }, { status: 400 });
  }
  if (!roles.includes(data.role) || !categories.includes(data.primaryCategory) || !categories.includes(data.secondaryCategory)) {
    return Response.json({ error: "Некоректна роль або категорія" }, { status: 400 });
  }
  if (data.primaryCategory === data.secondaryCategory) {
    return Response.json({ error: "Primary і secondary мають відрізнятися" }, { status: 400 });
  }

  const db = await getDb();
  const [target] = await db.select().from(members).where(eq(members.email, email)).limit(1);
  if (!target) return Response.json({ error: "Учасника не знайдено" }, { status: 404 });

  if (target.role === "captain" && data.role !== "captain") {
    const [otherCaptains] = await db.select({ value: count() }).from(members).where(and(eq(members.role, "captain"), ne(members.email, email)));
    if (!otherCaptains?.value) return Response.json({ error: "У команді має залишитися щонайменше один капітан" }, { status: 400 });
  }

  const [member] = await db.update(members).set({
    role: data.role,
    primaryCategory: data.primaryCategory,
    secondaryCategory: data.secondaryCategory,
  }).where(eq(members.email, email)).returning();

  return Response.json({ member: {
    email: member.email,
    username: member.username,
    displayName: member.displayName,
    avatarKey: member.avatarKey,
    role: member.role,
    primaryCategory: member.primaryCategory,
    secondaryCategory: member.secondaryCategory,
  } });
}

export async function DELETE(request: Request) {
  const session = await getTeamSession(request);
  if (!session || session.member.role !== "captain") return Response.json({ error: "Captain access required" }, { status: 403 });
  const data = await request.json().catch(() => ({})) as { email?: string };
  const email = data.email?.trim() || "";
  if (!email) return Response.json({ error: "Учасника не вказано" }, { status: 400 });
  if (email === session.member.email) return Response.json({ error: "Не можна видалити власний активний акаунт" }, { status: 400 });
  const db = await getDb();
  const [target] = await db.select().from(members).where(and(eq(members.email, email), eq(members.isActive, true))).limit(1);
  if (!target) return Response.json({ error: "Учасника не знайдено" }, { status: 404 });
  if (target.role === "captain") {
    const [otherCaptains] = await db.select({ value: count() }).from(members).where(and(eq(members.role, "captain"), eq(members.isActive, true), ne(members.email, email)));
    if (!otherCaptains?.value) return Response.json({ error: "У команді має залишитися щонайменше один капітан" }, { status: 400 });
  }
  await db.update(members).set({ isActive: false }).where(eq(members.email, email));
  if (target.authProviderId) await deleteSupabaseUser(target.authProviderId).catch(() => undefined);
  await db.insert(notifications).values({ actorEmail: session.member.email, kind: "member_removed", message: `${session.member.displayName} видалив учасника ${target.displayName}` });
  return Response.json({ deleted: email });
}
