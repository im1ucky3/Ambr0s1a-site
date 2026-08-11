"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function AuthForm({ mode, token }: { mode: "login" | "setup" | "invite"; token?: string }) {
  const router = useRouter();
  const [nickname, setNickname] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const endpoint = mode === "login" ? "/api/auth/login" : mode === "setup" ? "/api/auth/bootstrap" : "/api/auth/accept-invite";
  const title = mode === "login" ? "Вхід до команди" : mode === "setup" ? "Створення акаунта капітана" : "Прийняти запрошення";
  const description = mode === "login" ? "Використай командний нікнейм і пароль." : mode === "setup" ? "Це одноразове налаштування першого робочого акаунта." : "Обери власний нікнейм і пароль для робочого середовища.";

  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const response = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ nickname, password, token }) });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "Не вдалося виконати дію");
      router.replace("/workspace"); router.refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Сталася помилка"); }
    finally { setBusy(false); }
  }

  return <main className="auth-shell">
    <Link className="auth-brand" href="/"><img src="/ambr0s1a-logo.jpg" alt=""/><span>Ambr0s1a!</span></Link>
    <section className="auth-card">
      <span className="section-label">TEAM ACCESS</span><h1>{title}</h1><p>{description}</p>
      <form onSubmit={submit}>
        <label>Нікнейм<input className="input" autoComplete="username" value={nickname} onChange={event=>setNickname(event.target.value)} placeholder="im1ucky" required/></label>
        <label>Пароль<input className="input" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} value={password} onChange={event=>setPassword(event.target.value)} placeholder="Щонайменше 8 символів" required minLength={8}/></label>
        {error&&<div className="auth-error" role="alert">{error}</div>}
        <button className="action" disabled={busy}>{busy ? "Зачекай…" : mode === "login" ? "Увійти" : "Створити акаунт"}</button>
      </form>
      {mode === "login"&&<small>Нові акаунти створюються лише через запрошення капітана.</small>}
    </section>
  </main>;
}
