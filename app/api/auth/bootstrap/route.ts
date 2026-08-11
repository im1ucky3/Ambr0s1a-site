import { and, count, eq, isNotNull, isNull } from "drizzle-orm";
import { getDb } from "../../../../db";
import { members } from "../../../../db/schema";
import { getChatGPTUser } from "../../../chatgpt-auth";
import { createSupabaseUser, deleteSupabaseUser, normalizeNickname, signInWithPassword, syntheticEmail, validateNickname, validatePassword, withSessionCookies } from "../../../team-auth";

export async function POST(request: Request) {
  const owner = await getChatGPTUser();
  if (!owner) return Response.json({ error: "Початкове налаштування доступне власнику сайту" }, { status: 403 });
  const db = await getDb();
  const [claimed] = await db
    .select({ value: count() })
    .from(members)
    .where(and(isNotNull(members.authProviderId), eq(members.isActive, true)));
  if (claimed.value !== 0) return Response.json({ error: "Капітана вже створено" }, { status: 409 });
  const data = await request.json().catch(() => ({})) as { nickname?: string; password?: string };
  const nickname = normalizeNickname(data.nickname || "");
  if (!validateNickname(nickname)) return Response.json({ error: "Нікнейм: 3–24 символи, латиниця, цифри або _ . ! -" }, { status: 400 });
  if (!validatePassword(data.password || "")) return Response.json({ error: "Пароль має містити 8–72 символи" }, { status: 400 });

  const [ownerMember] = await db
    .select()
    .from(members)
    .where(and(eq(members.email, owner.email), isNull(members.authProviderId)))
    .limit(1);
  const [unclaimedCaptain] = ownerMember ? [] : await db
    .select()
    .from(members)
    .where(and(eq(members.role, "captain"), isNull(members.authProviderId)))
    .limit(1);
  const legacyMember = ownerMember || unclaimedCaptain;
  const [nicknameOwner] = await db
    .select({ email: members.email })
    .from(members)
    .where(eq(members.username, nickname))
    .limit(1);
  if (nicknameOwner && nicknameOwner.email !== legacyMember?.email) {
    return Response.json({ error: "Цей нікнейм уже використовується" }, { status: 409 });
  }

  const email = legacyMember?.email || syntheticEmail();
  let authUser: Awaited<ReturnType<typeof createSupabaseUser>>;
  try {
    authUser = await createSupabaseUser(email, data.password!, "captain");
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Не вдалося створити капітана" }, { status: 400 });
  }

  let member: typeof members.$inferSelect;
  try {
    [member] = legacyMember
      ? await db.update(members).set({ username: nickname, authProviderId: authUser.id, displayName: nickname, role: "captain" }).where(eq(members.email, legacyMember.email)).returning()
      : await db.insert(members).values({ email, username: nickname, authProviderId: authUser.id, displayName: nickname, role: "captain" }).returning();
  } catch (error) {
    await deleteSupabaseUser(authUser.id).catch(() => undefined);
    return Response.json({ error: error instanceof Error ? error.message : "Не вдалося зберегти профіль капітана" }, { status: 400 });
  }

  try {
    const tokens = await signInWithPassword(email, data.password!);
    return withSessionCookies(Response.json({ user: member }, { status: 201 }), tokens);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Акаунт створено, але автоматичний вхід не вдався" }, { status: 400 });
  }
}
