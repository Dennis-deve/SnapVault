import {
  type User,
  type InsertUser,
  type Album,
  type InsertAlbum,
  type Media,
  type InsertMedia,
} from "@shared/schema";
import { db } from "./db";
import { users, albums, media } from "@shared/schema";
import { eq, and, or, like } from "drizzle-orm";

export interface IStorage {
  // User methods
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

  // Album methods
  getAlbum(id: string): Promise<Album | undefined>;
  getAlbumsByUserId(userId: string): Promise<Album[]>;
  createAlbum(album: InsertAlbum, userId: string): Promise<Album>;
  deleteAlbum(id: string): Promise<void>;

  // Media methods
  getMedia(id: string): Promise<Media | undefined>;
  getMediaByAlbumId(albumId: string): Promise<Media[]>;
  getMediaByUserId(userId: string): Promise<Media[]>;
  createMedia(mediaItem: InsertMedia, userId: string): Promise<Media>;
  deleteMedia(id: string): Promise<void>;
  searchMedia(userId: string, query: string): Promise<Media[]>;
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
}

export const storage = new DBStorage();
