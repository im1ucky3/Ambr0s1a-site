import { and, eq, gt, isNull } from "drizzle-orm";
import { getDb } from "../../../../db";
import { members, teamInvites } from "../../../../db/schema";
import { createSupabaseUser, hashInviteToken, normalizeNickname, signInWithPassword, syntheticEmail, validateNickname, validatePassword, withSessionCookies } from "../../../team-auth";

export async function POST(request: Request) {
  const data = await request.json().catch(() => ({})) as { token?: string; nickname?: string; password?: string };
  const nickname = normalizeNickname(data.nickname || "");
  if (!data.token || !validateNickname(nickname)) return Response.json({ error: "Перевір посилання та нікнейм" }, { status: 400 });
  if (!validatePassword(data.password || "")) return Response.json({ error: "Пароль має містити 8–72 символи" }, { status: 400 });
  const db = await getDb();
  const [invite] = await db.select().from(teamInvites).where(and(eq(teamInvites.tokenHash, await hashInviteToken(data.token)), isNull(teamInvites.acceptedAt), gt(teamInvites.expiresAt, new Date().toISOString()))).limit(1);
  if (!invite) return Response.json({ error: "Запрошення недійсне або прострочене" }, { status: 404 });
  const [duplicate] = await db.select().from(members).where(eq(members.username, nickname)).limit(1);
  if (duplicate) return Response.json({ error: "Цей нікнейм уже зайнятий" }, { status: 409 });
  const email = syntheticEmail();
  try {
    const authUser = await createSupabaseUser(email, data.password!, invite.role);
    const [member] = await db.insert(members).values({ email, username: nickname, authProviderId: authUser.id, displayName: nickname, role: invite.role }).returning();
    await db.update(teamInvites).set({ acceptedAt: new Date().toISOString(), invitedUsername: nickname }).where(eq(teamInvites.id, invite.id));
    const tokens = await signInWithPassword(email, data.password!);
    return withSessionCookies(Response.json({ user: member }, { status: 201 }), tokens);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Не вдалося створити акаунт" }, { status: 400 });
  }
}
