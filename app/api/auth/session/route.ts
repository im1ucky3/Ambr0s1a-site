import { and, count, eq, isNotNull } from "drizzle-orm";
import { getDb } from "../../../../db";
import { members } from "../../../../db/schema";
import { getSupabaseConfig, getTeamSession, withSessionCookies } from "../../../team-auth";

export async function GET(request: Request) {
  const configured = Boolean(await getSupabaseConfig());
  if (!configured) return Response.json({ configured: false, user: null, needsBootstrap: false });
  const session = await getTeamSession(request);
  if (session) return withSessionCookies(Response.json({ configured: true, user: session.member, needsBootstrap: false }), session.refreshed);
  const db = await getDb();
  const [claimed] = await db
    .select({ value: count() })
    .from(members)
    .where(and(isNotNull(members.authProviderId), eq(members.isActive, true)));
  return Response.json({ configured: true, user: null, needsBootstrap: claimed.value === 0 });
}
