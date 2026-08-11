"use client";

/* eslint-disable @next/next/no-html-link-for-pages */

import { FormEvent, useEffect, useState } from "react";
import GridLayout, { WidthProvider, type Layout } from "react-grid-layout/legacy";
import "react-grid-layout/css/styles.css";
import { siteTextDefaults, siteTextDefinitions, SiteTextKey } from "../site-text";

export type WorkspaceUser = {
  email: string; username: string | null; displayName: string; role: "captain" | "coordinator" | "infra" | "member";
  primaryCategory: string; secondaryCategory: string; lastName: string | null; firstName: string | null; patronymic: string | null; avatarKey: string | null;
};
type TaskStatus = "progress" | "blocked" | "solved" | "unsolved";
type Task = { id: string; eventId: string | null; ctfdChallengeId: string | null; title: string; category: string; ownerEmail: string; ownerName: string; status: TaskStatus; points: number | null; createdAt: string; closedAt: string | null };
type CtfEvent = { id: string; name: string; ctftimeUrl: string | null; startsAt: string; endsAt: string | null; status: "upcoming" | "active" | "paused" | "archived"; finalPlace: number | null; finalPoints: number; finalSolves: number; finalAttempts: number; finalMembers: number };
type Member = Pick<WorkspaceUser, "email" | "username" | "displayName" | "avatarKey" | "role" | "primaryCategory" | "secondaryCategory">;
type Notice = { id: number; message: string; kind: string; createdAt: string };
type CtfTimeEvent = { id: number; title: string; start: string; finish: string; format: string; weight: number; onsite: boolean; ctftimeUrl: string };
type CtfTimeRank = { team_name: string; points: number; team_id: number };
type CtfTimeData = {
  year: string; updatedAt: string; upcoming: CtfTimeEvent[]; past: CtfTimeEvent[]; global: CtfTimeRank[]; ukraine: CtfTimeRank[];
  team: { id: number; name: string; country: string; ratingPlace: number | null; countryPlace: number | null; ratingPoints: number };
};
type CtfdChallenge = { id: string; eventId: string; externalId: number; name: string; category: string; value: number; solveCount: number; solved: boolean; updatedAt: string };
type CtfdData = {
  eventId: string;
  integration: null | { eventId: string; baseUrl: string; teamScore: number; totalChallenges: number; solvedChallenges: number; lastSyncAt: string | null; lastError: string | null };
  challenges: CtfdChallenge[];
  categories: Record<string, { total: number; solved: number; points: number }>;
};
type DashboardWidgetId = "ctfs" | "tasks" | "status" | "my-tasks" | "activity" | "stats";
type DashboardWidget = { id: DashboardWidgetId; size: "wide" | "half"; visible: boolean };
type DashboardGridItem = { i: DashboardWidgetId; x: number; y: number; w: number; h: number };
type DashboardPreferences = { mode: "default" | "custom"; gap: number; widgets: DashboardWidget[]; layout: DashboardGridItem[] };

const nav = [
  ["overview", "⌂", "Огляд"], ["ctfs", "◎", "CTF середовища"], ["ctftime", "◈", "CTFtime"],
  ["upcoming", "◷", "Майбутні CTF"], ["tasks", "⚑", "Активні таски"],
  ["roles", "⌘", "Учасники"], ["history", "✓", "Виконані"], ["archive", "▣", "Архів CTF"],
  ["notifications", "◉", "Сповіщення"], ["writeups", "▤", "Writeups"], ["content", "✎", "Тексти сайту"],
];
const navTextKeys: Record<string, SiteTextKey> = {
  overview:"workspace.nav.overview", ctfs:"workspace.nav.ctfs", ctftime:"workspace.nav.ctftime", upcoming:"workspace.nav.upcoming",
  tasks:"workspace.nav.tasks", roles:"workspace.nav.members", history:"workspace.nav.history", archive:"workspace.nav.archive",
  notifications:"workspace.nav.notifications", writeups:"workspace.nav.writeups", content:"workspace.nav.content",
};
const categories = ["WEB", "PWN", "REVERSE", "CRYPTO", "OSINT", "FORENSICS", "MISC"];
const roleLabels = { captain: "Captain", coordinator: "CTF Coordinator", infra: "Knowledge / Infra", member: "Member" };
const widgetLabels: Record<DashboardWidgetId, string> = {
  ctfs: "Активні CTF", tasks: "Активні таски", status: "Статуси тасок", "my-tasks": "Мої таски", activity: "Активність команди", stats: "Статистика",
};
const PersonalGrid = WidthProvider(GridLayout);
const defaultDashboardLayout: DashboardGridItem[] = [
  { i: "ctfs", x: 0, y: 0, w: 12, h: 4 }, { i: "tasks", x: 0, y: 4, w: 8, h: 11 },
  { i: "activity", x: 8, y: 4, w: 4, h: 11 }, { i: "status", x: 0, y: 15, w: 12, h: 10 },
  { i: "my-tasks", x: 0, y: 25, w: 6, h: 7 }, { i: "stats", x: 0, y: 32, w: 12, h: 4 },
];
const defaultDashboardPreferences: DashboardPreferences = {
  mode: "default",
  gap: 8,
  widgets: [
    { id: "ctfs", size: "wide", visible: true }, { id: "tasks", size: "wide", visible: true },
    { id: "status", size: "wide", visible: true }, { id: "my-tasks", size: "half", visible: true },
    { id: "activity", size: "half", visible: true }, { id: "stats", size: "wide", visible: true },
  ],
  layout: defaultDashboardLayout,
};

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { "content-type": "application/json", ...init?.headers }, cache: "no-store" });
  const data = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(data.error || "Не вдалося виконати дію");
  return data;
}

function apiDate(value: string) {
  return new Date(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value) ? `${value.replace(" ", "T")}Z` : value);
}

function kyivDateTime(value: string | Date) {
  return new Intl.DateTimeFormat("uk-UA", { timeZone: "Europe/Kyiv", dateStyle: "medium", timeStyle: "short" }).format(typeof value === "string" ? apiDate(value) : value);
}

function ago(value: string) {
  const seconds = Math.max(0, Math.floor((Date.now() - apiDate(value).getTime()) / 1000));
  if (seconds < 60) return "щойно"; if (seconds < 3600) return `${Math.floor(seconds / 60)} хв тому`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} год тому`;
  return new Intl.DateTimeFormat("uk-UA", { timeZone: "Europe/Kyiv" }).format(apiDate(value));
}

function avatarUrl(member: { email: string; avatarKey: string | null }) {
  return member.avatarKey ? `/api/auth/avatar?email=${encodeURIComponent(member.email)}&v=${encodeURIComponent(member.avatarKey)}` : "";
}

export default function Dashboard({ user }: { user: WorkspaceUser }) {
  const [profile, setProfile] = useState(user);
  const [tab, setTab] = useState("overview");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [events, setEvents] = useState<CtfEvent[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [siteText, setSiteText] = useState<Record<SiteTextKey, string>>({ ...siteTextDefaults });
  const [contentSaving, setContentSaving] = useState(false);
  const [dashboardPreferences, setDashboardPreferences] = useState<DashboardPreferences>(defaultDashboardPreferences);
  const [dashboardEditing, setDashboardEditing] = useState(false);
  const [dashboardDirty, setDashboardDirty] = useState(false);
  const [dashboardSaving, setDashboardSaving] = useState(false);
  const [ctfdData, setCtfdData] = useState<CtfdData | null>(null);
  const [ctfdUrl, setCtfdUrl] = useState("");
  const [ctfdToken, setCtfdToken] = useState("");
  const [ctfdBusy, setCtfdBusy] = useState(false);
  const [ctfdCategory, setCtfdCategory] = useState("ALL");
  const [selectedEventId, setSelectedEventId] = useState("");
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("WEB");
  const [newName, setNewName] = useState("");
  const [newStart, setNewStart] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [ctfSearch, setCtfSearch] = useState("");
  const [creatingCtfTimeId, setCreatingCtfTimeId] = useState<number | null>(null);
  const [inviteRole, setInviteRole] = useState("member");
  const [inviteUrl, setInviteUrl] = useState("");
  const [accountNickname, setAccountNickname] = useState(user.username || user.displayName);
  const [accountPassword, setAccountPassword] = useState("");
  const [accountLastName, setAccountLastName] = useState(user.lastName || "");
  const [accountFirstName, setAccountFirstName] = useState(user.firstName || "");
  const [accountPatronymic, setAccountPatronymic] = useState(user.patronymic || "");
  const [ctftimeData, setCtfTimeData] = useState<CtfTimeData | null>(null);
  const [ctftimeStatus, setCtfTimeStatus] = useState<"idle" | "ready" | "error">("idle");
  const [ctftimeError, setCtfTimeError] = useState("");
  const [memberSaving, setMemberSaving] = useState("");
  const [memberDeleting, setMemberDeleting] = useState("");
  const [memberDirty, setMemberDirty] = useState<Record<string, boolean>>({});
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const isCaptain = profile.role === "captain";
  const t = (key: SiteTextKey) => siteText[key] || siteTextDefaults[key];

  useEffect(() => {
    let current = true;
    Promise.all([
      api<{ events: CtfEvent[] }>("/api/events"), api<{ tasks: Task[] }>("/api/tasks"),
      api<{ members: Member[] }>("/api/members"), api<{ notifications: Notice[]; unreadCount: number }>("/api/notifications"),
      api<{ content: Record<SiteTextKey, string> }>("/api/content"), api<{ preferences: DashboardPreferences }>("/api/dashboard-preferences"),
    ]).then(([eventData, taskData, memberData, noticeData, contentData, preferenceData]) => {
      if (!current) return;
      setEvents(eventData.events); setTasks(taskData.tasks); setMembers(memberData.members); setNotices(noticeData.notifications); setUnreadCount(noticeData.unreadCount); setSiteText(contentData.content);
      setDashboardPreferences(preferenceData.preferences);
      setSelectedEventId(eventData.events.find(event => event.status === "active")?.id || eventData.events[0]?.id || "");
    }).catch(error => { if (current) setMessage(error instanceof Error ? error.message : "Не вдалося завантажити workspace"); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, []);

  useEffect(() => {
    if ((tab !== "ctftime" && !showCreate) || ctftimeStatus !== "idle") return;
    let current = true;
    api<CtfTimeData>("/api/ctftime")
      .then(data => { if (current) { setCtfTimeData(data); setCtfTimeStatus("ready"); } })
      .catch(error => { if (current) { setCtfTimeError(error instanceof Error ? error.message : "Не вдалося завантажити CTFtime"); setCtfTimeStatus("error"); } });
    return () => { current = false; };
  }, [tab, showCreate, ctftimeStatus]);

  useEffect(() => {
    if (tab !== "notifications" || unreadCount === 0) return;
    let current = true;
    api<{ unreadCount: number }>("/api/notifications", { method: "PATCH", body: "{}" })
      .then(data => { if (current) setUnreadCount(data.unreadCount); })
      .catch(() => undefined);
    return () => { current = false; };
  }, [tab, unreadCount]);

  useEffect(() => {
    if (tab !== "overview" || loading) return;
    let current = true;
    Promise.all([
      api<{ events: CtfEvent[] }>("/api/events"), api<{ tasks: Task[] }>("/api/tasks"),
      api<{ members: Member[] }>("/api/members"), api<{ notifications: Notice[]; unreadCount: number }>("/api/notifications"),
    ]).then(([eventData, taskData, memberData, noticeData]) => {
      if (!current) return;
      setEvents(eventData.events); setTasks(taskData.tasks); setMembers(memberData.members); setNotices(noticeData.notifications); setUnreadCount(noticeData.unreadCount);
      setSelectedEventId(selected => selected || eventData.events.find(event => event.status === "active")?.id || eventData.events[0]?.id || "");
    }).catch(() => undefined);
    return () => { current = false; };
  }, [tab, loading]);

  useEffect(() => {
    const timer = window.setInterval(() => { void refreshNotices().catch(() => undefined); }, 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const activeEvents = events.filter(event => event.status === "active");
  const activeEvent = activeEvents.find(event => event.id === selectedEventId) || activeEvents[0];
  const selectedEvent = events.find(event => event.id === selectedEventId) || activeEvent || events[0];
  const eventTasks = tasks.filter(task => task.eventId === activeEvent?.id);
  const active = eventTasks.filter(task => task.status === "progress" || task.status === "blocked");
  const liveSolves = activeEvent ? tasks.filter(task => task.eventId === activeEvent.id && task.status === "solved") : [];
  const liveAttempts = activeEvent ? tasks.filter(task => task.eventId === activeEvent.id) : [];
  const livePoints = liveSolves.reduce((sum, task) => sum + (task.points || 0), 0);
  const retryableTasks = activeEvent ? tasks.filter(task => task.eventId === activeEvent.id && task.status === "unsolved").filter((task, index, rows) => {
    const normalized = task.title.trim().replace(/\s+/g, " ").toLocaleLowerCase("uk-UA");
    const hasCurrent = tasks.some(other => other.eventId === task.eventId && other.id !== task.id && other.status !== "unsolved" && other.title.trim().replace(/\s+/g, " ").toLocaleLowerCase("uk-UA") === normalized);
    return !hasCurrent && rows.findIndex(other => other.title.trim().replace(/\s+/g, " ").toLocaleLowerCase("uk-UA") === normalized) === index;
  }) : [];
  const ctfdContextId = tab === "ctfs" ? selectedEvent?.id : activeEvent?.id;

  useEffect(() => {
    if (!ctfdContextId || !["ctfs", "tasks", "overview"].includes(tab)) return;
    let current = true;
    api<CtfdData>(`/api/ctfd?eventId=${encodeURIComponent(ctfdContextId)}`)
      .then(data => { if (current) { setCtfdData(data); setCtfdUrl(data.integration?.baseUrl || ""); } })
      .catch(() => { if (current) setCtfdData(null); });
    return () => { current = false; };
  }, [ctfdContextId, tab]);

  async function addTask(event: FormEvent) {
    event.preventDefault(); if (!title.trim() || !activeEvent) return;
    try {
      const data = await api<{ task: Task }>("/api/tasks", { method: "POST", body: JSON.stringify({ id: crypto.randomUUID(), eventId: activeEvent.id, title: title.trim(), category }) });
      setTasks(current => [data.task, ...current]); setTitle(""); await refreshNotices();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Не вдалося взяти таску"); }
  }

  async function connectCtfd(event: FormEvent, ctf: CtfEvent) {
    event.preventDefault();
    if (!ctfdUrl.trim() || !ctfdToken.trim()) return;
    setCtfdBusy(true);
    try {
      const data = await api<CtfdData>("/api/ctfd", { method: "POST", body: JSON.stringify({ action: "connect", eventId: ctf.id, baseUrl: ctfdUrl, token: ctfdToken }) });
      setCtfdData(data); setCtfdToken(""); setMessage(`CTFd підключено до ${ctf.name}`); await refreshNotices();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Не вдалося підключити CTFd"); }
    finally { setCtfdBusy(false); }
  }

  async function syncCtfd(ctf: CtfEvent) {
    setCtfdBusy(true);
    try {
      const data = await api<CtfdData>("/api/ctfd", { method: "POST", body: JSON.stringify({ action: "sync", eventId: ctf.id }) });
      setCtfdData(data);
      const taskData = await api<{ tasks: Task[] }>("/api/tasks");
      setTasks(taskData.tasks); setMessage(`CTFd синхронізовано · ${data.integration?.solvedChallenges || 0} solved · ${data.integration?.teamScore || 0} pts`); await refreshNotices();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Не вдалося синхронізувати CTFd"); }
    finally { setCtfdBusy(false); }
  }

  async function disconnectCtfd(ctf: CtfEvent) {
    if (!window.confirm(`Відключити CTFd від ${ctf.name}? Імпортовані дані буде видалено, але взяті таски залишаться.`)) return;
    setCtfdBusy(true);
    try {
      await api<{ disconnected: string }>("/api/ctfd", { method: "DELETE", body: JSON.stringify({ eventId: ctf.id }) });
      setCtfdData({ eventId: ctf.id, integration: null, challenges: [], categories: {} }); setCtfdToken(""); setMessage("CTFd відключено"); await refreshNotices();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Не вдалося відключити CTFd"); }
    finally { setCtfdBusy(false); }
  }

  async function claimCtfdChallenge(ctf: CtfEvent, challenge: CtfdChallenge) {
    try {
      const data = await api<{ task: Task }>("/api/tasks", { method: "POST", body: JSON.stringify({ id: crypto.randomUUID(), eventId: ctf.id, ctfdChallengeId: challenge.id }) });
      setTasks(current => [data.task, ...current]); setMessage(`Таску ${challenge.name} взято`); await refreshNotices();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Не вдалося взяти таску CTFd"); }
  }

  async function retryTask(task: Task) {
    if (!task.eventId) return;
    try {
      const data = await api<{ task: Task }>("/api/tasks", { method: "POST", body: JSON.stringify({ id: crypto.randomUUID(), eventId: task.eventId, sourceTaskId: task.id }) });
      setTasks(current => [data.task, ...current]); setMessage(`Таску ${task.title} повторно взято`); await refreshNotices();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Не вдалося повторно взяти таску"); }
  }

  async function deleteTaskRecord(task: Task) {
    if (!window.confirm(`Видалити запис «${task.title}» зі статусом ${task.status.toUpperCase()}? Цю дію неможливо скасувати.`)) return;
    try {
      await api<{ deleted: string }>("/api/tasks", { method: "DELETE", body: JSON.stringify({ id: task.id }) });
      setTasks(current => current.filter(item => item.id !== task.id)); setMessage(`Запис ${task.title} видалено`); await refreshNotices();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Не вдалося видалити запис таски"); }
  }

  async function closeTask(task: Task, status: "solved" | "unsolved") {
    let points: number | undefined;
    if (status === "solved") {
      const value = window.prompt("Скільки балів принесла таска? Залиш порожнім, якщо невідомо.", task.points ? String(task.points) : "");
      if (value !== null && value.trim()) points = Math.max(0, Number(value) || 0);
    }
    try {
      const data = await api<{ task: Task }>("/api/tasks", { method: "PATCH", body: JSON.stringify({ id: task.id, status, points }) });
      setTasks(current => current.map(item => item.id === task.id ? data.task : item)); await refreshNotices();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Не вдалося закрити таску"); }
  }

  async function createCtf(event: FormEvent) {
    event.preventDefault();
    try {
      const data = await api<{ event: CtfEvent }>("/api/events", { method: "POST", body: JSON.stringify({ id: crypto.randomUUID(), name: newName.trim(), startsAt: new Date(newStart).toISOString() }) });
      setEvents(current => [data.event, ...current]); setSelectedEventId(data.event.id); setNewName(""); setNewStart(""); setShowCreate(false); await refreshNotices();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Не вдалося створити CTF"); }
  }

  async function createCtfFromCtfTime(ctf: CtfTimeEvent) {
    setCreatingCtfTimeId(ctf.id);
    try {
      const data = await api<{ event: CtfEvent }>("/api/events", { method: "POST", body: JSON.stringify({
        id: crypto.randomUUID(),
        name: ctf.title,
        startsAt: ctf.start,
        endsAt: ctf.finish,
        ctftimeUrl: ctf.ctftimeUrl,
      }) });
      setEvents(current => [data.event, ...current]);
      setSelectedEventId(data.event.id);
      setShowCreate(false);
      setCtfSearch("");
      setMessage(`Середовище ${ctf.title} створено`);
      await refreshNotices();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не вдалося створити CTF");
    } finally {
      setCreatingCtfTimeId(null);
    }
  }

  async function updateCtf(id: string, action: "activate" | "pause" | "resume" | "archive") {
    const payload: { id: string; action: string; place?: number; points?: number } = { id, action };
    if (action === "archive") {
      const eventPoints = tasks.filter(task => task.eventId === id && task.status === "solved").reduce((sum, task) => sum + (task.points || 0), 0);
      const place = window.prompt("Фінальне місце (можна залишити порожнім):", "");
      const points = window.prompt("Фінальні бали команди:", String(eventPoints));
      if (place?.trim()) payload.place = Math.max(1, Number(place) || 1);
      if (points?.trim()) payload.points = Math.max(0, Number(points) || 0);
      if (!window.confirm("Завершити CTF і зафіксувати статистику в архіві?")) return;
    }
    if (action === "pause" && !window.confirm("Тимчасово заморозити цей CTF? Нові таски не можна буде брати до відновлення.")) return;
    try {
      const data = await api<{ event: CtfEvent }>("/api/events", { method: "PATCH", body: JSON.stringify(payload) });
      setEvents(current => current.map(event => event.id === id ? data.event : event));
      setSelectedEventId(id); setTab(action === "archive" ? "archive" : action === "pause" ? "ctfs" : "overview"); await refreshNotices();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Не вдалося оновити CTF"); }
  }

  async function deleteArchivedCtf(event: CtfEvent) {
    if (!window.confirm(`Назавжди видалити ${event.name} з архіву разом з усіма його тасками? Цю дію неможливо скасувати.`)) return;
    try {
      await api<{ deleted: string }>("/api/events", { method: "DELETE", body: JSON.stringify({ id: event.id }) });
      setEvents(current => current.filter(item => item.id !== event.id));
      setTasks(current => current.filter(task => task.eventId !== event.id));
      const nextArchived = events.find(item => item.status === "archived" && item.id !== event.id);
      setSelectedEventId(nextArchived?.id || "");
      setMessage(`${event.name} видалено з архіву`);
      await refreshNotices();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Не вдалося видалити CTF з архіву"); }
  }

  async function refreshNotices() {
    const data = await api<{ notifications: Notice[]; unreadCount: number }>("/api/notifications"); setNotices(data.notifications); setUnreadCount(data.unreadCount);
  }

  async function createInvite() {
    try {
      const data = await api<{ invitePath: string }>("/api/auth/invites", { method: "POST", body: JSON.stringify({ role: inviteRole }) });
      setInviteUrl(`${window.location.origin}${data.invitePath}`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Не вдалося створити запрошення"); }
  }

  async function saveAccount(event: FormEvent) {
    event.preventDefault();
    try {
      const data = await api<{ user: WorkspaceUser }>("/api/auth/profile", { method: "PATCH", body: JSON.stringify({ nickname: accountNickname, password: accountPassword || undefined, lastName: accountLastName, firstName: accountFirstName, patronymic: accountPatronymic }) });
      setProfile(data.user); setAccountPassword(""); setMessage("Налаштування акаунта збережено");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Не вдалося оновити акаунт"); }
  }

  async function uploadAvatar(file?: File) {
    if (!file) return;
    setAvatarUploading(true);
    try {
      const form = new FormData(); form.set("avatar", file);
      const response = await fetch("/api/auth/avatar", { method: "POST", body: form });
      const data = await response.json().catch(() => ({})) as { user?: WorkspaceUser; error?: string };
      if (!response.ok || !data.user) throw new Error(data.error || "Не вдалося завантажити аватарку");
      setProfile(data.user);
      setMembers(current => current.map(member => member.email === data.user!.email ? { ...member, avatarKey: data.user!.avatarKey } : member));
      setMessage("Аватарку оновлено");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Не вдалося завантажити аватарку"); }
    finally { setAvatarUploading(false); }
  }

  async function removeAvatar() {
    setAvatarUploading(true);
    try {
      const data = await api<{ user: WorkspaceUser }>("/api/auth/avatar", { method: "DELETE", body: "{}" });
      setProfile(data.user);
      setMembers(current => current.map(member => member.email === data.user.email ? { ...member, avatarKey: null } : member));
      setMessage("Аватарку видалено");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Не вдалося видалити аватарку"); }
    finally { setAvatarUploading(false); }
  }

  function editMember(email: string, changes: Partial<Pick<Member, "role" | "primaryCategory" | "secondaryCategory">>) {
    setMembers(current => current.map(member => member.email === email ? { ...member, ...changes } : member));
    setMemberDirty(current => ({ ...current, [email]: true }));
  }

  async function saveMember(member: Member) {
    setMemberSaving(member.email);
    try {
      const data = await api<{ member: Member }>("/api/members", { method: "PATCH", body: JSON.stringify({
        email: member.email,
        role: member.role,
        primaryCategory: member.primaryCategory,
        secondaryCategory: member.secondaryCategory,
      }) });
      setMembers(current => current.map(item => item.email === member.email ? data.member : item));
      setMemberDirty(current => ({ ...current, [member.email]: false }));
      if (data.member.email === profile.email) setProfile(current => ({ ...current, role: data.member.role, primaryCategory: data.member.primaryCategory, secondaryCategory: data.member.secondaryCategory }));
      setMessage(`Налаштування ${data.member.displayName} збережено`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не вдалося оновити учасника");
    } finally {
      setMemberSaving("");
    }
  }

  async function deleteMember(member: Member) {
    if (!window.confirm(`Видалити ${member.displayName} з команди? Його акаунт буде деактивовано, але історія тасок збережеться.`)) return;
    setMemberDeleting(member.email);
    try {
      await api<{ deleted: string }>("/api/members", { method: "DELETE", body: JSON.stringify({ email: member.email }) });
      setMembers(current => current.filter(item => item.email !== member.email));
      setMessage(`${member.displayName} видалено з команди`);
      await refreshNotices();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Не вдалося видалити учасника"); }
    finally { setMemberDeleting(""); }
  }

  async function saveSiteText() {
    setContentSaving(true);
    try {
      const data = await api<{ content: Record<SiteTextKey, string> }>("/api/content", { method: "PUT", body: JSON.stringify({ content: siteText }) });
      setSiteText(data.content); setMessage("Тексти сайту збережено");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Не вдалося зберегти тексти"); }
    finally { setContentSaving(false); }
  }

  async function resetSiteText() {
    if (!window.confirm("Повернути всі тексти до початкових значень?")) return;
    setContentSaving(true);
    try {
      const data = await api<{ content: Record<SiteTextKey, string> }>("/api/content", { method: "DELETE", body: "{}" });
      setSiteText(data.content); setMessage("Початкові тексти відновлено");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Не вдалося відновити тексти"); }
    finally { setContentSaving(false); }
  }

  async function persistDashboard(preferences: DashboardPreferences, closeEditor = false) {
    setDashboardSaving(true);
    try {
      const data = await api<{ preferences: DashboardPreferences }>("/api/dashboard-preferences", { method: "PATCH", body: JSON.stringify(preferences) });
      setDashboardPreferences(data.preferences); setDashboardDirty(false); setMessage("Персональний огляд збережено");
      if (closeEditor) setDashboardEditing(false);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Не вдалося зберегти огляд"); }
    finally { setDashboardSaving(false); }
  }

  function setDashboardMode(mode: DashboardPreferences["mode"]) {
    const next = { ...dashboardPreferences, mode };
    setDashboardPreferences(next); setDashboardEditing(mode === "custom" && dashboardEditing);
    void persistDashboard(next);
  }

  function editDashboardWidget(id: DashboardWidgetId, patch: Partial<DashboardWidget>) {
    setDashboardPreferences(current => ({ ...current, mode: "custom", widgets: current.widgets.map(widget => widget.id === id ? { ...widget, ...patch } : widget) }));
    setDashboardDirty(true);
  }

  function resetCustomDashboard() {
    setDashboardPreferences({
      mode: "custom",
      gap: 8,
      widgets: defaultDashboardPreferences.widgets.map(widget => ({ ...widget })),
      layout: defaultDashboardLayout.map(item => ({ ...item })),
    });
    setDashboardDirty(true);
  }

  function applyDashboardGrid(layout: Layout) {
    setDashboardPreferences(current => ({
      ...current,
      mode: "custom",
      layout: current.layout.map(saved => {
        const next = layout.find(item => item.i === saved.i);
        return next ? { i: saved.i, x: next.x, y: next.y, w: next.w, h: next.h } : saved;
      }),
    }));
    setDashboardDirty(true);
  }

  function setDashboardGap(gap: number) {
    setDashboardPreferences(current => ({ ...current, mode: "custom", gap }));
    setDashboardDirty(true);
  }

  async function logout() { await fetch("/api/auth/logout", { method: "POST" }); window.location.href = "/login"; }

  const taskPanel = activeEvent ? <section className="panel">
    <div className="panel-head"><h3>{activeEvent.name} · Active tasks</h3><span>{active.length} IN PROGRESS</span></div>
    <form className="create-task" onSubmit={addTask}><input className="input" value={title} onChange={event=>setTitle(event.target.value)} placeholder="Назва таски, напр. shell-garden" aria-label="Назва нової таски"/><select className="select" value={category} onChange={event=>setCategory(event.target.value)} aria-label="Категорія">{categories.map(item=><option key={item}>{item}</option>)}</select><button className="action">+ Взяти таску</button></form>
    <div className="task-list">{active.map(task=><article className={`task-card ${task.status}`} key={task.id}><div><div className="task-title"><span className="cat-badge">{task.category}</span><strong>{task.title}</strong><span className="state-badge">{task.status.toUpperCase()}</span></div><div className="task-meta"><span>● {task.ownerName}</span><span>◷ {ago(task.createdAt)}</span></div></div>{(task.ownerEmail === profile.email || isCaptain)&&<div className="task-actions"><button className="solved" onClick={()=>closeTask(task,"solved")}>✓ Solved</button><button className="failed" onClick={()=>closeTask(task,"unsolved")}>Невиконано</button>{isCaptain&&<button className="delete-task" onClick={()=>deleteTaskRecord(task)}>Видалити</button>}</div>}</article>)}{!active.length&&<div className="empty-state"><strong>Активних тасок немає</strong>Візьми першу таску для цього CTF.</div>}</div>
    {retryableTasks.length>0&&<div className="retry-queue"><div className="retry-queue-head"><div><strong>Доступні повторно</strong><small>Невиконані таски, які може взяти будь-який учасник</small></div><b>{retryableTasks.length}</b></div><div>{retryableTasks.map(task=><article key={task.id}><span className="cat-badge">{task.category}</span><div><strong>{task.title}</strong><small>Попередня спроба: {task.ownerName} · {ago(task.closedAt || task.createdAt)}</small></div><button onClick={()=>retryTask(task)}>+ Взяти</button></article>)}</div></div>}
  </section> : <section className="panel"><div className="empty-state"><strong>Немає активного CTF</strong>{isCaptain ? "Створи або активуй робоче середовище." : "Капітан ще не активував змагання."}</div></section>;

  function taskStatusBoard(compact = false) {
    const statusEvent = activeEvent || (selectedEvent?.status === "paused" ? selectedEvent : undefined);
    if (!statusEvent) return <section className="panel"><div className="empty-state"><strong>Немає активного CTF</strong>Статуси завершеного CTF доступні у вкладці «Архів».</div></section>;
    const scopedTasks = tasks.filter(task => task.eventId === statusEvent.id);
    const groups: Array<{ key: string; title: string; tone: string; tasks: Task[] }> = [
      { key: "active", title: "IN PROGRESS / ACTIVE", tone: "active", tasks: scopedTasks.filter(task => task.status === "progress" || task.status === "blocked") },
      { key: "solved", title: "SOLVED", tone: "solved", tasks: scopedTasks.filter(task => task.status === "solved") },
      { key: "unsolved", title: "UNSOLVED", tone: "unsolved", tasks: scopedTasks.filter(task => task.status === "unsolved") },
    ];
    return <section className={`task-status-section ${compact?"compact":""}`}><div className="task-status-heading"><div><span className="section-label">TASK STATUS</span><h3>{statusEvent.name}</h3></div>{compact&&<button onClick={()=>setTab("history")}>Усі статуси →</button>}</div><div className="task-status-board">{groups.map(group=><section className={`task-status-column ${group.tone}`} key={group.key}><header><span>{group.title}</span><b>{group.tasks.length}</b></header><div>{group.tasks.slice(0,compact?3:100).map(task=><article className="status-task" key={task.id}><div><span className="cat-badge">{task.category}</span><small>{task.status.toUpperCase()}</small></div><strong>{task.title}</strong><p>● {task.ownerName} · {task.closedAt?ago(task.closedAt):ago(task.createdAt)}</p>{!compact&&(task.status==="progress"||task.status==="blocked")&&(task.ownerEmail===profile.email||isCaptain)&&<div className="status-task-actions"><button onClick={()=>closeTask(task,"solved")}>✓ Solved</button><button onClick={()=>closeTask(task,"unsolved")}>Unsolved</button></div>}{task.status==="solved"&&<em>{task.points?`${task.points} pts`:"Виконано"}</em>}{!compact&&isCaptain&&<button className="status-task-delete" onClick={()=>deleteTaskRecord(task)}>Видалити запис</button>}</article>)}{!group.tasks.length&&<div className="status-empty">Немає тасок</div>}{compact&&group.tasks.length>3&&<small className="status-more">+{group.tasks.length-3} ще</small>}</div></section>)}</div></section>;
  }

  function activeCtfSwitcher() {
    return <section className="active-ctf-switcher panel"><div className="panel-head"><div><h3>Активні CTF</h3><p>Перемикай контекст — усі середовища працюють паралельно.</p></div><span>{activeEvents.length} ACTIVE</span></div>{activeEvents.length?<div className="active-ctf-tabs">{activeEvents.map(event=>{const scoped=tasks.filter(task=>task.eventId===event.id);const open=scoped.filter(task=>task.status==="progress"||task.status==="blocked").length;const solved=scoped.filter(task=>task.status==="solved").length;return <button className={activeEvent?.id===event.id?"selected":""} key={event.id} onClick={()=>setSelectedEventId(event.id)}><span><b>{event.name}</b><small>{new Date(event.startsAt).toLocaleDateString("uk-UA")} · {open} active · {solved} solved</small></span><em>{activeEvent?.id===event.id?"У ФОКУСІ":"ВІДКРИТИ"}</em></button>})}</div>:<div className="empty-state compact"><strong>Немає активних CTF</strong>Активуй одне або кілька середовищ у вкладці «CTF середовища».</div>}</section>;
  }

  function myTasksPanel() {
    const activeIds = new Set(activeEvents.map(event => event.id));
    const mine = tasks.filter(task => task.ownerEmail === profile.email && task.eventId && activeIds.has(task.eventId) && (task.status === "progress" || task.status === "blocked"));
    return <section className="panel my-tasks-panel"><div className="panel-head"><h3>Мої таски</h3><span>{mine.length} OPEN</span></div><div className="my-task-list">{mine.slice(0,8).map(task=>{const ctf=events.find(event=>event.id===task.eventId);return <button key={task.id} onClick={()=>{if(task.eventId)setSelectedEventId(task.eventId);setTab("tasks")}}><span className="cat-badge">{task.category}</span><span><strong>{task.title}</strong><small>{ctf?.name || "CTF"} · {ago(task.createdAt)}</small></span><em>→</em></button>})}{!mine.length&&<div className="empty-state compact"><strong>Вільно</strong>У тебе немає активних тасок у поточних CTF.</div>}</div></section>;
  }

  function overviewStats() {
    return <div className="stat-strip"><Stat label="SOLVED" value={String(liveSolves.length)} note={activeEvent?.name || "current CTF"}/><Stat label="TEAM POINTS" value={livePoints.toLocaleString("uk-UA")} note="live total"/><Stat label="ACTIVE MEMBERS" value={String(new Set(liveAttempts.map(task=>task.ownerEmail)).size)} note="task owners"/><Stat label="ATTEMPTS" value={String(liveAttempts.length)} note="all claimed"/></div>;
  }

  function overviewWidget(id: DashboardWidgetId) {
    if (id === "ctfs") return activeCtfSwitcher();
    if (id === "tasks") return taskPanel;
    if (id === "status") return taskStatusBoard(true);
    if (id === "my-tasks") return myTasksPanel();
    if (id === "activity") return <Activity notices={notices}/>;
    return overviewStats();
  }

  function overviewView() {
    const visibleWidgets = dashboardPreferences.widgets.filter(widget => widget.visible);
    const gridLayout = dashboardPreferences.layout
      .filter(item => visibleWidgets.some(widget => widget.id === item.i))
      .map(item => ({ ...item, minW: 3, minH: 3, maxW: 12 }));
    return <div className="overview-space">
      <section className="overview-toolbar">
        <div className="overview-toolbar-copy"><span className="section-label">PERSONAL WORKSPACE</span><h3>{dashboardPreferences.mode === "default" ? "Основний" : "Мій простір"}</h3><p>{dashboardPreferences.mode === "default" ? "Базовий вигляд команди без персональних змін." : "Персональний порядок і набір робочих віджетів."}</p></div>
        <div className="overview-controls"><div className="view-switch"><button className={dashboardPreferences.mode==="default"?"active":""} onClick={()=>setDashboardMode("default")}>Основний</button><button className={dashboardPreferences.mode==="custom"?"active":""} onClick={()=>setDashboardMode("custom")}>Мій простір</button></div><button className="customize-dashboard" onClick={()=>{if(dashboardPreferences.mode==="default")setDashboardMode("custom");setDashboardEditing(value=>!value)}}>⚙ {dashboardEditing?"Закрити":"Налаштувати"}</button></div>
      </section>
      {dashboardEditing&&<section className="dashboard-editor panel"><div className="panel-head"><div><h3>Конструктор огляду</h3><p>Перетягуй віджети за верхню ручку та змінюй розмір за край або кут.</p></div><span>ДЛЯ {profile.displayName.toUpperCase()}</span></div><div className="dashboard-density"><strong>Відстань між віджетами</strong><div>{[{gap:0,label:"Впритул"},{gap:8,label:"Щільно"},{gap:16,label:"Вільно"}].map(option=><button className={dashboardPreferences.gap===option.gap?"active":""} key={option.gap} onClick={()=>setDashboardGap(option.gap)}>{option.label}</button>)}</div></div><div className="dashboard-editor-list">{dashboardPreferences.widgets.map(widget=><div key={widget.id}><label><input type="checkbox" checked={widget.visible} onChange={event=>editDashboardWidget(widget.id,{visible:event.target.checked})}/><span><strong>{widgetLabels[widget.id]}</strong><small>{widget.visible?"Показується в огляді":"Приховано"}</small></span></label></div>)}</div><footer><button onClick={resetCustomDashboard}>Повернути стандартний вигляд</button><button className="action" disabled={!dashboardDirty||dashboardSaving} onClick={()=>persistDashboard({...dashboardPreferences,mode:"custom"},true)}>{dashboardSaving?"Збереження…":"Зберегти й завершити редагування"}</button></footer></section>}
      {dashboardPreferences.mode==="default"?<div className="overview-default">{activeCtfSwitcher()}<div className="dashboard-grid">{taskPanel}<Activity notices={notices}/></div>{taskStatusBoard(true)}{overviewStats()}</div>:<>{visibleWidgets.length?<PersonalGrid key={dashboardEditing?"dashboard-edit":"dashboard-view"} className={`personal-dashboard-grid ${dashboardEditing?"editing":"viewing"}`} layout={gridLayout} cols={12} rowHeight={34} margin={[dashboardPreferences.gap,dashboardPreferences.gap]} containerPadding={[0,0]} compactType="vertical" preventCollision={false} allowOverlap={false} isDraggable={dashboardEditing} isResizable={dashboardEditing} isBounded draggableHandle=".widget-drag-handle" resizeHandles={dashboardEditing?["se","e","s"]:[]} onDragStop={dashboardEditing?applyDashboardGrid:undefined} onResizeStop={dashboardEditing?applyDashboardGrid:undefined}>{visibleWidgets.map(widget=><div className="dashboard-grid-widget" key={widget.id}><div className="widget-drag-handle"><span aria-hidden="true">⠿</span><strong>{widgetLabels[widget.id]}</strong><small>ПЕРЕТЯГНУТИ</small></div><div className="dashboard-grid-widget-body">{overviewWidget(widget.id)}</div></div>)}</PersonalGrid>:<section className="panel dashboard-empty"><div className="empty-state"><strong>Огляд порожній</strong>Відкрий «Налаштувати» та додай потрібні віджети.</div></section>}</>}
    </div>;
  }

  function ctfdPanel(ctf: CtfEvent, compact = false) {
    const data = ctfdData?.eventId === ctf.id ? ctfdData : null;
    if (!data) return <section className="panel"><div className="empty-state compact"><strong>Завантаження CTFd…</strong>Перевіряємо підключення для цього середовища.</div></section>;
    if (!data?.integration) return <section className="panel ctfd-connect-panel"><div className="panel-head"><div><h3>Підключення CTFd</h3><p>{ctf.name} · імпорт тасок, solved-статусів і балів</p></div><span>NOT CONNECTED</span></div>{isCaptain?<form className="ctfd-connect-form" onSubmit={event=>connectCtfd(event,ctf)}><label>HTTPS-адреса CTFd<input className="input" type="url" value={ctfdUrl} onChange={event=>setCtfdUrl(event.target.value)} placeholder="https://ctf.example.org" required/></label><label>API-токен<input className="input" type="password" autoComplete="off" value={ctfdToken} onChange={event=>setCtfdToken(event.target.value)} placeholder="Токен з налаштувань CTFd" required/></label><button className="action" disabled={ctfdBusy}>{ctfdBusy?"Перевірка…":"Підключити й синхронізувати"}</button><small>Токен шифрується на сервері та не надсилається учасникам команди.</small></form>:<div className="empty-state compact"><strong>CTFd ще не підключено</strong>Підключення може створити капітан команди.</div>}</section>;
    const integration = data.integration;
    const availableCategories = ["ALL", ...Object.keys(data.categories).sort()];
    const filtered = data.challenges.filter(challenge => ctfdCategory === "ALL" || challenge.category === ctfdCategory).sort((a,b) => Number(a.solved)-Number(b.solved) || a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
    return <section className={`panel ctfd-sync-panel ${compact?"compact":""}`}><div className="ctfd-sync-head"><div><span className="ctfd-live-dot"/> <strong>CTFd підключено</strong><a href={integration.baseUrl} target="_blank" rel="noreferrer">{new URL(integration.baseUrl).hostname} ↗</a><small>{integration.lastSyncAt?`Оновлено ${ago(integration.lastSyncAt)}`:"Очікує першої синхронізації"}</small></div><div><button onClick={()=>syncCtfd(ctf)} disabled={ctfdBusy}>{ctfdBusy?"Синхронізація…":"↻ Синхронізувати"}</button>{isCaptain&&<button className="ctfd-disconnect" onClick={()=>disconnectCtfd(ctf)} disabled={ctfdBusy}>Відключити API</button>}</div></div>{integration.lastError&&<div className="ctfd-error">{integration.lastError}</div>}<div className="ctfd-metrics"><Stat label="УСІ ТАСКИ" value={String(integration.totalChallenges)} note="CTFd catalog"/><Stat label="SOLVED" value={String(integration.solvedChallenges)} note={`${integration.totalChallenges?Math.round(integration.solvedChallenges/integration.totalChallenges*100):0}% success`}/><Stat label="UNSOLVED" value={String(Math.max(0,integration.totalChallenges-integration.solvedChallenges))} note="available"/><Stat label="TEAM POINTS" value={integration.teamScore.toLocaleString("uk-UA")} note="from CTFd"/></div>{!compact&&<><div className="ctfd-category-analysis">{Object.entries(data.categories).sort().map(([category,stats])=><article key={category}><div><strong>{category}</strong><span>{stats.solved}/{stats.total} · {stats.points} pts</span></div><progress max={Math.max(1,stats.total)} value={stats.solved}/></article>)}</div><div className="ctfd-filters">{availableCategories.map(category=><button className={ctfdCategory===category?"active":""} key={category} onClick={()=>setCtfdCategory(category)}>{category==="ALL"?`УСІ · ${data.challenges.length}`:`${category} · ${data.categories[category].total}`}</button>)}</div><div className="ctfd-challenge-grid">{filtered.map(challenge=>{const related=tasks.filter(task=>task.eventId===ctf.id&&task.ctfdChallengeId===challenge.id);const claimed=related.find(task=>task.status!=="unsolved");return <article className={challenge.solved?"solved":claimed?"claimed":"available"} key={challenge.id}><header><span className="cat-badge">{challenge.category}</span><b>{challenge.value} pts</b></header><h4>{challenge.name}</h4><p>{challenge.solveCount} solves на платформі</p>{challenge.solved?<strong className="ctfd-state">✓ SOLVED</strong>:claimed?<div className="ctfd-owner"><span>●</span><div><strong>{claimed.ownerName}</strong><small>{claimed.status.toUpperCase()}</small></div></div>:<button disabled={ctf.status!=="active"} onClick={()=>claimCtfdChallenge(ctf,challenge)}>{ctf.status==="active"?"+ Взяти таску":"Спочатку активуй CTF"}</button>}</article>})}{!filtered.length&&<div className="empty-state compact"><strong>Тасок немає</strong>Обери іншу категорію або синхронізуй CTFd.</div>}</div></>}</section>;
  }

  function ctfManager() {
    const query = ctfSearch.trim().toLocaleLowerCase("uk-UA");
    const upcomingCtfTime = (ctftimeData?.upcoming || []).filter(ctf => !query || `${ctf.title} ${ctf.format}`.toLocaleLowerCase("uk-UA").includes(query));
    const existingUrls = new Set(events.map(event => event.ctftimeUrl).filter(Boolean));
    return <div className="content-stack">
      <section className="ctf-command"><div><span className="section-label">CAPTAIN CONTROL</span><h3>Робочі середовища CTF</h3><p>Кожне змагання має окремі таски та статистику.</p></div>{isCaptain&&<button className="action" onClick={()=>setShowCreate(value=>!value)}>{showCreate?"Закрити":"+ Новий CTF"}</button>}</section>
      {showCreate&&<section className="panel ctftime-picker"><div className="panel-head"><div><h3>Обрати майбутній CTF</h3><p>Усі актуальні події з Upcoming Events на CTFtime · час Europe/Kyiv.</p></div><span>CTFTIME SYNC</span></div><div className="ctftime-picker-tools"><input className="input" type="search" value={ctfSearch} onChange={event=>setCtfSearch(event.target.value)} placeholder="Пошук за назвою або форматом…" aria-label="Пошук майбутнього CTF"/><small>{ctftimeData ? `${upcomingCtfTime.length} подій` : "Завантаження…"}</small></div>{ctftimeStatus==="error"?<div className="empty-state compact"><strong>Не вдалося отримати CTFtime</strong><p>{ctftimeError}</p><button className="action" onClick={()=>setCtfTimeStatus("idle")}>Спробувати ще раз</button></div>:<div className="ctftime-picker-list">{upcomingCtfTime.map(ctf=>{const added=existingUrls.has(ctf.ctftimeUrl);return <article className="ctftime-pick-row" key={ctf.id}><div className="ctftime-pick-date"><b>{new Intl.DateTimeFormat("uk-UA",{timeZone:"Europe/Kyiv",day:"2-digit",month:"short"}).format(new Date(ctf.start))}</b><span>{new Intl.DateTimeFormat("uk-UA",{timeZone:"Europe/Kyiv",hour:"2-digit",minute:"2-digit"}).format(new Date(ctf.start))}</span></div><div><strong>{ctf.title}</strong><small>{ctf.format} · {ctf.onsite?"ONSITE":"ONLINE"} · weight {ctf.weight.toFixed(2)}</small></div><a href={ctf.ctftimeUrl} target="_blank" rel="noreferrer" aria-label={`Відкрити ${ctf.title} на CTFtime`}>↗</a><button disabled={added||creatingCtfTimeId===ctf.id} onClick={()=>createCtfFromCtfTime(ctf)}>{added?"Додано":creatingCtfTimeId===ctf.id?"Створення…":"Створити середовище"}</button></article>})}{ctftimeStatus==="idle"&&<div className="empty-state compact"><strong>Завантажуємо майбутні CTF…</strong>Список з’явиться автоматично.</div>}{ctftimeStatus==="ready"&&!upcomingCtfTime.length&&<div className="empty-state compact"><strong>Нічого не знайдено</strong>Зміни пошуковий запит.</div>}</div>}<details className="manual-ctf"><summary>Створити середовище вручну</summary><form className="create-ctf" onSubmit={createCtf}><label>Назва CTF<input className="input" value={newName} onChange={event=>setNewName(event.target.value)} placeholder="Наприклад, внутрішній тренувальний CTF" required/></label><label>Дата й час початку за Києвом<input className="input" type="datetime-local" value={newStart} onChange={event=>setNewStart(event.target.value)} required/></label><button className="action">Створити</button></form></details></section>}
      {selectedEvent&&selectedEvent.status!=="archived"&&ctfdPanel(selectedEvent,true)}
      <div className="event-grid">{events.filter(event=>event.status!=="archived").map(event=>{ const scoped=tasks.filter(task=>task.eventId===event.id); const solves=scoped.filter(task=>task.status==="solved"); return <article className={`event-card ${event.status} ${selectedEventId===event.id?"selected":""}`} key={event.id}><div className="event-card-top"><span>{event.status.toUpperCase()}</span><small>{kyivDateTime(event.startsAt)} · Київ</small></div><h3>{event.name}</h3><p>{members.length} учасників · окрема статистика</p><div className="event-mini-stats"><span><b>{solves.length}</b>SOLVES</span><span><b>{solves.reduce((sum,task)=>sum+(task.points||0),0)}</b>POINTS</span><span><b>{scoped.length}</b>ATTEMPTS</span></div><div className="event-actions"><button onClick={()=>{setSelectedEventId(event.id);setTab("ctfs")}}>Налаштувати →</button>{event.status==="active"&&<button onClick={()=>{setSelectedEventId(event.id);setTab("overview")}}>Відкрити огляд</button>}{event.status==="upcoming"&&isCaptain&&<button onClick={()=>updateCtf(event.id,"activate")}>Активувати</button>}{event.status==="active"&&isCaptain&&<><button className="pause-action" onClick={()=>updateCtf(event.id,"pause")}>Заморозити</button><button className="danger-action" onClick={()=>updateCtf(event.id,"archive")}>Завершити</button></>}{event.status==="paused"&&isCaptain&&<><button className="resume-action" onClick={()=>updateCtf(event.id,"resume")}>Відновити</button><button className="danger-action" onClick={()=>updateCtf(event.id,"archive")}>В архів</button></>}</div></article>})}</div>
    </div>;
  }

  function upcomingView() {
    const upcoming = events.filter(event => event.status === "upcoming").sort((a,b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
    return <div className="content-stack"><section className="upcoming-hero"><div><span className="section-label">AMBR0S1A! SCHEDULE · EUROPE/KYIV</span><h3>Майбутні CTF команди</h3><p>Змагання, у яких команда планує брати участь.</p></div><strong>{upcoming.length}<small>ЗАПЛАНОВАНО</small></strong></section>{upcoming.length?<div className="upcoming-team-grid">{upcoming.map(event=><article className="upcoming-team-card" key={event.id}><div className="upcoming-team-date"><b>{new Intl.DateTimeFormat("uk-UA",{timeZone:"Europe/Kyiv",day:"2-digit"}).format(apiDate(event.startsAt))}</b><span>{new Intl.DateTimeFormat("uk-UA",{timeZone:"Europe/Kyiv",month:"short",year:"numeric"}).format(apiDate(event.startsAt))}</span><time>{new Intl.DateTimeFormat("uk-UA",{timeZone:"Europe/Kyiv",hour:"2-digit",minute:"2-digit"}).format(apiDate(event.startsAt))}</time></div><div className="upcoming-team-info"><span>UPCOMING · AMBR0S1A!</span><h3>{event.name}</h3><p>{event.endsAt?`Завершення: ${kyivDateTime(event.endsAt)} за Києвом`:"Окреме робоче середовище готове"}</p><div>{event.ctftimeUrl&&<a href={event.ctftimeUrl} target="_blank" rel="noreferrer">CTFtime ↗</a>}<button onClick={()=>{setSelectedEventId(event.id);setTab("ctfs")}}>Середовище →</button>{isCaptain&&<button className="activate-upcoming" onClick={()=>updateCtf(event.id,"activate")}>Активувати</button>}</div></div></article>)}</div>:<section className="panel"><div className="empty-state"><strong>Майбутніх CTF ще немає</strong>Відкрий вкладку CTFtime та натисни «✓ Додати» біля потрібного змагання.</div></section>}</div>;
  }

  function archiveView() { const archived=events.filter(event=>event.status==="archived"); return archived.length ? <div className="archive-layout"><div className="archive-list">{archived.map(event=><button className={`archive-row ${selectedEventId===event.id?"selected":""}`} key={event.id} onClick={()=>setSelectedEventId(event.id)}><span className="archive-icon">▣</span><span><strong>{event.name}</strong><small>{new Date(event.startsAt).toLocaleDateString("uk-UA")} · {event.finalMembers} members</small></span><b>#{event.finalPlace||"—"}</b><em>{event.finalPoints.toLocaleString("uk-UA")} pts</em></button>)}</div>{selectedEvent?.status==="archived"&&<section className="archive-detail panel"><div className="panel-head"><h3>{selectedEvent.name}</h3><span>READ-ONLY ARCHIVE</span></div><div className="archive-hero"><div><span>FINAL PLACE</span><strong>#{selectedEvent.finalPlace||"—"}</strong></div><div><span>TEAM POINTS</span><strong>{selectedEvent.finalPoints.toLocaleString("uk-UA")}</strong></div></div><div className="stat-strip archive-stats"><Stat label="SOLVED" value={String(selectedEvent.finalSolves)} note="completed tasks"/><Stat label="ATTEMPTS" value={String(selectedEvent.finalAttempts)} note="all claimed"/><Stat label="SUCCESS RATE" value={`${selectedEvent.finalAttempts?Math.round(selectedEvent.finalSolves/selectedEvent.finalAttempts*100):0}%`} note="solve / attempt"/><Stat label="MEMBERS" value={String(selectedEvent.finalMembers)} note="participants"/></div><div className="archive-note">Статистика зафіксована в момент завершення CTF. Архів доступний лише для перегляду.</div>{isCaptain&&<div className="archive-delete-zone"><div><strong>Видалення архіву</strong><p>CTF і всі його таски буде видалено назавжди.</p></div><button onClick={()=>deleteArchivedCtf(selectedEvent)}>Видалити назавжди</button></div>}</section>}</div> : <section className="panel"><div className="empty-state"><strong>Архів порожній</strong>Після завершення CTF його статистика з’явиться тут.</div></section>; }

  function accountView() { return <div className="account-grid"><section className="panel account-panel"><div className="panel-head"><h3>Мій акаунт</h3><span>{roleLabels[profile.role].toUpperCase()}</span></div><div className="avatar-editor"><span className="account-avatar">{profile.avatarKey?<img src={avatarUrl(profile)} alt={`Аватар ${profile.displayName}`}/>:profile.displayName[0]?.toUpperCase()}</span><div><strong>Аватарка профілю</strong><p>JPG, PNG або WebP · до 3 МБ</p><div><label className="avatar-upload"><input type="file" accept="image/jpeg,image/png,image/webp" disabled={avatarUploading} onChange={event=>uploadAvatar(event.target.files?.[0])}/>{avatarUploading?"Завантаження…":"Змінити аватарку"}</label>{profile.avatarKey&&<button type="button" onClick={removeAvatar} disabled={avatarUploading}>Видалити</button>}</div></div></div><form onSubmit={saveAccount}><label>Нікнейм<input className="input" value={accountNickname} onChange={event=>setAccountNickname(event.target.value)}/></label><div className="identity-fields"><label>Прізвище<input className="input" value={accountLastName} onChange={event=>setAccountLastName(event.target.value)} placeholder="Лесюк"/></label><label>Імʼя<input className="input" value={accountFirstName} onChange={event=>setAccountFirstName(event.target.value)} placeholder="Михайло"/></label><label>По батькові<input className="input" value={accountPatronymic} onChange={event=>setAccountPatronymic(event.target.value)} placeholder="Вкажи за потреби"/></label></div><small className="field-note">ПІБ використовуватиметься для автоматичного формування командних звітів.</small><label>Новий пароль<input className="input" type="password" value={accountPassword} onChange={event=>setAccountPassword(event.target.value)} placeholder="Залиш порожнім без змін" minLength={8}/></label><button className="action">Зберегти</button></form><button className="logout-button" onClick={logout}>Вийти з акаунта</button></section>{isCaptain&&<section className="panel account-panel"><div className="panel-head"><h3>Запросити учасника</h3><span>LINK · 7 DAYS</span></div><div className="invite-box"><label>Системна роль<select className="select" value={inviteRole} onChange={event=>setInviteRole(event.target.value)}><option value="member">Member</option><option value="coordinator">CTF Coordinator</option><option value="infra">Knowledge / Infra</option></select></label><button className="action" onClick={createInvite}>Створити запрошення</button>{inviteUrl&&<div className="invite-result"><input className="input" readOnly value={inviteUrl}/><button onClick={()=>navigator.clipboard.writeText(inviteUrl)}>Копіювати</button><small>За цим посиланням учасник сам обере нікнейм і пароль.</small></div>}</div></section>}</div>; }

  function contentEditorView() {
    const groups = Array.from(new Set(siteTextDefinitions.map(item => item.group)));
    return <div className="content-editor"><section className="content-editor-hero"><div><span className="section-label">CAPTAIN CONTENT CONTROL</span><h3>Редактор написів сайту</h3><p>Зміни зберігаються для публічної сторінки та робочого простору на всіх пристроях.</p></div><div><button onClick={resetSiteText} disabled={contentSaving}>Відновити початкові</button><button className="action" onClick={saveSiteText} disabled={contentSaving}>{contentSaving?"Збереження…":"Зберегти всі зміни"}</button></div></section>{groups.map(group=><section className="panel content-group" key={group}><div className="panel-head"><h3>{group}</h3><span>EDITABLE TEXT</span></div><div className="content-fields">{siteTextDefinitions.filter(item=>item.group===group).map(item=><label key={item.key}>{item.label}{"multiline" in item&&item.multiline?<textarea className="input" rows={4} value={siteText[item.key]} onChange={event=>setSiteText(current=>({...current,[item.key]:event.target.value}))}/>:<input className="input" value={siteText[item.key]} onChange={event=>setSiteText(current=>({...current,[item.key]:event.target.value}))}/>}<small>{item.key}</small></label>)}</div></section>)}</div>;
  }

  function ctftimeView() {
    if (ctftimeStatus === "idle") return <section className="panel"><div className="empty-state"><strong>Завантажуємо CTFtime…</strong>Отримуємо календар і актуальні рейтинги.</div></section>;
    if (ctftimeStatus === "error" || !ctftimeData) return <section className="panel"><div className="empty-state"><strong>CTFtime тимчасово недоступний</strong><p>{ctftimeError}</p><button className="action" onClick={()=>setCtfTimeStatus("idle")}>Спробувати ще раз</button></div></section>;
    const existingUrls = new Set(events.map(event => event.ctftimeUrl).filter(Boolean));
    const eventList = (title: string, label: string, ctfEvents: CtfTimeEvent[], addable = false) => <section className={`panel ctftime-panel ${addable?"ctftime-upcoming-panel":""}`}><div className="panel-head"><h3>{title}</h3><span>{label} · {ctfEvents.length}</span></div><div className="ctftime-events">{(addable?ctfEvents:ctfEvents.slice(0,10)).map(event=>{const added=existingUrls.has(event.ctftimeUrl);return <article className="ctftime-event" key={event.id}><a href={event.ctftimeUrl} target="_blank" rel="noreferrer"><div><strong>{event.title}</strong><small>{event.format} · {event.onsite ? "ONSITE" : "ONLINE"} · weight {event.weight.toFixed(2)}</small></div><time>{new Date(event.start).toLocaleString("uk-UA", { dateStyle: "medium", timeStyle: "short" })}</time></a>{addable?<button className={`ctftime-add ${added?"added":""}`} disabled={added||creatingCtfTimeId===event.id} onClick={()=>createCtfFromCtfTime(event)} aria-label={added?`${event.title} уже додано`:`Додати ${event.title} до майбутніх CTF`}>{added?"✓ Додано":creatingCtfTimeId===event.id?"…":"✓ Додати"}</button>:<span>→</span>}</article>})}{!ctfEvents.length&&<div className="empty-state compact"><strong>Подій немає</strong>CTFtime не повернув подій за цей період.</div>}</div></section>;
    const leaderboard = (title: string, label: string, rows: CtfTimeRank[]) => <section className="panel ctftime-panel"><div className="panel-head"><h3>{title}</h3><span>{label}</span></div><div className="ctftime-table-wrap"><table className="ctftime-table"><thead><tr><th>#</th><th>КОМАНДА</th><th>РЕЙТИНГ</th></tr></thead><tbody>{rows.slice(0,15).map((team,index)=><tr className={team.team_id===ctftimeData.team.id?"our-team":""} key={team.team_id}><td>{index+1}</td><td><a href={`https://ctftime.org/team/${team.team_id}/`} target="_blank" rel="noreferrer">{team.team_name}</a>{team.team_id===ctftimeData.team.id&&<small>AMBR0S1A!</small>}</td><td>{team.points.toFixed(3)}</td></tr>)}</tbody></table></div></section>;
    return <div className="ctftime-stack"><section className="ctftime-team-card"><div><span className="section-label">CTFTIME · {ctftimeData.year}</span><h3>{ctftimeData.team.name}</h3><p>Офіційний рейтинг оновлюється автоматично з CTFtime.</p></div><div className="ctftime-team-stats"><span><b>#{ctftimeData.team.ratingPlace ?? "—"}</b>СВІТ</span><span><b>#{ctftimeData.team.countryPlace ?? "—"}</b>УКРАЇНА</span><span><b>{ctftimeData.team.ratingPoints.toFixed(3)}</b>POINTS</span></div><a href={`https://ctftime.org/team/${ctftimeData.team.id}/`} target="_blank" rel="noreferrer">Профіль CTFtime ↗</a></section><div className="ctftime-selection-note"><span>✓</span><div><strong>Додай участь команди одним кліком</strong><p>Натисни «✓ Додати» біля змагання — воно одразу з’явиться у вкладці «Майбутні CTF».</p></div></div>{eventList("Майбутні події CTFtime", "UPCOMING", ctftimeData.upcoming, true)}<div className="ctftime-grid">{eventList("Минулі CTF", "RECENT", ctftimeData.past)}{leaderboard("Світовий лідерборд", `GLOBAL · ${ctftimeData.year}`, ctftimeData.global)}{leaderboard("Лідерборд України", `UA · ${ctftimeData.year}`, ctftimeData.ukraine)}</div><p className="ctftime-source">Дані: CTFtime API · оновлено {new Date(ctftimeData.updatedAt).toLocaleString("uk-UA")}</p></div>;
  }

  function renderMain() {
    if (loading) return <section className="panel"><div className="empty-state"><strong>Завантаження…</strong>Синхронізуємо робочі дані.</div></section>;
    if (tab === "overview") return overviewView();
    if (tab === "ctfs") return ctfManager(); if (tab === "upcoming") return upcomingView(); if (tab === "tasks") return <div className="content-stack">{activeEvent&&ctfdPanel(activeEvent)}{taskPanel}</div>; if (tab === "archive") return archiveView();
    if (tab === "roles") return <section className="panel table-panel"><div className="panel-head"><h3>Учасники команди</h3><span>{isCaptain ? "CAPTAIN EDIT MODE" : "PRIMARY + SECONDARY"}</span></div><div className="roles-table-wrap"><table className="roles-table members-table"><thead><tr><th>УЧАСНИК</th><th>РОЛЬ У КОМАНДІ</th><th>PRIMARY</th><th>SECONDARY</th>{isCaptain&&<th>ДІЇ</th>}</tr></thead><tbody>{members.map(member=><tr key={member.email}><td><div className="member-cell"><span className="mini-avatar">{member.avatarKey?<img src={avatarUrl(member)} alt=""/>:member.displayName[0]?.toUpperCase()}</span><span><strong>{member.displayName}</strong><small>{member.username ? `@${member.username}` : member.email}</small></span></div></td><td>{isCaptain?<select className="member-select" value={member.role} onChange={event=>editMember(member.email,{ role: event.target.value as Member["role"] })}><option value="captain">Captain</option><option value="coordinator">CTF Coordinator</option><option value="infra">Knowledge / Infra</option><option value="member">Member</option></select>:roleLabels[member.role]}</td><td>{isCaptain?<select className="member-select category-select" value={member.primaryCategory} onChange={event=>editMember(member.email,{ primaryCategory:event.target.value })}>{categories.map(item=><option key={item}>{item}</option>)}</select>:<span className="role-pill">{member.primaryCategory}</span>}</td><td>{isCaptain?<select className="member-select category-select" value={member.secondaryCategory} onChange={event=>editMember(member.email,{ secondaryCategory:event.target.value })}>{categories.map(item=><option key={item}>{item}</option>)}</select>:<span className="role-pill secondary">{member.secondaryCategory}</span>}</td>{isCaptain&&<td><div className="member-actions"><button className="member-save" disabled={!memberDirty[member.email]||memberSaving===member.email} onClick={()=>saveMember(member)}>{memberSaving===member.email?"Збереження…":"Зберегти"}</button><button className="member-delete" disabled={member.email===profile.email||memberDeleting===member.email} onClick={()=>deleteMember(member)}>{memberDeleting===member.email?"Видалення…":"Видалити"}</button></div></td>}</tr>)}</tbody></table></div><p className="members-note">{isCaptain ? "Зміни застосовуються після натискання «Зберегти». Видалення деактивує акаунт, але зберігає історію тасок." : "Розподіл ролей і категорій змінює капітан команди."}</p></section>;
    if (tab === "history") return taskStatusBoard();
    if (tab === "notifications") return <div className="notification-page">{notices.map(notice=><article className="notice unread" key={notice.id}><span className="activity-icon">{notice.kind.includes("solved")?"✓":notice.kind.includes("ctf")?"◎":"⚑"}</span><div><p>{notice.message}</p><time>{ago(notice.createdAt)}</time></div></article>)}{!notices.length&&<section className="panel"><div className="empty-state"><strong>Сповіщень немає</strong>Події команди з’являться тут.</div></section>}</div>;
    if (tab === "ctftime") return ctftimeView();
    if (tab === "content" && isCaptain) return contentEditorView();
    if (tab === "account") return accountView();
    return <section className="panel"><div className="panel-head"><h3>Knowledge base / Writeups</h3><span>PLAYBOOKS · TOOLS · COMPETITIONS</span></div><div className="empty-state"><strong>Спільна база знань</strong>Шаблони writeup, playbooks і матеріали з архівних CTF.</div></section>;
  }

  const visibleNav = nav.filter(item => item[0] !== "content" || isCaptain);
  const tabTitle = tab === "account" ? "Мій акаунт" : navTextKeys[tab] ? t(navTextKeys[tab]) : nav.find(item=>item[0]===tab)?.[2];
  const currentContextEvent = ["overview", "tasks", "history"].includes(tab) ? activeEvent : selectedEvent;
  return <main className="workspace"><aside className="sidebar"><a className="brand" href="/"><img src="/ambr0s1a-logo.jpg" alt=""/><span>Ambr0s1a!</span></a><div className="side-label">OPERATIONS</div><nav className="side-nav">{visibleNav.map(item=>{const label=navTextKeys[item[0]]?t(navTextKeys[item[0]]):item[2];return <button key={item[0]} className={tab===item[0]?"active":""} onClick={()=>setTab(item[0])} title={label}><bdi>{item[1]}</bdi><span>{label}</span>{item[0]==="notifications"&&unreadCount>0&&<b>{Math.min(99,unreadCount)}</b>}</button>})}</nav><button type="button" className={`sidebar-profile ${tab==="account"?"active":""}`} onClick={()=>setTab("account")} aria-label="Відкрити налаштування акаунта" title="Акаунт"><span className="avatar">{profile.avatarKey?<img src={avatarUrl(profile)} alt=""/>:profile.displayName[0]?.toUpperCase()}</span><div><strong>{profile.displayName}</strong><span>{roleLabels[profile.role].toUpperCase()}</span></div><span className="profile-gear" aria-hidden="true">⚙</span></button></aside><div className="workspace-main"><header className="workspace-header"><h1>{t("workspace.title")}</h1><p>{activeEvents.length?`${activeEvents.length} ACTIVE · ${activeEvent?.name}`:"NO ACTIVE CTF"}</p><button className={`bell ${unreadCount>0?"unread":""}`} onClick={()=>setTab("notifications")} aria-label={unreadCount>0?`Сповіщення: ${unreadCount} непрочитаних`:"Сповіщення"}>◉{unreadCount>0&&<b className="bell-count">{Math.min(99,unreadCount)}</b>}</button></header><div className="workspace-body">{message&&<button className="status-message" onClick={()=>setMessage("")}>{message}<span>×</span></button>}<div className="workspace-intro"><div><h2>{tabTitle}</h2><p>{currentContextEvent ? `${currentContextEvent.name} · окрема статистика` : "Створіть або активуйте робоче середовище"}</p></div>{activeEvent&&<span className="event-chip">{activeEvents.length>1?`${activeEvents.length} ACTIVE · `:"ACTIVE · "}{activeEvent.name}</span>}</div>{renderMain()}</div></div></main>;
}

function Activity({ notices }: { notices: Notice[] }) { return <section className="panel"><div className="panel-head"><h3>Live activity</h3><span>RECENT</span></div><div className="activity-list">{notices.slice(0,8).map(notice=><div className="activity" key={notice.id}><span className="activity-icon">{notice.kind.includes("solved")?"✓":notice.kind.includes("ctf")?"◎":"⚑"}</span><div><p>{notice.message}</p><time>{ago(notice.createdAt)}</time></div></div>)}{!notices.length&&<div className="empty-state compact"><strong>Поки тихо</strong>Активність команди з’явиться тут.</div>}</div></section>; }
function Stat({ label, value, note }: { label: string; value: string; note: string }) { return <article className="stat-card"><span>{label}</span><strong>{value}</strong><small>{note}</small></article>; }
