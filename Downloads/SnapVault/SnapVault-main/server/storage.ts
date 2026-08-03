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
import { eq, and, or, like, lt, inArray, desc, ilike } from "drizzle-orm";

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

  // Album methods
  getAlbum(id: string): Promise<Album | undefined>;
  getAlbumByShareToken(shareToken: string): Promise<Album | undefined>;
  getAlbumsByUserId(userId: string): Promise<Album[]>;
  createAlbum(album: InsertAlbum, userId: string): Promise<Album>;
  deleteAlbum(id: string): Promise<void>;
  lockAlbum(id: string): Promise<void>;
  unlockAlbum(id: string): Promise<void>;
  setAlbumSharing(id: string, isPublic: boolean, shareToken?: string): Promise<Album>;

  // Media methods
  getMedia(id: string): Promise<Media | undefined>;
  getMediaByAlbumId(albumId: string): Promise<Media[]>;
  getMediaByUserId(userId: string): Promise<Media[]>;
  getMediaByIds(ids: string[], userId: string): Promise<Media[]>;
  createMedia(
    mediaItem: InsertMedia,
    userId: string,
    cloudinaryInfo?: { publicId: string; resourceType: string }
  ): Promise<Media>;
  deleteMedia(id: string): Promise<void>;
  deleteMediaBatch(ids: string[]): Promise<void>;
  moveMediaBatch(ids: string[], albumId: string): Promise<void>;
  setMediaFavorite(id: string, isFavorite: boolean): Promise<void>;
  searchMedia(userId: string, query: string): Promise<Media[]>;

  // Password reset token methods
  createPasswordResetToken(token: InsertPasswordResetToken): Promise<PasswordResetToken>;
  getPasswordResetToken(token: string): Promise<PasswordResetToken | undefined>;
  deletePasswordResetToken(token: string): Promise<void>;
  deleteExpiredTokens(): Promise<void>;
  deleteTokensForUser(userId: string): Promise<void>;
  updateUserPassword(userId: string, hashedPassword: string): Promise<void>;

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

export class DBStorage implements IStorage {
  // User methods
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async getUserByGoogleId(googleId: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.googleId, googleId));
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async createOAuthUser(data: { email: string; googleId: string }): Promise<User> {
    // No password, no PIN — Google is the only way in until/unless the
    // person sets a password or PIN later from Settings.
    const [user] = await db
      .insert(users)
      .values({ email: data.email, googleId: data.googleId, password: null, pin: null })
      .returning();
    return user;
  }

  async linkGoogleAccount(userId: string, googleId: string): Promise<User> {
    const [user] = await db
      .update(users)
      .set({ googleId })
      .where(eq(users.id, userId))
      .returning();
    return user;
  }

  async updateUserPin(userId: string, hashedPin: string): Promise<void> {
    await db.update(users).set({ pin: hashedPin }).where(eq(users.id, userId));
  }

  async updateUserEmail(userId: string, email: string): Promise<void> {
    await db.update(users).set({ email }).where(eq(users.id, userId));
  }

  async setPublicSharingEnabled(userId: string, enabled: boolean): Promise<void> {
    await db.update(users).set({ publicSharingEnabled: enabled ? 1 : 0 }).where(eq(users.id, userId));
  }

  async deleteUser(userId: string): Promise<void> {
    await db.delete(users).where(eq(users.id, userId));
  }

  // Album methods
  async getAlbum(id: string): Promise<Album | undefined> {
    const [album] = await db.select().from(albums).where(eq(albums.id, id));
    return album;
  }

  async getAlbumByShareToken(shareToken: string): Promise<Album | undefined> {
    const [album] = await db.select().from(albums).where(eq(albums.shareToken, shareToken));
    return album;
  }

  async getAlbumsByUserId(userId: string): Promise<Album[]> {
    return db.select().from(albums).where(eq(albums.userId, userId));
  }

  async createAlbum(insertAlbum: InsertAlbum, userId: string): Promise<Album> {
    const [album] = await db
      .insert(albums)
      .values({ ...insertAlbum, userId })
      .returning();
    return album;
  }

  async deleteAlbum(id: string): Promise<void> {
    await db.delete(albums).where(eq(albums.id, id));
  }

  async lockAlbum(id: string): Promise<void> {
    await db.update(albums).set({ isLocked: 1 }).where(eq(albums.id, id));
  }

  async unlockAlbum(id: string): Promise<void> {
    await db.update(albums).set({ isLocked: 0 }).where(eq(albums.id, id));
  }

  async setAlbumSharing(id: string, isPublic: boolean, shareToken?: string): Promise<Album> {
    const updates: Partial<Album> = { isPublic: isPublic ? 1 : 0 };
    if (shareToken) updates.shareToken = shareToken;
    const [album] = await db.update(albums).set(updates).where(eq(albums.id, id)).returning();
    return album;
  }

  // Media methods
  async getMedia(id: string): Promise<Media | undefined> {
    const [mediaItem] = await db.select().from(media).where(eq(media.id, id));
    return mediaItem;
  }

  async getMediaByAlbumId(albumId: string): Promise<Media[]> {
    return db.select().from(media).where(eq(media.albumId, albumId));
  }

  async getMediaByUserId(userId: string): Promise<Media[]> {
    return db.select().from(media).where(eq(media.userId, userId));
  }

  async getMediaByIds(ids: string[], userId: string): Promise<Media[]> {
    if (ids.length === 0) return [];
    // SECURITY: always scoped to userId — this is what prevents batch
    // delete/move/favorite from touching another user's media just because
    // they guessed/enumerated an id.
    return db
      .select()
      .from(media)
      .where(and(inArray(media.id, ids), eq(media.userId, userId)));
  }

  async createMedia(
    insertMedia: InsertMedia,
    userId: string,
    cloudinaryInfo?: { publicId: string; resourceType: string }
  ): Promise<Media> {
    const [mediaItem] = await db
      .insert(media)
      .values({
        ...insertMedia,
        userId,
        cloudinaryPublicId: cloudinaryInfo?.publicId ?? null,
        cloudinaryResourceType: cloudinaryInfo?.resourceType ?? null,
      })
      .returning();
    return mediaItem;
  }

  async deleteMedia(id: string): Promise<void> {
    await db.delete(media).where(eq(media.id, id));
  }

  async deleteMediaBatch(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await db.delete(media).where(inArray(media.id, ids));
  }

  async moveMediaBatch(ids: string[], albumId: string): Promise<void> {
    if (ids.length === 0) return;
    await db.update(media).set({ albumId }).where(inArray(media.id, ids));
  }

  async setMediaFavorite(id: string, isFavorite: boolean): Promise<void> {
    await db.update(media).set({ isFavorite: isFavorite ? 1 : 0 }).where(eq(media.id, id));
  }

  async searchMedia(userId: string, query: string): Promise<Media[]> {
    return db
      .select()
      .from(media)
      .where(
        and(
          eq(media.userId, userId),
          or(
            like(media.filename, `%${query}%`),
            like(media.type, `%${query}%`)
          )
        )
      );
  }

  // Password reset token methods
  async createPasswordResetToken(insertToken: InsertPasswordResetToken): Promise<PasswordResetToken> {
    const [token] = await db
      .insert(passwordResetTokens)
      .values(insertToken)
      .returning();
    return token;
  }

  async getPasswordResetToken(token: string): Promise<PasswordResetToken | undefined> {
    const [resetToken] = await db
      .select()
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.token, token));
    return resetToken;
  }

  async deletePasswordResetToken(token: string): Promise<void> {
    await db.delete(passwordResetTokens).where(eq(passwordResetTokens.token, token));
  }

  async deleteExpiredTokens(): Promise<void> {
    await db.delete(passwordResetTokens).where(lt(passwordResetTokens.expiresAt, new Date()));
  }

  async deleteTokensForUser(userId: string): Promise<void> {
    await db.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, userId));
  }

  async updateUserPassword(userId: string, hashedPassword: string): Promise<void> {
    await db.update(users).set({ password: hashedPassword }).where(eq(users.id, userId));
  }

  // Email change tokens
  async createEmailChangeToken(data: { userId: string; newEmail: string; token: string; expiresAt: Date }): Promise<EmailChangeToken> {
    const [row] = await db.insert(emailChangeTokens).values(data).returning();
    return row;
  }

  async getEmailChangeToken(token: string): Promise<EmailChangeToken | undefined> {
    const [row] = await db.select().from(emailChangeTokens).where(eq(emailChangeTokens.token, token));
    return row;
  }

  async deleteEmailChangeToken(token: string): Promise<void> {
    await db.delete(emailChangeTokens).where(eq(emailChangeTokens.token, token));
  }

  async deleteEmailChangeTokensForUser(userId: string): Promise<void> {
    await db.delete(emailChangeTokens).where(eq(emailChangeTokens.userId, userId));
  }

  async deleteExpiredEmailChangeTokens(): Promise<void> {
    await db.delete(emailChangeTokens).where(lt(emailChangeTokens.expiresAt, new Date()));
  }

  async getUserStorageUsageBytes(userId: string): Promise<number> {
    const items = await this.getMediaByUserId(userId);
    return items.reduce((total, item) => total + (item.size || 0), 0);
  }

  // Search history
  async addSearchHistoryEntry(userId: string, query: string): Promise<void> {
    const trimmed = query.trim();
    if (!trimmed) return;

    // De-duplicate case-insensitively: remove any existing entry for the
    // same term before inserting, so re-searching something bumps it back
    // to the top of "recent" instead of showing the term twice.
    await db
      .delete(searchHistory)
      .where(and(eq(searchHistory.userId, userId), ilike(searchHistory.query, trimmed)));

    await db.insert(searchHistory).values({ userId, query: trimmed });

    // Keep only the most recent 20 entries per user so this table doesn't
    // grow without bound.
    const all = await db
      .select()
      .from(searchHistory)
      .where(eq(searchHistory.userId, userId))
      .orderBy(desc(searchHistory.createdAt));

    const stale = all.slice(20);
    if (stale.length > 0) {
      await db.delete(searchHistory).where(inArray(searchHistory.id, stale.map((s) => s.id)));
    }
  }

  async getRecentSearchHistory(userId: string, limit = 8): Promise<SearchHistory[]> {
    return db
      .select()
      .from(searchHistory)
      .where(eq(searchHistory.userId, userId))
      .orderBy(desc(searchHistory.createdAt))
      .limit(limit);
  }

  async deleteSearchHistoryEntry(id: string, userId: string): Promise<void> {
    await db
      .delete(searchHistory)
      .where(and(eq(searchHistory.id, id), eq(searchHistory.userId, userId)));
  }

  async clearSearchHistory(userId: string): Promise<void> {
    await db.delete(searchHistory).where(eq(searchHistory.userId, userId));
  }
}

export const storage = new DBStorage();
