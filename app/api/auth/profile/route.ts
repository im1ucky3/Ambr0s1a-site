import { and, eq, ne } from "drizzle-orm";
import { getDb } from "../../../../db";
import { members } from "../../../../db/schema";
import { getTeamSession, normalizeNickname, updateSupabasePassword, validateNickname, validatePassword, withSessionCookies } from "../../../team-auth";

function normalizeNamePart(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function validNamePart(value: string) {
  return value.length === 0 || (/^[\p{L}][\p{L}'’ -]{0,59}$/u.test(value) && !/\s{2,}/.test(value));
}

export async function PATCH(request: Request) {
  const session = await getTeamSession(request);
  if (!session) return Response.json({ error: "Authentication required" }, { status: 401 });
  const data = await request.json().catch(() => ({})) as { nickname?: string; password?: string; lastName?: string; firstName?: string; patronymic?: string };
  const db = await getDb();
  let member = session.member;
  if (data.nickname !== undefined) {
    const nickname = normalizeNickname(data.nickname);
    if (!validateNickname(nickname)) return Response.json({ error: "Нікнейм: 3–24 символи, латиниця, цифри або _ . ! -" }, { status: 400 });
    const [duplicate] = await db.select().from(members).where(and(eq(members.username, nickname), ne(members.email, member.email))).limit(1);
    if (duplicate) return Response.json({ error: "Цей нікнейм уже зайнятий" }, { status: 409 });
    [member] = await db.update(members).set({ username: nickname, displayName: nickname }).where(eq(members.email, member.email)).returning();
  }
  if (data.password) {
    if (!validatePassword(data.password)) return Response.json({ error: "Пароль має містити 8–72 символи" }, { status: 400 });
    await updateSupabasePassword(session.accessToken, data.password);
  }
  if (data.lastName !== undefined || data.firstName !== undefined || data.patronymic !== undefined) {
    const lastName = normalizeNamePart(data.lastName || "");
    const firstName = normalizeNamePart(data.firstName || "");
    const patronymic = normalizeNamePart(data.patronymic || "");
    if (![lastName, firstName, patronymic].every(validNamePart)) {
      return Response.json({ error: "ПІБ може містити лише літери, пробіли, апостроф і дефіс" }, { status: 400 });
    }
    [member] = await db.update(members).set({
      lastName: lastName || null,
      firstName: firstName || null,
      patronymic: patronymic || null,
    }).where(eq(members.email, member.email)).returning();
  }
  return withSessionCookies(Response.json({ user: member }), session.refreshed);
}
