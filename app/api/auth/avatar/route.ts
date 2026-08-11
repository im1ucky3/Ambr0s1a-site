import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { members } from "../../../../db/schema";
import { getTeamSession, withSessionCookies } from "../../../team-auth";

type Bucket = {
  put(key: string, value: ReadableStream, options?: { httpMetadata?: { contentType?: string } }): Promise<unknown>;
  get(key: string): Promise<{ body: ReadableStream; httpMetadata?: { contentType?: string } } | null>;
  delete(key: string): Promise<unknown>;
};

async function getBucket() {
  const { env } = await import("cloudflare:workers");
  return (env as unknown as { BUCKET?: Bucket }).BUCKET || null;
}

function validSignature(type: string, bytes: Uint8Array) {
  if (type === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (type === "image/png") return bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  if (type === "image/webp") return String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  return false;
}

export async function GET(request: Request) {
  const session = await getTeamSession(request);
  if (!session) return new Response("Authentication required", { status: 401 });
  const email = new URL(request.url).searchParams.get("email") || session.member.email;
  const db = await getDb();
  const [member] = await db.select({ avatarKey: members.avatarKey }).from(members).where(eq(members.email, email)).limit(1);
  if (!member?.avatarKey) return new Response("Avatar not found", { status: 404 });
  const bucket = await getBucket();
  if (!bucket) return new Response("Avatar storage unavailable", { status: 503 });
  const object = await bucket.get(member.avatarKey);
  if (!object) return new Response("Avatar not found", { status: 404 });
  return new Response(object.body, { headers: { "content-type": object.httpMetadata?.contentType || "image/jpeg", "cache-control": "private, max-age=3600" } });
}

export async function POST(request: Request) {
  const session = await getTeamSession(request);
  if (!session) return Response.json({ error: "Authentication required" }, { status: 401 });
  const form = await request.formData();
  const file = form.get("avatar");
  if (!(file instanceof File)) return Response.json({ error: "Оберіть файл аватарки" }, { status: 400 });
  if (file.size < 1 || file.size > 3 * 1024 * 1024) return Response.json({ error: "Розмір аватарки має бути до 3 МБ" }, { status: 400 });
  const types = new Map([["image/jpeg", "jpg"], ["image/png", "png"], ["image/webp", "webp"]]);
  const extension = types.get(file.type);
  const signature = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  if (!extension || !validSignature(file.type, signature)) return Response.json({ error: "Підтримуються лише JPG, PNG і WebP" }, { status: 400 });
  const bucket = await getBucket();
  if (!bucket) return Response.json({ error: "Сховище аватарок ще не підключене" }, { status: 503 });
  const key = `avatars/${crypto.randomUUID()}.${extension}`;
  await bucket.put(key, file.stream(), { httpMetadata: { contentType: file.type } });
  const db = await getDb();
  const oldKey = session.member.avatarKey;
  const [member] = await db.update(members).set({ avatarKey: key }).where(eq(members.email, session.member.email)).returning();
  if (oldKey) await bucket.delete(oldKey).catch(() => undefined);
  return withSessionCookies(Response.json({ user: member }), session.refreshed);
}

export async function DELETE(request: Request) {
  const session = await getTeamSession(request);
  if (!session) return Response.json({ error: "Authentication required" }, { status: 401 });
  const db = await getDb();
  const [member] = await db.update(members).set({ avatarKey: null }).where(eq(members.email, session.member.email)).returning();
  const bucket = await getBucket();
  if (bucket && session.member.avatarKey) await bucket.delete(session.member.avatarKey).catch(() => undefined);
  return withSessionCookies(Response.json({ user: member }), session.refreshed);
}
