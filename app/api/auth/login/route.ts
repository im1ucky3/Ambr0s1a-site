import { and, eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { members } from "../../../../db/schema";
import { normalizeNickname, signInWithPassword, validatePassword, withSessionCookies } from "../../../team-auth";

export async function POST(request: Request) {
  const data = await request.json().catch(() => ({})) as { nickname?: string; password?: string };
  const nickname = normalizeNickname(data.nickname || "");
  if (!nickname || !validatePassword(data.password || "")) return Response.json({ error: "Неправильний нікнейм або пароль" }, { status: 401 });
  const db = await getDb();
  const [member] = await db.select().from(members).where(and(eq(members.username, nickname), eq(members.isActive, true))).limit(1);
  if (!member) return Response.json({ error: "Неправильний нікнейм або пароль" }, { status: 401 });
  try {
    const tokens = await signInWithPassword(member.email, data.password!);
    return withSessionCookies(Response.json({ user: member }), tokens);
  } catch {
    return Response.json({ error: "Неправильний нікнейм або пароль" }, { status: 401 });
  }
}
