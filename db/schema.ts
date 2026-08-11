import { sql } from "drizzle-orm";
import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const members = sqliteTable("members", {
  email: text("email").primaryKey(),
  username: text("username").unique(),
  authProviderId: text("auth_provider_id").unique(),
  displayName: text("display_name").notNull(),
  lastName: text("last_name"),
  firstName: text("first_name"),
  patronymic: text("patronymic"),
  avatarKey: text("avatar_key"),
  role: text("role", { enum: ["captain", "coordinator", "infra", "member"] }).notNull().default("member"),
  primaryCategory: text("primary_category").notNull().default("WEB"),
  secondaryCategory: text("secondary_category").notNull().default("MISC"),
  notificationsReadAt: text("notifications_read_at"),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const siteContent = sqliteTable("site_content", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedBy: text("updated_by").notNull(),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const dashboardPreferences = sqliteTable("dashboard_preferences", {
  memberEmail: text("member_email").primaryKey().references(() => members.email),
  config: text("config").notNull(),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const ctfEvents = sqliteTable("ctf_events", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  ctftimeUrl: text("ctftime_url"),
  startsAt: text("starts_at").notNull(),
  endsAt: text("ends_at"),
  status: text("status", { enum: ["upcoming", "active", "paused", "archived"] }).notNull().default("upcoming"),
  createdBy: text("created_by").notNull(),
  finalPlace: integer("final_place"),
  finalPoints: integer("final_points").notNull().default(0),
  finalSolves: integer("final_solves").notNull().default(0),
  finalAttempts: integer("final_attempts").notNull().default(0),
  finalMembers: integer("final_members").notNull().default(0),
  archivedAt: text("archived_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const eventMembers = sqliteTable("event_members", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  eventId: text("event_id").notNull().references(() => ctfEvents.id),
  memberEmail: text("member_email").notNull().references(() => members.email),
  primaryCategory: text("primary_category").notNull(),
  secondaryCategory: text("secondary_category").notNull(),
  joinedAt: text("joined_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const teamInvites = sqliteTable("team_invites", {
  id: text("id").primaryKey(),
  tokenHash: text("token_hash").notNull().unique(),
  invitedUsername: text("invited_username"),
  role: text("role", { enum: ["captain", "coordinator", "infra", "member"] }).notNull().default("member"),
  createdBy: text("created_by").notNull(),
  expiresAt: text("expires_at").notNull(),
  acceptedAt: text("accepted_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const tasks = sqliteTable("tasks", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  category: text("category").notNull(),
  ownerEmail: text("owner_email").notNull().references(() => members.email),
  ownerName: text("owner_name").notNull(),
  eventId: text("event_id").references(() => ctfEvents.id),
  ctfdChallengeId: text("ctfd_challenge_id"),
  status: text("status", { enum: ["progress", "blocked", "solved", "unsolved"] }).notNull().default("progress"),
  points: integer("points"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  closedAt: text("closed_at"),
});

export const ctfdIntegrations = sqliteTable("ctfd_integrations", {
  eventId: text("event_id").primaryKey().references(() => ctfEvents.id),
  baseUrl: text("base_url").notNull(),
  tokenCiphertext: text("token_ciphertext").notNull(),
  connectedBy: text("connected_by").notNull(),
  teamScore: integer("team_score").notNull().default(0),
  totalChallenges: integer("total_challenges").notNull().default(0),
  solvedChallenges: integer("solved_challenges").notNull().default(0),
  lastSyncAt: text("last_sync_at"),
  lastError: text("last_error"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const ctfdChallenges = sqliteTable("ctfd_challenges", {
  id: text("id").primaryKey(),
  eventId: text("event_id").notNull().references(() => ctfEvents.id),
  externalId: integer("external_id").notNull(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  value: integer("value").notNull().default(0),
  solveCount: integer("solve_count").notNull().default(0),
  solved: integer("solved", { mode: "boolean" }).notNull().default(false),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, table => [uniqueIndex("ctfd_challenges_event_external_unique").on(table.eventId, table.externalId)]);

export const notifications = sqliteTable("notifications", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  actorEmail: text("actor_email").notNull(),
  message: text("message").notNull(),
  kind: text("kind").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
