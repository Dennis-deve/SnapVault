import { randomUUID } from "crypto";
import type { IStorage } from "../storage";
import type {
  User,
  InsertUser,
  Album,
  InsertAlbum,
  Media,
  InsertMedia,
  PasswordResetToken,
  InsertPasswordResetToken,
  EmailChangeToken,
  SearchHistory,
} from "@shared/schema";

/**
 * In-memory stand-in for DBStorage, used only in tests so the auth/
 * authorization test suite can run without a live Postgres database. Not a
 * complete Drizzle-query emulator — just enough behavior (lookups, simple
 * filters) to exercise the routes under test faithfully.
 */
export class FakeStorage implements IStorage {
  users = new Map<string, User>();
  albums = new Map<string, Album>();
  media = new Map<string, Media>();
  passwordResetTokens = new Map<string, PasswordResetToken>();
  emailChangeTokens = new Map<string, EmailChangeToken>();
  searchHistory = new Map<string, SearchHistory>();

  reset() {
    this.users.clear();
    this.albums.clear();
    this.media.clear();
    this.passwordResetTokens.clear();
    this.emailChangeTokens.clear();
    this.searchHistory.clear();
  }

  // ---- Users ----
  async getUser(id: string) {
    return this.users.get(id);
  }
  async getUserByEmail(email: string) {
    return Array.from(this.users.values()).find((u) => u.email.toLowerCase() === email.toLowerCase());
  }
  async getUserByGoogleId(googleId: string) {
    return Array.from(this.users.values()).find((u) => u.googleId === googleId);
  }
  async createUser(user: InsertUser): Promise<User> {
    const id = randomUUID();
    const created: User = {
      id,
      email: user.email,
      password: user.password ?? null,
      pin: user.pin ?? null,
      googleId: null,
      publicSharingEnabled: 0,
    };
    this.users.set(id, created);
    return created;
  }
  async createOAuthUser(data: { email: string; googleId: string }): Promise<User> {
    const id = randomUUID();
    const created: User = {
      id,
      email: data.email,
      password: null,
      pin: null,
      googleId: data.googleId,
      publicSharingEnabled: 0,
    };
    this.users.set(id, created);
    return created;
  }
  async linkGoogleAccount(userId: string, googleId: string): Promise<User> {
    const user = this.users.get(userId)!;
    user.googleId = googleId;
    return user;
  }
  async updateUserPin(userId: string, hashedPin: string) {
    const user = this.users.get(userId);
    if (user) user.pin = hashedPin;
  }
  async updateUserEmail(userId: string, email: string) {
    const user = this.users.get(userId);
    if (user) user.email = email;
  }
  async setPublicSharingEnabled(userId: string, enabled: boolean) {
    const user = this.users.get(userId);
    if (user) user.publicSharingEnabled = enabled ? 1 : 0;
  }
  async updateUserPassword(userId: string, hashedPassword: string) {
    const user = this.users.get(userId);
    if (user) user.password = hashedPassword;
  }
  async deleteUser(userId: string) {
    this.users.delete(userId);
  }

  // ---- Albums ----
  async getAlbum(id: string) {
    return this.albums.get(id);
  }
  async getAlbumByShareToken(shareToken: string) {
    return Array.from(this.albums.values()).find((a) => a.shareToken === shareToken);
  }
  async getAlbumsByUserId(userId: string) {
    return Array.from(this.albums.values()).filter((a) => a.userId === userId);
  }
  async createAlbum(album: InsertAlbum, userId: string): Promise<Album> {
    const id = randomUUID();
    const created: Album = {
      id,
      name: album.name,
      description: album.description ?? null,
      userId,
      isLocked: 0,
      isPublic: 0,
      shareToken: null,
      createdAt: new Date(),
    };
    this.albums.set(id, created);
    return created;
  }
  async deleteAlbum(id: string) {
    this.albums.delete(id);
  }
  async lockAlbum(id: string) {
    const album = this.albums.get(id);
    if (album) album.isLocked = 1;
  }
  async unlockAlbum(id: string) {
    const album = this.albums.get(id);
    if (album) album.isLocked = 0;
  }
  async setAlbumSharing(id: string, isPublic: boolean, shareToken?: string): Promise<Album> {
    const album = this.albums.get(id)!;
    album.isPublic = isPublic ? 1 : 0;
    if (shareToken) album.shareToken = shareToken;
    return album;
  }

  // ---- Media ----
  async getMedia(id: string) {
    return this.media.get(id);
  }
  async getMediaByAlbumId(albumId: string) {
    return Array.from(this.media.values()).filter((m) => m.albumId === albumId);
  }
  async getMediaByUserId(userId: string) {
    return Array.from(this.media.values()).filter((m) => m.userId === userId);
  }
  async getMediaByIds(ids: string[], userId: string) {
    return Array.from(this.media.values()).filter((m) => ids.includes(m.id) && m.userId === userId);
  }
  async createMedia(
    mediaItem: InsertMedia,
    userId: string,
    cloudinaryInfo?: { publicId: string; resourceType: string }
  ): Promise<Media> {
    const id = randomUUID();
    const created: Media = {
      id,
      filename: mediaItem.filename,
      path: mediaItem.path,
      type: mediaItem.type,
      size: mediaItem.size,
      albumId: mediaItem.albumId ?? null,
      userId,
      isFavorite: 0,
      cloudinaryPublicId: cloudinaryInfo?.publicId ?? null,
      cloudinaryResourceType: cloudinaryInfo?.resourceType ?? null,
      createdAt: new Date(),
    };
    this.media.set(id, created);
    return created;
  }
  async deleteMedia(id: string) {
    this.media.delete(id);
  }
  async deleteMediaBatch(ids: string[]) {
    ids.forEach((id) => this.media.delete(id));
  }
  async moveMediaBatch(ids: string[], albumId: string) {
    ids.forEach((id) => {
      const m = this.media.get(id);
      if (m) m.albumId = albumId;
    });
  }
  async setMediaFavorite(id: string, isFavorite: boolean) {
    const m = this.media.get(id);
    if (m) m.isFavorite = isFavorite ? 1 : 0;
  }
  async searchMedia(userId: string, query: string) {
    const q = query.toLowerCase();
    return Array.from(this.media.values()).filter(
      (m) => m.userId === userId && (m.filename.toLowerCase().includes(q) || m.type.toLowerCase().includes(q))
    );
  }

  // ---- Password reset tokens ----
  async createPasswordResetToken(token: InsertPasswordResetToken): Promise<PasswordResetToken> {
    const id = randomUUID();
    const created: PasswordResetToken = { id, ...token, createdAt: new Date() };
    this.passwordResetTokens.set(token.token, created);
    return created;
  }
  async getPasswordResetToken(token: string) {
    return this.passwordResetTokens.get(token);
  }
  async deletePasswordResetToken(token: string) {
    this.passwordResetTokens.delete(token);
  }
  async deleteExpiredTokens() {
    for (const [key, t] of Array.from(this.passwordResetTokens.entries())) {
      if (t.expiresAt < new Date()) this.passwordResetTokens.delete(key);
    }
  }
  async deleteTokensForUser(userId: string) {
    for (const [key, t] of Array.from(this.passwordResetTokens.entries())) {
      if (t.userId === userId) this.passwordResetTokens.delete(key);
    }
  }

  // ---- Email change tokens ----
  async createEmailChangeToken(data: { userId: string; newEmail: string; token: string; expiresAt: Date }) {
    const id = randomUUID();
    const created: EmailChangeToken = { id, ...data, createdAt: new Date() };
    this.emailChangeTokens.set(data.token, created);
    return created;
  }
  async getEmailChangeToken(token: string) {
    return this.emailChangeTokens.get(token);
  }
  async deleteEmailChangeToken(token: string) {
    this.emailChangeTokens.delete(token);
  }
  async deleteEmailChangeTokensForUser(userId: string) {
    for (const [key, t] of Array.from(this.emailChangeTokens.entries())) {
      if (t.userId === userId) this.emailChangeTokens.delete(key);
    }
  }
  async deleteExpiredEmailChangeTokens() {
    for (const [key, t] of Array.from(this.emailChangeTokens.entries())) {
      if (t.expiresAt < new Date()) this.emailChangeTokens.delete(key);
    }
  }

  // ---- Storage usage ----
  async getUserStorageUsageBytes(userId: string) {
    return Array.from(this.media.values())
      .filter((m) => m.userId === userId)
      .reduce((total, m) => total + (m.size || 0), 0);
  }

  // ---- Search history ----
  async addSearchHistoryEntry(userId: string, query: string) {
    const id = randomUUID();
    const created: SearchHistory = { id, userId, query, createdAt: new Date() };
    this.searchHistory.set(id, created);
  }
  async getRecentSearchHistory(userId: string, limit = 8) {
    return Array.from(this.searchHistory.values())
      .filter((s) => s.userId === userId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);
  }
  async deleteSearchHistoryEntry(id: string, userId: string) {
    const entry = this.searchHistory.get(id);
    if (entry && entry.userId === userId) this.searchHistory.delete(id);
  }
  async clearSearchHistory(userId: string) {
    for (const [key, s] of Array.from(this.searchHistory.entries())) {
      if (s.userId === userId) this.searchHistory.delete(key);
    }
  }
}

export const fakeStorage = new FakeStorage();
