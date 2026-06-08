import {
  type User,
  type InsertUser,
  type Album,
  type InsertAlbum,
  type Media,
  type InsertMedia,
  type PasswordResetToken,
  type InsertPasswordResetToken,
} from "@shared/schema";
import { db } from "./db";
import { users, albums, media, passwordResetTokens } from "@shared/schema";
import { eq, and, or, like, lt } from "drizzle-orm";

export interface IStorage {
  // User methods
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUserPin(userId: string, hashedPin: string): Promise<void>;
  deleteUser(userId: string): Promise<void>;

  // Album methods
  getAlbum(id: string): Promise<Album | undefined>;
  getAlbumsByUserId(userId: string): Promise<Album[]>;
  createAlbum(album: InsertAlbum, userId: string): Promise<Album>;
  deleteAlbum(id: string): Promise<void>;
  lockAlbum(id: string): Promise<void>;
  unlockAlbum(id: string): Promise<void>;

  // Media methods
  getMedia(id: string): Promise<Media | undefined>;
  getMediaByAlbumId(albumId: string): Promise<Media[]>;
  getMediaByUserId(userId: string): Promise<Media[]>;
  createMedia(mediaItem: InsertMedia, userId: string): Promise<Media>;
  deleteMedia(id: string): Promise<void>;
  searchMedia(userId: string, query: string): Promise<Media[]>;

  // Password reset token methods
  createPasswordResetToken(token: InsertPasswordResetToken): Promise<PasswordResetToken>;
  getPasswordResetToken(token: string): Promise<PasswordResetToken | undefined>;
  deletePasswordResetToken(token: string): Promise<void>;
  deleteExpiredTokens(): Promise<void>;
  updateUserPassword(userId: string, hashedPassword: string): Promise<void>;
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

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async updateUserPin(userId: string, hashedPin: string): Promise<void> {
    await db.update(users).set({ pin: hashedPin }).where(eq(users.id, userId));
  }

  async deleteUser(userId: string): Promise<void> {
    await db.delete(users).where(eq(users.id, userId));
  }

  // Album methods
  async getAlbum(id: string): Promise<Album | undefined> {
    const [album] = await db.select().from(albums).where(eq(albums.id, id));
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

  async createMedia(insertMedia: InsertMedia, userId: string): Promise<Media> {
    const [mediaItem] = await db
      .insert(media)
      .values({ ...insertMedia, userId })
      .returning();
    return mediaItem;
  }

  async deleteMedia(id: string): Promise<void> {
    await db.delete(media).where(eq(media.id, id));
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

  async updateUserPassword(userId: string, hashedPassword: string): Promise<void> {
    await db.update(users).set({ password: hashedPassword }).where(eq(users.id, userId));
  }
}

export const storage = new DBStorage();
