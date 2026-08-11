"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Dashboard, { WorkspaceUser } from "./Dashboard";

type SessionState = { configured: boolean; user: WorkspaceUser | null; needsBootstrap: boolean };

export default function WorkspaceGate() {
  const [state, setState] = useState<SessionState | null>(null);
  useEffect(() => { fetch("/api/auth/session", { cache: "no-store" }).then(r=>r.json()).then(setState).catch(()=>setState({ configured: false, user: null, needsBootstrap: false })); }, []);
  if (!state) return <main className="auth-shell"><section className="auth-card"><span className="section-label">LOADING</span><h1>Завантажуємо workspace…</h1></section></main>;
  if (!state.configured) return <main className="auth-shell"><section className="auth-card"><span className="section-label">CONFIGURATION</span><h1>Supabase ще не налаштовано</h1><p>Капітан має додати URL, відкритий і секретний ключі в налаштуваннях сайту.</p><Link className="action inline-action" href="/">На головну</Link></section></main>;
  if (state.needsBootstrap) return <main className="auth-shell"><section className="auth-card"><span className="section-label">FIRST RUN</span><h1>Створи акаунт капітана</h1><p>Це одноразовий крок перед запрошенням інших учасників.</p><Link className="action inline-action" href="/setup">Почати налаштування</Link></section></main>;
  if (!state.user) return <main className="auth-shell"><section className="auth-card"><span className="section-label">MEMBER ACCESS</span><h1>Увійди до workspace</h1><p>Робоча частина доступна учасникам команди за нікнеймом і паролем.</p><Link className="action inline-action" href="/login">Увійти</Link></section></main>;
  return <Dashboard user={state.user}/>;
}
