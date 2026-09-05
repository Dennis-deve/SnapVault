import {
  type User,
  type InsertUser,
  type Album,
  type InsertAlbum,
  type Media,
  type InsertMedia,
  type PasswordResetToken,
  type InsertPasswordResetToken,
  type EmailChangeToken,
  type SearchHistory,
} from "@shared/schema";
import { db } from "./db";
import { users, albums, media, passwordResetTokens, emailChangeTokens, searchHistory } from "@shared/schema";
import { eq, and, or, like, lt, inArray, desc, ilike, sql } from "drizzle-orm";

// A single Drizzle SQL expression (raw or built by eq()/like()/…).
type SqlExp = ReturnType<typeof sql>;

export interface SearchMediaParams {
  /** Free-text query; whitespace-separated words all have to match (AND). */
  query?: string;
  /** "image" | "video" — filters by media category. */
  type?: "image" | "video";
  /** Favorites-only filter. */
  favorite?: boolean;
  /** 1-based page number. */
  page?: number;
  /** Page size, capped by the route layer. */
  limit?: number;
}

export interface SearchMediaResult {
  items: Media[];
  total: number;
  page: number;
  limit: number;
}

export type ConsumeResetResult =
  | { ok: true; userId: string }
  | { ok: false; reason: "invalid" | "expired" };

export interface IStorage {
  // User methods
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByGoogleId(googleId: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  createOAuthUser(data: { email: string; googleId: string }): Promise<User>;
  linkGoogleAccount(userId: string, googleId: string): Promise<User>;
  updateUserPin(userId: string, hashedPin: string): Promise<void>;
  updateUserEmail(userId: string, email: string): Promise<void>;
  setPublicSharingEnabled(userId: string, enabled: boolean): Promise<void>;
  deleteUser(userId: string): Promise<void>;
  /** Delete every express-session row belonging to a user (login
   * invalidation after a password reset). `exceptSid` keeps one session
   * alive (used by change-password so the current tab stays logged in). */
  destroySessionsForUser(userId: string, exceptSid?: string): Promise<void>;

  // Album methods
  getAlbum(id: string): Promise<Album | undefined>;
  getAlbumByShareToken(shareToken: string): Promise<Album | undefined>;
  getAlbumsByUserId(userId: string): Promise<Album[]>;
  createAlbum(album: InsertAlbum, userId: string): Promise<Album>;
  deleteAlbum(id: string): Promise<void>;
  lockAlbum(id: string): Promise<void>;
  unlockAlbum(id: string): Promise<void>;
  setAlbumSharing(id: string, isPublic: boolean, shareToken?: string): Promise<Album>;
  /** Permanently revoke an album's share link: isPublic=0 AND shareToken=NULL.
   * Re-sharing later mints a fresh token — the old link can never revive. */
  revokeAlbumSharing(id: string): Promise<void>;
  /** Revoke every share link on every album owned by the user (the account
   * wide "public sharing" kill switch). One statement, so no album is left
   * half-revoked. */
  revokeAllAlbumSharesForUser(userId: string): Promise<void>;

  // Media methods
  getMedia(id: string): Promise<Media | undefined>;
  getMediaByAlbumId(albumId: string): Promise<Media[]>;
  getMediaByUserId(userId: string): Promise<Media[]>;
  getMediaByIds(ids: string[], userId: string): Promise<Media[]>;
  createMedia(
    mediaItem: InsertMedia,
    userId: string,
    cloudinaryInfo?: { publicId: string; resourceType: string },
    identity?: { id: string }
  ): Promise<Media>;
  deleteMedia(id: string): Promise<void>;
  deleteMediaBatch(ids: string[]): Promise<void>;
  moveMediaBatch(ids: string[], albumId: string): Promise<void>;
  setMediaFavorite(id: string, isFavorite: boolean): Promise<void>;
  searchMedia(userId: string, params: SearchMediaParams): Promise<SearchMediaResult>;

  // Password reset token methods
  createPasswordResetToken(token: InsertPasswordResetToken): Promise<PasswordResetToken>;
  getPasswordResetToken(token: string): Promise<PasswordResetToken | undefined>;
  deletePasswordResetToken(token: string): Promise<void>;
  deleteExpiredTokens(): Promise<void>;
  deleteTokensForUser(userId: string): Promise<void>;
  updateUserPassword(userId: string, hashedPassword: string): Promise<void>;
  /**
   * Atomically consume a reset token and set the new password, in one
   * transaction: row-lock the token, reject if already gone or expired,
   * delete it (single use), update the password, and destroy all of the
   * user's sessions. Old JWTs die via the credential-version check (see
   * server/jwt.ts); old cookies die here.
   */
  consumePasswordResetTokenAndSetPassword(token: string, hashedPassword: string): Promise<ConsumeResetResult>;

  // Email change tokens — verified email-change flow (see shared/schema.ts)
  createEmailChangeToken(data: { userId: string; newEmail: string; token: string; expiresAt: Date }): Promise<EmailChangeToken>;
  getEmailChangeToken(token: string): Promise<EmailChangeToken | undefined>;
  deleteEmailChangeToken(token: string): Promise<void>;
  deleteEmailChangeTokensForUser(userId: string): Promise<void>;
  deleteExpiredEmailChangeTokens(): Promise<void>;

  // Storage usage
  getUserStorageUsageBytes(userId: string): Promise<number>;

  // Search history — backs the "Recent Searches" list on the Search screen.
  addSearchHistoryEntry(userId: string, query: string): Promise<void>;
  getRecentSearchHistory(userId: string, limit?: number): Promise<SearchHistory[]>;
  deleteSearchHistoryEntry(id: string, userId: string): Promise<void>;
  clearSearchHistory(userId: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// Search helpers
// ---------------------------------------------------------------------------

/**
 * Escape LIKE metacharacters so user-typed text is matched literally: `%`,
 * `_` and the escape character itself. Searching for "100%" must find
 * "100%" — not every filename containing "100" followed by anything.
 */
export function escapeLike(input: string): string {
  return input.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

const DATE_PREFIX_RE = /^(\d{4})(-\d{2})?(-\d{2})?$/;

function lowerLiteral(value: string): string {
  // Lowercase OUTSIDE of SQL so the parameter itself can't inject patterns.
  return value.toLowerCase();
}

/**
 * Build the SQL "any column matches this word" clause used by searchMedia.
 * Columns considered: filename, media type, album name, album description,
 * and the upload date formatted as YYYY-MM-DD (so "2024", "2024-03" and
 * "2024-03-15" all work as date filters).
 */
function wordMatchCondition(word: string): SqlExp {
  const escaped = escapeLike(lowerLiteral(word));
  const literal = `%${escaped}%`;

  const textMatch = or(
    sql`lower(${media.filename}) like ${literal} escape '\\'`,
    sql`lower(${media.type}) like ${literal} escape '\\'`,
    sql`lower(coalesce(${albums.name}, '')) like ${literal} escape '\\'`,
    sql`lower(coalesce(${albums.description}, '')) like ${literal} escape '\\'`
  );

  if (DATE_PREFIX_RE.test(word)) {
    const datePrefix = `${escaped}%`;
    return or(
      textMatch,
      sql`to_char(${media.createdAt}, 'YYYY-MM-DD') like ${datePrefix} escape '\\'`
    )!;
  }

  return textMatch!;
}

/**
 * Locked / orphaned media exclusion, shared by search and the cross-album
 * "all media" listing. "Orphaned" = the referenced album row no longer
 * exists (album deleted while media rows lingered). Locked albums require
 * the PIN + per-album unlock flow (open the album), so their contents never
 * appear in account-wide listings or search results.
 */
function accessibleMediaCondition(userId: string): SqlExp[] {
  return [
    eq(media.userId, userId),
    sql`(${media.albumId} is null or (${albums.id} is not null and ${albums.isLocked} = 0))`,
  ];
}

export class DBStorage implements IStorage {
  /**
   * The Drizzle handle this instance runs against. Defaults to the app's
   * real database (server/this.handle.ts). Tests inject an embedded PostgreSQL
   * (PGlite) instance here so the actual SQL, transactions and row locking
   * are exercised without a live database server.
   */
  protected readonly handle: typeof db;

  constructor(handle?: typeof db) {
    this.handle = handle ?? db;
  }

  // User methods
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await this.handle.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    // Case-insensitive: addresses created before normalization existed may
    // be stored mixed-case ("Dennis@Example.com") and must still be found
    // by "dennis@example.com" (password reset, login, OAuth linking).
    const [user] = await this.handle
      .select()
      .from(users)
      .where(sql`lower(${users.email}) = lower(${email})`);
    return user;
  }

  async getUserByGoogleId(googleId: string): Promise<User | undefined> {
    const [user] = await this.handle.select().from(users).where(eq(users.googleId, googleId));
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await this.handle
      .insert(users)
      // Normalize at write time so future lookups are exact-match friendly.
      .values({ ...insertUser, email: insertUser.email.trim().toLowerCase() })
      .returning();
    return user;
  }

  async createOAuthUser(data: { email: string; googleId: string }): Promise<User> {
    // No password, no PIN — Google is the only way in until/unless the
    // person sets a password or PIN later from Settings.
    const [user] = await this.handle
      .insert(users)
      .values({
        email: data.email.trim().toLowerCase(),
        googleId: data.googleId,
        password: null,
        pin: null,
      })
      .returning();
    return user;
  }

  async linkGoogleAccount(userId: string, googleId: string): Promise<User> {
    const [user] = await this.handle
      .update(users)
      .set({ googleId })
      .where(eq(users.id, userId))
      .returning();
    return user;
  }

  async updateUserPin(userId: string, hashedPin: string): Promise<void> {
    await this.handle.update(users).set({ pin: hashedPin }).where(eq(users.id, userId));
  }

  async updateUserEmail(userId: string, email: string): Promise<void> {
    await this.handle.update(users).set({ email: email.trim().toLowerCase() }).where(eq(users.id, userId));
  }

  async setPublicSharingEnabled(userId: string, enabled: boolean): Promise<void> {
    await this.handle.update(users).set({ publicSharingEnabled: enabled ? 1 : 0 }).where(eq(users.id, userId));
  }

  async deleteUser(userId: string): Promise<void> {
    await this.handle.delete(users).where(eq(users.id, userId));
  }

  async destroySessionsForUser(userId: string, exceptSid?: string): Promise<void> {
    // connect-pg-simple stores the passport user inside the sess JSON
    // column as {"passport":{"user":"<id>"}}. Deleting those rows makes the
    // corresponding cookies useless immediately (the server no longer
    // recognizes the session id they carry).
    if (exceptSid) {
      await this.handle.execute(
        sql`delete from "session" where "sess"->'passport'->>'user' = ${userId} and "sid" <> ${exceptSid}`
      );
    } else {
      await this.handle.execute(
        sql`delete from "session" where "sess"->'passport'->>'user' = ${userId}`
      );
    }
  }

  // Album methods
  async getAlbum(id: string): Promise<Album | undefined> {
    const [album] = await this.handle.select().from(albums).where(eq(albums.id, id));
    return album;
  }

  async getAlbumByShareToken(shareToken: string): Promise<Album | undefined> {
    const [album] = await this.handle.select().from(albums).where(eq(albums.shareToken, shareToken));
    return album;
  }

  async getAlbumsByUserId(userId: string): Promise<Album[]> {
    return this.handle.select().from(albums).where(eq(albums.userId, userId));
  }

  async createAlbum(insertAlbum: InsertAlbum, userId: string): Promise<Album> {
    const [album] = await this.handle
      .insert(albums)
      .values({ ...insertAlbum, userId })
      .returning();
    return album;
  }

  async deleteAlbum(id: string): Promise<void> {
    await this.handle.delete(albums).where(eq(albums.id, id));
  }

  async lockAlbum(id: string): Promise<void> {
    await this.handle.update(albums).set({ isLocked: 1 }).where(eq(albums.id, id));
  }

  async unlockAlbum(id: string): Promise<void> {
    await this.handle.update(albums).set({ isLocked: 0 }).where(eq(albums.id, id));
  }

  async setAlbumSharing(id: string, isPublic: boolean, shareToken?: string): Promise<Album> {
    const updates: Partial<Album> = { isPublic: isPublic ? 1 : 0 };
    if (shareToken) updates.shareToken = shareToken;
    const [album] = await this.handle.update(albums).set(updates).where(eq(albums.id, id)).returning();
    return album;
  }

  async revokeAlbumSharing(id: string): Promise<void> {
    // shareToken = NULL is the whole point: the token is destroyed, not
    // just disabled. Re-enabling sharing generates a NEW token, so a link
    // that was handed out and then revoked can never start working again.
    await this.handle.update(albums).set({ isPublic: 0, shareToken: null }).where(eq(albums.id, id));
  }

  async revokeAllAlbumSharesForUser(userId: string): Promise<void> {
    await this.handle
      .update(albums)
      .set({ isPublic: 0, shareToken: null })
      .where(eq(albums.userId, userId));
  }

  // Media methods
  async getMedia(id: string): Promise<Media | undefined> {
    const [mediaItem] = await this.handle.select().from(media).where(eq(media.id, id));
    return mediaItem;
  }

  async getMediaByAlbumId(albumId: string): Promise<Media[]> {
    return this.handle.select().from(media).where(eq(media.albumId, albumId));
  }

  async getMediaByUserId(userId: string): Promise<Media[]> {
    // Cross-album listing: everything the user owns EXCEPT media in locked
    // albums and orphaned rows whose album no longer exists. Those are only
    // reachable through the album itself (with the PIN, if locked).
    return this.handle
      .select({ m: media })
      .from(media)
      .leftJoin(albums, eq(media.albumId, albums.id))
      .where(and(...accessibleMediaCondition(userId)))
      .orderBy(desc(media.createdAt))
      .then((rows: { m: Media }[]) => rows.map((r) => r.m));
  }

  async getMediaByIds(ids: string[], userId: string): Promise<Media[]> {
    if (ids.length === 0) return [];
    // SECURITY: always scoped to userId — this is what prevents batch
    // delete/move/favorite from touching another user's media just because
    // they guessed/enumerated an id.
    return this.handle
      .select()
      .from(media)
      .where(and(inArray(media.id, ids), eq(media.userId, userId)));
  }

  async createMedia(
    insertMedia: InsertMedia,
    userId: string,
    cloudinaryInfo?: { publicId: string; resourceType: string },
    identity?: { id: string }
  ): Promise<Media> {
    const values: typeof insertMedia & { id?: string; userId: string } = {
      ...insertMedia,
      userId,
      cloudinaryPublicId: cloudinaryInfo?.publicId ?? null,
      cloudinaryResourceType: cloudinaryInfo?.resourceType ?? null,
    };
    if (identity?.id) {
      values.id = identity.id;
    }

    // PRIMARY-KEY DEDUPLICATION: when the client supplies its stable upload
    // id, the row id is deterministic. If the upload actually succeeded
    // earlier but the response was lost (proxy timeout, dropped connection)
    // and the client retried, the insert conflicts on the primary key and
    // we return the ORIGINAL row instead of creating a duplicate record for
    // the same underlying asset.
    if (identity?.id) {
      const inserted = await this.handle
        .insert(media)
        .values(values as any)
        .onConflictDoNothing({ target: media.id })
        .returning();
      if (inserted.length > 0) return inserted[0];
      const [existing] = await this.handle.select().from(media).where(eq(media.id, identity.id));
      if (existing) return existing;
    }

    const [mediaItem] = await this.handle.insert(media).values(values as any).returning();
    return mediaItem;
  }

  async deleteMedia(id: string): Promise<void> {
    await this.handle.delete(media).where(eq(media.id, id));
  }

  async deleteMediaBatch(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await this.handle.delete(media).where(inArray(media.id, ids));
  }

  async moveMediaBatch(ids: string[], albumId: string): Promise<void> {
    if (ids.length === 0) return;
    await this.handle.update(media).set({ albumId }).where(inArray(media.id, ids));
  }

  async setMediaFavorite(id: string, isFavorite: boolean): Promise<void> {
    await this.handle.update(media).set({ isFavorite: isFavorite ? 1 : 0 }).where(eq(media.id, id));
  }

  async searchMedia(userId: string, params: SearchMediaParams): Promise<SearchMediaResult> {
    const page = Math.max(1, Math.floor(params.page ?? 1));
    const limit = Math.max(1, Math.min(100, Math.floor(params.limit ?? 24)));
    const conditions: SqlExp[] = accessibleMediaCondition(userId);

    // Media category filter (works with or without a text query).
    if (params.type === "image") {
      conditions.push(sql`${media.type} like 'image/%'`);
    } else if (params.type === "video") {
      conditions.push(sql`${media.type} like 'video/%'`);
    }

    if (params.favorite) {
      conditions.push(eq(media.isFavorite, 1));
    }

    // Multi-word text query: every word must match somewhere (AND of ORs).
    const trimmed = (params.query ?? "").trim();
    if (trimmed) {
      const words = trimmed.split(/\s+/).filter(Boolean).slice(0, 8);
      for (const word of words) {
        conditions.push(wordMatchCondition(word));
      }
    }

    const where = and(...conditions);

    // Newest first with a deterministic tie-breaker so pagination is stable
    // when many rows share a timestamp.
    const orderBy = [desc(media.createdAt), desc(media.id)];

    const [items, countRows] = await Promise.all([
      this.handle
        .select({ m: media })
        .from(media)
        .leftJoin(albums, eq(media.albumId, albums.id))
        .where(where)
        .orderBy(...orderBy)
        .limit(limit)
        .offset((page - 1) * limit)
        .then((rows: { m: Media }[]) => rows.map((r) => r.m)),
      this.handle
        .select({ count: sql<number>`count(*)::int` })
        .from(media)
        .leftJoin(albums, eq(media.albumId, albums.id))
        .where(where),
    ]);

    return {
      items,
      total: countRows[0]?.count ?? 0,
      page,
      limit,
    };
  }

  // Password reset token methods
  async createPasswordResetToken(insertToken: InsertPasswordResetToken): Promise<PasswordResetToken> {
    const [token] = await this.handle
      .insert(passwordResetTokens)
      .values(insertToken)
      .returning();
    return token;
  }

  async getPasswordResetToken(token: string): Promise<PasswordResetToken | undefined> {
    const [resetToken] = await this.handle
      .select()
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.token, token));
    return resetToken;
  }

  async deletePasswordResetToken(token: string): Promise<void> {
    await this.handle.delete(passwordResetTokens).where(eq(passwordResetTokens.token, token));
  }

  async deleteExpiredTokens(): Promise<void> {
    await this.handle.delete(passwordResetTokens).where(lt(passwordResetTokens.expiresAt, new Date()));
  }

  async deleteTokensForUser(userId: string): Promise<void> {
    await this.handle.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, userId));
  }

  async updateUserPassword(userId: string, hashedPassword: string): Promise<void> {
    await this.handle.update(users).set({ password: hashedPassword }).where(eq(users.id, userId));
  }

  async consumePasswordResetTokenAndSetPassword(
    token: string,
    hashedPassword: string
  ): Promise<ConsumeResetResult> {
    return this.handle.transaction(async (tx: any) => {
      // Row-lock the token so two concurrent requests with the same link
      // can't both pass the "still valid" check and consume it twice.
      const locked = await tx.execute(
        sql`select "id", "user_id", "expires_at" from "password_reset_tokens" where "token" = ${token} for update`
      );
      const rows = (locked as any).rows ?? [];
      if (!rows || rows.length === 0) {
        return { ok: false as const, reason: "invalid" as const };
      }
      const row = rows[0];
      const expiresAt = row.expires_at instanceof Date ? row.expires_at : new Date(row.expires_at);
      if (expiresAt.getTime() <= Date.now()) {
        // Expired: remove it so the link can't be retried, and report.
        await tx.execute(sql`delete from "password_reset_tokens" where "token" = ${token}`);
        return { ok: false as const, reason: "expired" as const };
      }

      await tx.execute(sql`delete from "password_reset_tokens" where "token" = ${token}`);
      await tx.execute(sql`update "users" set "password" = ${hashedPassword} where "id" = ${row.user_id}`);
      await tx.execute(
        sql`delete from "session" where "sess"->'passport'->>'user' = ${row.user_id}`
      );
      return { ok: true as const, userId: row.user_id as string };
    });
  }

  // Email change tokens
  async createEmailChangeToken(data: { userId: string; newEmail: string; token: string; expiresAt: Date }): Promise<EmailChangeToken> {
    const [row] = await this.handle.insert(emailChangeTokens).values(data).returning();
    return row;
  }

  async getEmailChangeToken(token: string): Promise<EmailChangeToken | undefined> {
    const [row] = await this.handle.select().from(emailChangeTokens).where(eq(emailChangeTokens.token, token));
    return row;
  }

  async deleteEmailChangeToken(token: string): Promise<void> {
    await this.handle.delete(emailChangeTokens).where(eq(emailChangeTokens.token, token));
  }

  async deleteEmailChangeTokensForUser(userId: string): Promise<void> {
    await this.handle.delete(emailChangeTokens).where(eq(emailChangeTokens.userId, userId));
  }

  async deleteExpiredEmailChangeTokens(): Promise<void> {
    await this.handle.delete(emailChangeTokens).where(lt(emailChangeTokens.expiresAt, new Date()));
  }

  async getUserStorageUsageBytes(userId: string): Promise<number> {
    const items = await this.getMediaByUserId(userId);
    return items.reduce((total, item) => total + (item.size || 0), 0);
  }

  // Search history
  async addSearchHistoryEntry(userId: string, query: string): Promise<void> {
    const trimmed = query.trim();
    if (!trimmed) return;

    // De-duplicate case-insensitively AND literally: `%`/`_` in the term
    // are matched as plain characters (escaped), never as SQL wildcards.
    const escaped = escapeLike(trimmed.toLowerCase());
    await this.handle
      .delete(searchHistory)
      .where(
        and(
          eq(searchHistory.userId, userId),
          sql`lower(${searchHistory.query}) like ${escaped} escape '\\'`
        )
      );

    await this.handle.insert(searchHistory).values({ userId, query: trimmed });

    // Keep only the most recent 20 entries per user so this table doesn't
    // grow without bound.
    const all = await this.handle
      .select()
      .from(searchHistory)
      .where(eq(searchHistory.userId, userId))
      .orderBy(desc(searchHistory.createdAt));

    const stale = all.slice(20);
    if (stale.length > 0) {
      await this.handle.delete(searchHistory).where(inArray(searchHistory.id, stale.map((s: SearchHistory) => s.id)));
    }
  }

  async getRecentSearchHistory(userId: string, limit = 8): Promise<SearchHistory[]> {
    return this.handle
      .select()
      .from(searchHistory)
      .where(eq(searchHistory.userId, userId))
      .orderBy(desc(searchHistory.createdAt))
      .limit(limit);
  }

  async deleteSearchHistoryEntry(id: string, userId: string): Promise<void> {
    await this.handle
      .delete(searchHistory)
      .where(and(eq(searchHistory.id, id), eq(searchHistory.userId, userId)));
  }

  async clearSearchHistory(userId: string): Promise<void> {
    await this.handle.delete(searchHistory).where(eq(searchHistory.userId, userId));
  }
}

export const storage = new DBStorage();
