import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, json, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull().unique(),
  // Nullable: accounts created via "Continue with Google" have no local
  // password at all, since Google is the sole authentication method for
  // them. The local Passport strategy (server/auth.ts) checks for this and
  // rejects password login on such accounts with a clear message rather
  // than crashing on a null bcrypt.compare().
  password: text("password"),
  pin: text("pin"), // Magic PIN for locking albums
  // Google account id (the OAuth "sub" claim), set only for accounts that
  // have signed in with Google at least once. Unique so one Google account
  // can't be linked to two SnapVault accounts.
  googleId: text("google_id").unique(),
  // Global kill switch for the per-album "share link" feature. Off by
  // default is friendlier for a privacy-focused app — sharing is opt-in.
  publicSharingEnabled: integer("public_sharing_enabled").default(0).notNull(),
});

// Session table for connect-pg-simple
export const session = pgTable("session", {
  sid: varchar("sid").primaryKey(),
  sess: json("sess").notNull(),
  expire: timestamp("expire").notNull(),
});

export const albums = pgTable("albums", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),
  userId: varchar("user_id").notNull(),
  isLocked: integer("is_locked").default(0).notNull(), // 0 = unlocked, 1 = locked
  // Public share link support. isPublic gates whether the share link (if
  // one exists) currently works — toggling it off immediately revokes
  // access without having to regenerate a new token. shareToken is only
  // ever generated on first share and then reused, so re-sharing doesn't
  // invalidate a link you already handed out.
  isPublic: integer("is_public").default(0).notNull(),
  shareToken: text("share_token").unique(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const media = pgTable("media", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  filename: text("filename").notNull(),
  path: text("path").notNull(),
  type: text("type").notNull(),
  size: integer("size").notNull(),
  albumId: varchar("album_id"),
  userId: varchar("user_id").notNull(),
  isFavorite: integer("is_favorite").default(0).notNull(), // 0 = not favorited, 1 = favorited
  // Cloudinary asset identity, stored explicitly rather than parsed back out
  // of the delivery URL (which is what the app previously did, fragile and
  // wrong for signed/authenticated URLs). Nullable because rows created
  // before signed delivery was added won't have these — they fall back to
  // their originally-stored public `path`.
  cloudinaryPublicId: text("cloudinary_public_id"),
  cloudinaryResourceType: text("cloudinary_resource_type"), // 'image' | 'video'
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Email-change verification. Changing the email is a two-step, verified
// flow (request -> email sent to the NEW address -> click to confirm) so
// the account can never be pointed at an email the person doesn't actually
// control — the previous Settings UI just had a plain editable text field
// with no verification and no backend at all.
export const emailChangeTokens = pgTable("email_change_tokens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  newEmail: text("new_email").notNull(),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Recent search terms, per user. Backs the "Recent Searches" list on the
// Search screen — previously this was flagged as unwired because there was
// nowhere to actually persist it; this table is that persistence.
export const searchHistory = pgTable("search_history", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  query: text("query").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertUserSchema = createInsertSchema(users, {
  // Previously this had no length constraint at all, so signup accepted a
  // 1-character password even though /api/auth/reset-password enforced an
  // 8-character minimum — an internal inconsistency that also meant weak
  // accounts could be created. Match the reset-password rule here.
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  pin: z
    .string()
    .regex(/^\d{4}$/, "PIN must be exactly 4 digits")
    .nullable()
    .optional(),
}).omit({
  id: true,
  googleId: true,
  publicSharingEnabled: true,
});

export const insertAlbumSchema = createInsertSchema(albums).omit({
  id: true,
  userId: true,
  isPublic: true,
  shareToken: true,
  createdAt: true,
});

export const insertMediaSchema = createInsertSchema(media).omit({
  id: true,
  userId: true,
  isFavorite: true,
  cloudinaryPublicId: true,
  cloudinaryResourceType: true,
  createdAt: true,
});

export const insertPasswordResetTokenSchema = createInsertSchema(passwordResetTokens).omit({
  id: true,
  createdAt: true,
});

export const insertEmailChangeTokenSchema = createInsertSchema(emailChangeTokens, {
  newEmail: z.string().email("Enter a valid email address"),
}).omit({
  id: true,
  userId: true,
  token: true,
  expiresAt: true,
  createdAt: true,
});

export const insertSearchHistorySchema = createInsertSchema(searchHistory, {
  query: z.string().trim().min(1).max(200),
}).omit({
  id: true,
  userId: true,
  createdAt: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type InsertAlbum = z.infer<typeof insertAlbumSchema>;
export type Album = typeof albums.$inferSelect;
export type InsertMedia = z.infer<typeof insertMediaSchema>;
export type Media = typeof media.$inferSelect;
export type InsertPasswordResetToken = z.infer<typeof insertPasswordResetTokenSchema>;
export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;
export type InsertEmailChangeToken = z.infer<typeof insertEmailChangeTokenSchema>;
export type EmailChangeToken = typeof emailChangeTokens.$inferSelect;
export type InsertSearchHistory = z.infer<typeof insertSearchHistorySchema>;
export type SearchHistory = typeof searchHistory.$inferSelect;
