import { clearSessionCookies } from "../../../team-auth";
export async function POST() { return clearSessionCookies(Response.json({ ok: true })); }
