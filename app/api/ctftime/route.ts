import { getTeamSession } from "../../team-auth";

const CTF_TIME_BASE = "https://ctftime.org/api/v1";
const TEAM_ID = 405490;

type RawEvent = {
  id: number;
  title: string;
  start: string;
  finish: string;
  format?: string;
  weight?: number;
  onsite?: boolean;
  ctftime_url?: string;
};

type RawRank = { team_name: string; points: number; team_id: number };
type RawTeam = {
  id: number;
  name: string;
  country: string;
  rating: Record<string, { rating_place?: number; country_place?: number; rating_points?: number }>;
};

async function ctftime<T>(path: string): Promise<T> {
  const response = await fetch(`${CTF_TIME_BASE}${path}`, {
    headers: {
      accept: "application/json",
      "user-agent": "Ambr0s1a-Team-Hub/1.0",
    },
  });
  if (!response.ok) throw new Error(`CTFtime відповів кодом ${response.status}`);
  return response.json() as Promise<T>;
}

function rankingForYear(payload: Record<string, RawRank[]>, year: string) {
  return Array.isArray(payload[year]) ? payload[year] : [];
}

export async function GET(request: Request) {
  const session = await getTeamSession(request);
  if (!session) return Response.json({ error: "Authentication required" }, { status: 401 });

  const now = Date.now();
  const year = String(new Date(now).getUTCFullYear());
  const start = Math.floor((now - 1000 * 60 * 60 * 24 * 180) / 1000);
  const finish = Math.floor((now + 1000 * 60 * 60 * 24 * 730) / 1000);

  try {
    const [events, globalTop, ukraineTop, team] = await Promise.all([
      ctftime<RawEvent[]>(`/events/?limit=1000&start=${start}&finish=${finish}`),
      ctftime<Record<string, RawRank[]>>(`/top/${year}/?limit=25`),
      ctftime<RawRank[]>(`/top-by-country/ua/?limit=25`),
      ctftime<RawTeam>(`/teams/${TEAM_ID}/`),
    ]);

    const normalized = (Array.isArray(events) ? events : []).map(event => ({
      id: event.id,
      title: event.title,
      start: event.start,
      finish: event.finish,
      format: event.format || "Jeopardy",
      weight: Number(event.weight || 0),
      onsite: Boolean(event.onsite),
      ctftimeUrl: event.ctftime_url || `https://ctftime.org/event/${event.id}/`,
    }));

    const upcoming = normalized
      .filter(event => new Date(event.start).getTime() >= now)
      .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
    const past = normalized
      .filter(event => new Date(event.finish).getTime() < now)
      .sort((a, b) => new Date(b.finish).getTime() - new Date(a.finish).getTime())
      .slice(0, 20);

    return Response.json({
      year,
      updatedAt: new Date().toISOString(),
      upcoming,
      past,
      global: rankingForYear(globalTop, year),
      ukraine: Array.isArray(ukraineTop) ? ukraineTop : [],
      team: {
        id: team.id,
        name: team.name,
        country: team.country,
        ratingPlace: team.rating?.[year]?.rating_place ?? null,
        countryPlace: team.rating?.[year]?.country_place ?? null,
        ratingPoints: team.rating?.[year]?.rating_points ?? 0,
      },
    }, { headers: { "cache-control": "private, max-age=0, s-maxage=900, stale-while-revalidate=3600" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Не вдалося завантажити CTFtime" }, { status: 502 });
  }
}
