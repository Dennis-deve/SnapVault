import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import bcrypt from "bcryptjs";
import { users, albums, media, searchHistory } from "@shared/schema";
import { eq } from "drizzle-orm";

// Importing DBStorage transitively imports server/db.ts (the real Neon
// connection), which insists on DATABASE_URL. Give it a placeholder — it is
// never used: this suite injects the embedded PGlite handle instead.
vi.stubEnv("DATABASE_URL", "postgres://placeholder:not-used@localhost/placeholder");
const { DBStorage } = await import("../storage");

/**
 * These tests run DBStorage's REAL SQL — joins, LIKE escaping, row locking,
 * transactions — against an embedded PostgreSQL (PGlite). No mocks: the
 * same drizzle query builders the production Neon connection executes are
 * executed here against a real engine, so SQL semantics (case folding,
 * ESCAPE clauses, FOR UPDATE, ON CONFLICT) are actually verified.
 */

let client: PGlite;
let storage: DBStorage;
let db: ReturnType<typeof drizzle>;

const DDL = `
create table if not exists "users" (
  "id" varchar primary key default gen_random_uuid(),
  "email" text not null unique,
  "password" text,
  "pin" text,
  "google_id" text unique,
  "public_sharing_enabled" integer default 0 not null
);
create table if not exists "session" (
  "sid" varchar not null primary key,
  "sess" json not null,
  "expire" timestamp not null
);
create table if not exists "albums" (
  "id" varchar primary key default gen_random_uuid(),
  "name" text not null,
  "description" text,
  "user_id" varchar not null,
  "is_locked" integer default 0 not null,
  "is_public" integer default 0 not null,
  "share_token" text unique,
  "created_at" timestamp not null default now()
);
create table if not exists "media" (
  "id" varchar primary key default gen_random_uuid(),
  "filename" text not null,
  "path" text not null,
  "type" text not null,
  "size" integer not null,
  "album_id" varchar,
  "user_id" varchar not null,
  "is_favorite" integer default 0 not null,
  "cloudinary_public_id" text,
  "cloudinary_resource_type" text,
  "created_at" timestamp not null default now()
);
create table if not exists "password_reset_tokens" (
  "id" varchar primary key default gen_random_uuid(),
  "user_id" varchar not null,
  "token" text not null unique,
  "expires_at" timestamp not null,
  "created_at" timestamp not null default now()
);
create table if not exists "email_change_tokens" (
  "id" varchar primary key default gen_random_uuid(),
  "user_id" varchar not null,
  "new_email" text not null,
  "token" text not null unique,
  "expires_at" timestamp not null,
  "created_at" timestamp not null default now()
);
create table if not exists "search_history" (
  "id" varchar primary key default gen_random_uuid(),
  "user_id" varchar not null,
  "query" text not null,
  "created_at" timestamp not null default now()
);
`;

async function seedUser(email: string): Promise<string> {
  const [user] = await db
    .insert(users)
    .values({ email, password: await bcrypt.hash("old-password-1", 4) })
    .returning();
  return user.id;
}

beforeAll(async () => {
  client = new PGlite();
  db = drizzle(client);
  await client.exec(DDL);
  storage = new DBStorage(db as any);
});

beforeEach(async () => {
  await client.exec(`
    delete from "users"; delete from "session"; delete from "albums";
    delete from "media"; delete from "password_reset_tokens";
    delete from "email_change_tokens"; delete from "search_history";
  `);
});

afterAll(async () => {
  await client.close();
});

describe("DBStorage against real PostgreSQL (PGlite)", () => {
  it("finds legacy mixed-case email addresses case-insensitively", async () => {
    const id = await seedUser("Legacy.Case@Example.com");
    const byLower = await storage.getUserByEmail("legacy.case@example.com");
    const byUpper = await storage.getUserByEmail("LEGACY.CASE@EXAMPLE.COM");
    expect(byLower?.id).toBe(id);
    expect(byUpper?.id).toBe(id);
    expect(await storage.getUserByEmail("nobody@example.com")).toBeUndefined();
  });

  it("normalizes new emails to lowercase at write time", async () => {
    const created = await storage.createUser({
      email: "New.User@Example.COM",
      password: "hashed",
    } as any);
    expect(created.email).toBe("new.user@example.com");
  });

  describe("password reset tokens (hashed, single-use, transactional)", () => {
    it("consumes a valid token once, updates the password, and destroys sessions", async () => {
      const userId = await seedUser("reset@example.com");
      // Simulate two live sessions for this user.
      await client.query(
        `insert into "session" ("sid","sess","expire") values ($1,$2,now()+interval '1 day'),($3,$4,now()+interval '1 day')`,
        [
          "sid-1",
          JSON.stringify({ passport: { user: userId } }),
          "sid-2",
          JSON.stringify({ passport: { user: userId } }),
        ]
      );

      const tokenHash = "a".repeat(64);
      await storage.createPasswordResetToken({
        userId,
        token: tokenHash,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      });

      const newHash = await bcrypt.hash("new-password-2", 4);
      const result = await storage.consumePasswordResetTokenAndSetPassword(tokenHash, newHash);

      expect(result).toEqual({ ok: true, userId });

      const [user] = await db.select().from(users).where(eq(users.id, userId));
      expect(user.password).toBe(newHash);

      // Token gone: single use.
      const again = await storage.consumePasswordResetTokenAndSetPassword(tokenHash, "x");
      expect(again).toEqual({ ok: false, reason: "invalid" });

      // Sessions destroyed.
      const rows = await client.query<{ count: string }>(`select count(*)::text as count from "session"`);
      expect(Number(rows.rows[0].count)).toBe(0);
    });

    it("rejects and deletes an expired token with reason 'expired'", async () => {
      const userId = await seedUser("expired@example.com");
      const tokenHash = "b".repeat(64);
      await storage.createPasswordResetToken({
        userId,
        token: tokenHash,
        expiresAt: new Date(Date.now() - 1000),
      });

      const result = await storage.consumePasswordResetTokenAndSetPassword(tokenHash, "newhash");
      expect(result).toEqual({ ok: false, reason: "expired" });

      // Expired token is removed so the link can't be retried.
      const rows = await client.query<{ count: string }>(
        `select count(*)::text as count from "password_reset_tokens"`
      );
      expect(Number(rows.rows[0].count)).toBe(0);
    });
  });

  describe("searchMedia: literal text, filters, pagination, privacy", () => {
    let userId: string;
    let otherUserId: string;
    let beachAlbum: string;
    let lockedAlbum: string;

    beforeEach(async () => {
      userId = await seedUser("owner@example.com");
      otherUserId = await seedUser("stranger@example.com");

      const [beach] = await db
        .insert(albums)
        .values({ name: "Beach Trip 2024", description: "Sunset shots", userId })
        .returning();
      beachAlbum = beach.id;

      const [locked] = await db
        .insert(albums)
        .values({ name: "Private Locker", userId, isLocked: 1 })
        .returning();
      lockedAlbum = locked.id;

      const mk = async (
        filename: string,
        type: string,
        albumId: string | null,
        createdAt: Date,
        favorite = false,
        owner = userId
      ) => {
        const [row] = await db
          .insert(media)
          .values({
            filename,
            path: `https://res.cloudinary.com/x/${filename}`,
            type,
            size: 100,
            albumId,
            userId: owner,
            isFavorite: favorite ? 1 : 0,
            createdAt,
          })
          .returning();
        return row;
      };

      await mk("sunset.jpg", "image/jpeg", beachAlbum, new Date("2024-03-15T10:00:00Z"), true);
      await mk("waves 100%.mp4", "video/mp4", beachAlbum, new Date("2024-03-16T10:00:00Z"));
      await mk("dog.png", "image/png", null, new Date("2024-01-02T10:00:00Z"));
      await mk("secret.jpg", "image/jpeg", lockedAlbum, new Date("2024-05-01T10:00:00Z"));
      await mk("ghost.jpg", "image/jpeg", "00000000-not-a-real-album", new Date("2024-05-02T10:00:00Z"));
      await mk("stranger.jpg", "image/jpeg", null, new Date("2024-05-03T10:00:00Z"), false, otherUserId);
    });

    it("matches case-insensitively across filename, type, and album name", async () => {
      // "sunset" matches sunset.jpg's filename AND the album description
      // "Sunset shots" (which the waves video belongs to).
      const byFile = await storage.searchMedia(userId, { query: "SUNSET" });
      expect(byFile.total).toBe(2);
      // "waves" matches only a filename.
      const byFilenameOnly = await storage.searchMedia(userId, { query: "waves" });
      expect(byFilenameOnly.total).toBe(1);
      expect(byFilenameOnly.items[0].filename).toBe("waves 100%.mp4");

      const byType = await storage.searchMedia(userId, { query: "video/mp4" });
      expect(byType.total).toBe(1);
      expect(byType.items[0].filename).toBe("waves 100%.mp4");

      const byAlbumName = await storage.searchMedia(userId, { query: "beach trip" });
      expect(byAlbumName.total).toBe(2); // sunset.jpg + waves 100%.mp4

      const byAlbumDescription = await storage.searchMedia(userId, { query: "sunset shots" });
      expect(byAlbumDescription.total).toBe(2);
      expect(byAlbumName.items.map((m) => m.filename).sort()).toEqual(["sunset.jpg", "waves 100%.mp4"]);
    });

    it("treats % and _ as literal characters, never as wildcards", async () => {
      // "100%" must match ONLY the file literally containing "100%" —
      // a wildcard interpretation would also match "100" + anything.
      const pct = await storage.searchMedia(userId, { query: "100%" });
      expect(pct.total).toBe(1);
      expect(pct.items[0].filename).toBe("waves 100%.mp4");

      // "_" must match an actual underscore, not "any single character".
      const underscore = await storage.searchMedia(userId, { query: "waves 100_" });
      expect(underscore.total).toBe(0);

      // A term with a wildcard-looking infix finds nothing when no literal
      // file contains it.
      const sneaky = await storage.searchMedia(userId, { query: "s%n" });
      expect(sneaky.total).toBe(0);
    });

    it("narrow results across multiple words (AND semantics)", async () => {
      // "beach" (album name) AND "waves" (filename) both have to match.
      const both = await storage.searchMedia(userId, { query: "beach waves" });
      expect(both.total).toBe(1);
      expect(both.items[0].filename).toBe("waves 100%.mp4");

      // No single item satisfies both of these words.
      const none = await storage.searchMedia(userId, { query: "dog beach" });
      expect(none.total).toBe(0);
    });

    it("matches upload dates by YYYY / YYYY-MM / YYYY-MM-DD prefix", async () => {
      expect((await storage.searchMedia(userId, { query: "2024-03" })).total).toBe(2);
      expect((await storage.searchMedia(userId, { query: "2024-03-15" })).total).toBe(1);
      expect((await storage.searchMedia(userId, { query: "2024" })).total).toBe(3); // accessible rows only
    });

    it("excludes locked albums, orphaned rows, and other accounts", async () => {
      const all = await storage.searchMedia(userId, { query: "" });
      expect(all.total).toBe(3); // sunset, waves, dog
      expect(all.items.map((m) => m.filename).sort()).toEqual(["dog.png", "sunset.jpg", "waves 100%.mp4"]);

      // Same for the cross-album listing.
      const listing = await storage.getMediaByUserId(userId);
      expect(listing.map((m) => m.filename).sort()).toEqual(["dog.png", "sunset.jpg", "waves 100%.mp4"]);
    });

    it("applies type and favorites filters without a text query", async () => {
      const videos = await storage.searchMedia(userId, { type: "video" });
      expect(videos.total).toBe(1);
      expect(videos.items[0].filename).toBe("waves 100%.mp4");

      const favorites = await storage.searchMedia(userId, { favorite: true });
      expect(favorites.total).toBe(1);
      expect(favorites.items[0].filename).toBe("sunset.jpg");

      const favoriteVideos = await storage.searchMedia(userId, { type: "video", favorite: true });
      expect(favoriteVideos.total).toBe(0);
    });

    it("paginates newest-first with a deterministic tie-breaker", async () => {
      // Two rows sharing a timestamp exercise the id tie-breaker.
      const sameTime = new Date("2025-06-01T12:00:00Z");
      await db.insert(media).values([
        {
          filename: "tie-a.jpg",
          path: "p",
          type: "image/jpeg",
          size: 1,
          albumId: beachAlbum,
          userId,
          createdAt: sameTime,
        },
        {
          filename: "tie-b.jpg",
          path: "p",
          type: "image/jpeg",
          size: 1,
          albumId: beachAlbum,
          userId,
          createdAt: sameTime,
        },
      ]);

      const page1 = await storage.searchMedia(userId, { page: 1, limit: 2 });
      const page2 = await storage.searchMedia(userId, { page: 2, limit: 2 });

      expect(page1.items.length).toBe(2);
      expect(page1.total).toBe(5);
      expect(page1.hasMore ?? true).not.toBe(false);
      // Newest first…
      expect(page1.items[0].createdAt.getTime()).toBeGreaterThanOrEqual(
        page1.items[1].createdAt.getTime()
      );
      // …pages don't overlap…
      const ids1 = new Set(page1.items.map((m) => m.id));
      page2.items.forEach((m) => expect(ids1.has(m.id)).toBe(false));
      // …and the deterministic order holds across both pages.
      // Walk every page and confirm the concatenation equals the unpaginated
      // order exactly (no overlaps, no gaps, deterministic across pages).
      const idsOrdered = await storage.searchMedia(userId, { page: 1, limit: 5 });
      const page3 = await storage.searchMedia(userId, { page: 3, limit: 2 });
      const expected = idsOrdered.items.map((m) => m.id);
      const paged = [...page1.items, ...page2.items, ...page3.items].map((m) => m.id);
      expect(paged).toEqual(expected);
    });
  });

  describe("upload idempotency / primary-key deduplication", () => {
    it("returns the ORIGINAL row when the same stable upload id is inserted twice", async () => {
      const userId = await seedUser("dedupe@example.com");
      const first = await storage.createMedia(
        { filename: "photo.jpg", path: "url-1", type: "image/jpeg", size: 10 } as any,
        userId,
        { publicId: "p1", resourceType: "image" },
        { id: "mv_deterministic_row_id" }
      );
      expect(first.id).toBe("mv_deterministic_row_id");

      // Simulated retry after a lost response — same upload id:
      const second = await storage.createMedia(
        { filename: "photo.jpg", path: "url-2", type: "image/jpeg", size: 10 } as any,
        userId,
        { publicId: "p1", resourceType: "image" },
        { id: "mv_deterministic_row_id" }
      );
      expect(second.id).toBe(first.id);
      expect(second.path).toBe("url-1"); // original values win, no duplicate

      const rows = await client.query<{ count: string }>(`select count(*)::text as count from "media"`);
      expect(Number(rows.rows[0].count)).toBe(1);
    });
  });

  describe("share-token revocation", () => {
    it("revokeAllAlbumSharesForUser destroys every token for the account (and only that account)", async () => {
      const userId = await seedUser("sharer@example.com");
      const otherId = await seedUser("other-sharer@example.com");

      const [a] = await db
        .insert(albums)
        .values({ name: "A", userId, isPublic: 1, shareToken: "tok-a" })
        .returning();
      const [b] = await db
        .insert(albums)
        .values({ name: "B", userId, isPublic: 1, shareToken: "tok-b" })
        .returning();
      const [c] = await db
        .insert(albums)
        .values({ name: "C", userId: otherId, isPublic: 1, shareToken: "tok-c" })
        .returning();
      expect(a.shareToken).toBe("tok-a");
      expect(b.shareToken).toBe("tok-b");
      expect(c.shareToken).toBe("tok-c");

      await storage.revokeAllAlbumSharesForUser(userId);

      const [a2] = await db.select().from(albums).where(eq(albums.id, a.id));
      const [b2] = await db.select().from(albums).where(eq(albums.id, b.id));
      const [c2] = await db.select().from(albums).where(eq(albums.id, c.id));
      expect(a2.isPublic).toBe(0);
      expect(a2.shareToken).toBeNull();
      expect(b2.isPublic).toBe(0);
      expect(b2.shareToken).toBeNull();
      // Other accounts untouched.
      expect(c2.isPublic).toBe(1);
      expect(c2.shareToken).toBe("tok-c");

      // Revoked tokens no longer resolve.
      expect(await storage.getAlbumByShareToken("tok-a")).toBeUndefined();
      expect(await storage.getAlbumByShareToken("tok-c")).toBeDefined();
    });

    it("revokeAlbumSharing clears the single album's token permanently", async () => {
      const userId = await seedUser("single@example.com");
      const [album] = await db
        .insert(albums)
        .values({ name: "One", userId, isPublic: 1, shareToken: "tok-one" })
        .returning();
      await storage.revokeAlbumSharing(album.id);
      const [after] = await db.select().from(albums).where(eq(albums.id, album.id));
      expect(after.isPublic).toBe(0);
      expect(after.shareToken).toBeNull();
    });
  });

  describe("search history", () => {
    it("dedupes case-insensitively and keeps wildcards literal", async () => {
      const userId = await seedUser("searcher@example.com");
      await storage.addSearchHistoryEntry(userId, "Beach");
      await storage.addSearchHistoryEntry(userId, "beach");
      await storage.addSearchHistoryEntry(userId, "BEACH");
      await storage.addSearchHistoryEntry(userId, "100% sure");
      await storage.addSearchHistoryEntry(userId, "100% SURE");

      const rows = await db.select().from(searchHistory).where(eq(searchHistory.userId, userId));
      const terms = rows.map((r) => r.query).sort();
      // The deduped entry keeps the MOST RECENT casing (each new insert
      // replaces the previous entry for the same term, case-insensitively).
      expect(terms).toEqual(["100% SURE", "BEACH"]);
    });
  });
});
