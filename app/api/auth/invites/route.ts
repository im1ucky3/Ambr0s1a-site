import { and, gt, isNull } from "drizzle-orm";
import { getDb } from "../../../../db";
import { teamInvites } from "../../../../db/schema";
import { getTeamSession, hashInviteToken, randomInviteToken } from "../../../team-auth";

const allowedRoles = new Set(["coordinator", "infra", "member"]);

export async function GET(request: Request) {
  const session = await getTeamSession(request);
  if (!session || session.member.role !== "captain") return Response.json({ error: "Captain access required" }, { status: 403 });
  const db = await getDb();
  const rows = await db.select({ id: teamInvites.id, role: teamInvites.role, expiresAt: teamInvites.expiresAt, acceptedAt: teamInvites.acceptedAt }).from(teamInvites)
    .where(and(isNull(teamInvites.acceptedAt), gt(teamInvites.expiresAt, new Date().toISOString())));
  return Response.json({ invites: rows });
}

export async function POST(request: Request) {
  const session = await getTeamSession(request);
  if (!session || session.member.role !== "captain") return Response.json({ error: "Captain access required" }, { status: 403 });
  const data = await request.json().catch(() => ({})) as { role?: string };
  const role = allowedRoles.has(data.role || "") ? data.role as "coordinator" | "infra" | "member" : "member";
  const token = randomInviteToken();
  const db = await getDb();
  await db.insert(teamInvites).values({ id: crypto.randomUUID(), tokenHash: await hashInviteToken(token), role, createdBy: session.member.email, expiresAt: new Date(Date.now() + 7 * 86400000).toISOString() });
  return Response.json({ invitePath: `/invite/${token}`, expiresInDays: 7 }, { status: 201 });
}
