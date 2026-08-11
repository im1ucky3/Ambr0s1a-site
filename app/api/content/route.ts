import { eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { siteContent } from "../../../db/schema";
import { getTeamSession } from "../../team-auth";
import { getSiteText } from "../../site-content";
import { siteTextDefinitions, SiteTextKey } from "../../site-text";

export async function GET() {
  return Response.json({ content: await getSiteText() });
}

export async function PUT(request: Request) {
  const session = await getTeamSession(request);
  if (!session || session.member.role !== "captain") return Response.json({ error: "Captain access required" }, { status: 403 });
  const data = await request.json().catch(() => ({})) as { content?: Partial<Record<SiteTextKey, string>> };
  const allowed = new Set(siteTextDefinitions.map(item => item.key));
  const entries = Object.entries(data.content || {}).filter(([key]) => allowed.has(key as SiteTextKey));
  if (!entries.length) return Response.json({ error: "Немає текстів для збереження" }, { status: 400 });
  if (entries.some(([, value]) => typeof value !== "string" || !value.trim() || value.length > 1000)) {
    return Response.json({ error: "Кожен напис має містити 1–1000 символів" }, { status: 400 });
  }
  const db = await getDb();
  for (const [key, value] of entries) {
    await db.insert(siteContent).values({ key, value: value.trim(), updatedBy: session.member.email }).onConflictDoUpdate({
      target: siteContent.key,
      set: { value: value.trim(), updatedBy: session.member.email, updatedAt: new Date().toISOString() },
    });
  }
  const content = await getSiteText();
  return Response.json({ content });
}

export async function DELETE(request: Request) {
  const session = await getTeamSession(request);
  if (!session || session.member.role !== "captain") return Response.json({ error: "Captain access required" }, { status: 403 });
  const db = await getDb();
  for (const definition of siteTextDefinitions) await db.delete(siteContent).where(eq(siteContent.key, definition.key));
  return Response.json({ content: await getSiteText() });
}
