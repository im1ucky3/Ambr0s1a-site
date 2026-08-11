import { eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { dashboardPreferences } from "../../../db/schema";
import { getTeamSession } from "../../team-auth";

const widgetIds = new Set(["ctfs", "tasks", "status", "my-tasks", "activity", "stats"]);
const defaultLayout = [
  { i: "ctfs", x: 0, y: 0, w: 12, h: 4 },
  { i: "tasks", x: 0, y: 4, w: 8, h: 11 },
  { i: "activity", x: 8, y: 4, w: 4, h: 11 },
  { i: "status", x: 0, y: 15, w: 12, h: 10 },
  { i: "my-tasks", x: 0, y: 25, w: 6, h: 7 },
  { i: "stats", x: 0, y: 32, w: 12, h: 4 },
];
const defaultConfig = {
  mode: "default" as const,
  gap: 8,
  widgets: [
    { id: "ctfs", size: "wide", visible: true },
    { id: "tasks", size: "wide", visible: true },
    { id: "status", size: "wide", visible: true },
    { id: "my-tasks", size: "half", visible: true },
    { id: "activity", size: "half", visible: true },
    { id: "stats", size: "wide", visible: true },
  ],
  layout: defaultLayout,
};

type GridItem = { i: string; x: number; y: number; w: number; h: number };
function collides(a: GridItem, b: GridItem) {
  return a.i !== b.i && a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function normalizeLayout(value: unknown) {
  const seen = new Set<string>();
  const rows = Array.isArray(value) ? value.flatMap(item => {
    if (!item || typeof item !== "object") return [];
    const row = item as Partial<GridItem>;
    if (typeof row.i !== "string" || !widgetIds.has(row.i) || seen.has(row.i)) return [];
    seen.add(row.i);
    const w = Math.min(12, Math.max(3, Math.round(Number(row.w) || 6)));
    const h = Math.min(30, Math.max(3, Math.round(Number(row.h) || 6)));
    const x = Math.min(12 - w, Math.max(0, Math.round(Number(row.x) || 0)));
    const y = Math.min(1000, Math.max(0, Math.round(Number(row.y) || 0)));
    return [{ i: row.i, x, y, w, h }];
  }) : [];
  for (const fallback of defaultLayout) if (!seen.has(fallback.i)) rows.push({ ...fallback });
  const placed: GridItem[] = [];
  for (const row of rows.sort((a, b) => a.y - b.y || a.x - b.x)) {
    const item = { ...row };
    while (placed.some(other => collides(item, other))) item.y += 1;
    placed.push(item);
  }
  return placed;
}

function normalizeConfig(value: unknown) {
  if (!value || typeof value !== "object") return defaultConfig;
  const source = value as { mode?: unknown; gap?: unknown; widgets?: unknown; layout?: unknown };
  const seen = new Set<string>();
  const widgets = Array.isArray(source.widgets) ? source.widgets.flatMap(item => {
    if (!item || typeof item !== "object") return [];
    const row = item as { id?: unknown; size?: unknown; visible?: unknown };
    if (typeof row.id !== "string" || !widgetIds.has(row.id) || seen.has(row.id)) return [];
    seen.add(row.id);
    return [{ id: row.id, size: row.size === "half" ? "half" : "wide", visible: row.visible !== false }];
  }) : [];
  for (const item of defaultConfig.widgets) if (!seen.has(item.id)) widgets.push(item);
  const requestedGap = Math.round(Number(source.gap));
  const gap = [0, 8, 16].includes(requestedGap) ? requestedGap : 8;
  return { mode: source.mode === "custom" ? "custom" as const : "default" as const, gap, widgets, layout: normalizeLayout(source.layout) };
}

export async function GET(request: Request) {
  const session = await getTeamSession(request);
  if (!session) return Response.json({ error: "Authentication required" }, { status: 401 });
  const db = await getDb();
  const [row] = await db.select().from(dashboardPreferences).where(eq(dashboardPreferences.memberEmail, session.member.email)).limit(1);
  if (!row) return Response.json({ preferences: defaultConfig });
  try { return Response.json({ preferences: normalizeConfig(JSON.parse(row.config)) }); }
  catch { return Response.json({ preferences: defaultConfig }); }
}

export async function PATCH(request: Request) {
  const session = await getTeamSession(request);
  if (!session) return Response.json({ error: "Authentication required" }, { status: 401 });
  const input = await request.json().catch(() => ({}));
  const preferences = normalizeConfig(input);
  const db = await getDb();
  await db.insert(dashboardPreferences).values({ memberEmail: session.member.email, config: JSON.stringify(preferences), updatedAt: new Date().toISOString() })
    .onConflictDoUpdate({ target: dashboardPreferences.memberEmail, set: { config: JSON.stringify(preferences), updatedAt: new Date().toISOString() } });
  return Response.json({ preferences });
}
