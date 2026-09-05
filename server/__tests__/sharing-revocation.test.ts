import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { fakeStorage } from "./fakeStorage";
import type { User, Album } from "@shared/schema";

// Public-sharing lifecycle at the route level: sharing produces a frontend
// link; revocation (unshare / lock / account kill switch / owner deleted)
// is PERMANENT — the old token never works again and re-sharing mints a
// fresh one; public responses are always no-store.

vi.mock("express-rate-limit", () => ({
  default: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

vi.mock("../cloudinary", () => ({
  default: {
    config: () => {},
    uploader: { upload: vi.fn(), upload_large: vi.fn(), destroy: vi.fn() },
    url: (publicId: string) => `https://res.cloudinary.com/test/image/upload/signed/${publicId}`,
  },
}));

vi.mock("../storage", async () => {
  const { fakeStorage } = await import("./fakeStorage");
  return { storage: fakeStorage };
});

const { buildTestApp } = await import("./testApp");

let ownerAgent: request.Agent;
let ownerId: string;
let albumId: string;

beforeEach(async () => {
  fakeStorage.reset();
  vi.stubEnv("CLIENT_URL", "https://app.snapvault.test");
  vi.stubEnv("NODE_ENV", "production");

  const app = await buildTestApp();
  ownerAgent = request.agent(app);
  const signup = await ownerAgent
    .post("/api/auth/signup")
    .send({ email: "sharer@example.com", password: "correct-horse-battery" });
  ownerId = signup.body.id;

  const album = await ownerAgent
    .post("/api/albums")
    .send({ name: "Holiday", description: "Best moments" });
  albumId = album.body.id;
});

async function shareAlbum(agent: request.Agent = ownerAgent) {
  const res = await agent.post(`/api/albums/${albumId}/share`).send({});
  expect(res.status).toBe(200);
  return res.body as { isPublic: boolean; shareUrl: string; shareToken: string };
}

function seedAlbumMedia() {
  const id = "pub-media-1";
  fakeStorage.media.set(id, {
    id,
    filename: "sunset.jpg",
    path: "https://res.cloudinary.com/x/image/authenticated/sunset",
    type: "image/jpeg",
    size: 10,
    albumId,
    userId: ownerId,
    isFavorite: 0,
    cloudinaryPublicId: "cloudmediavault/sunset",
    cloudinaryResourceType: "image",
    createdAt: new Date(),
  });
}

describe("public album sharing lifecycle", () => {
  it("sharing returns a FRONTEND link built from the configured URL", async () => {
    const body = await shareAlbum();
    expect(body.shareUrl.startsWith("https://app.snapvault.test/shared/")).toBe(true);
    expect(body.shareToken).toBeTruthy();
  });

  it("serves an anonymous read-only gallery with no-store caching", async () => {
    const { shareToken } = await shareAlbum();
    seedAlbumMedia();
    const app = await buildTestApp();

    const albumRes = await request(app).get(`/api/public/albums/${shareToken}`);
    expect(albumRes.status).toBe(200);
    expect(albumRes.body.name).toBe("Holiday");
    expect(albumRes.headers["cache-control"]).toContain("no-store");

    const mediaRes = await request(app).get(`/api/public/albums/${shareToken}/media`);
    expect(mediaRes.status).toBe(200);
    expect(mediaRes.headers["cache-control"]).toContain("no-store");
    expect(mediaRes.body).toHaveLength(1);
    // Signed URL, minimal projection only.
    expect(mediaRes.body[0].filename).toBe("sunset.jpg");
    expect(mediaRes.body[0].userId).toBeUndefined();
  });

  it("unsharing kills the old link permanently; re-sharing mints a NEW token", async () => {
    const first = await shareAlbum();

    const unshare = await ownerAgent.post(`/api/albums/${albumId}/unshare`).send({});
    expect(unshare.status).toBe(200);
    expect(unshare.body.isPublic).toBe(false);

    const app = await buildTestApp();
    const gone = await request(app).get(`/api/public/albums/${first.shareToken}`);
    expect(gone.status).toBe(404);

    const second = await shareAlbum();
    expect(second.shareToken).not.toBe(first.shareToken);
  });

  it("re-sharing a STILL-ACTIVE link reuses the same token", async () => {
    const first = await shareAlbum();
    const again = await shareAlbum();
    expect(again.shareToken).toBe(first.shareToken);
  });

  it("locking a shared album revokes its link and re-sharing after unlock mints a new one", async () => {
    // Set a PIN first so locking is possible.
    await ownerAgent.post("/api/auth/update-pin").send({ pin: "1234" });
    const first = await shareAlbum();

    const lock = await ownerAgent.post(`/api/albums/${albumId}/lock`).send({ pin: "1234" });
    expect(lock.status).toBe(200);

    const app = await buildTestApp();
    expect((await request(app).get(`/api/public/albums/${first.shareToken}`)).status).toBe(404);

    await ownerAgent.post(`/api/albums/${albumId}/unlock`).send({ pin: "1234" });
    const second = await shareAlbum();
    expect(second.shareToken).not.toBe(first.shareToken);
  });

  it("the account-wide kill switch revokes every link, and re-enabling never revives them", async () => {
    const { shareToken } = await shareAlbum();
    seedAlbumMedia();

    const app = await buildTestApp();
    expect((await request(app).get(`/api/public/albums/${shareToken}/media`)).status).toBe(200);

    const off = await ownerAgent.post("/api/auth/sharing-preference").send({ enabled: false });
    expect(off.status).toBe(200);
    expect((await request(app).get(`/api/public/albums/${shareToken}`)).status).toBe(404);
    expect((await request(app).get(`/api/public/albums/${shareToken}/media`)).status).toBe(404);

    // Re-enabling the global preference does NOT resurrect old links…
    await ownerAgent.post("/api/auth/sharing-preference").send({ enabled: true });
    expect((await request(app).get(`/api/public/albums/${shareToken}`)).status).toBe(404);

    // …the album must be explicitly shared again to get a NEW link.
    const refreshed = await shareAlbum();
    expect(refreshed.shareToken).not.toBe(shareToken);
    expect((await request(app).get(`/api/public/albums/${refreshed.shareToken}/media`)).status).toBe(200);
  });

  it("stops serving a link whose owner account no longer exists", async () => {
    const { shareToken } = await shareAlbum();
    seedAlbumMedia();

    const app = await buildTestApp();
    expect((await request(app).get(`/api/public/albums/${shareToken}`)).status).toBe(200);

    fakeStorage.users.delete(ownerId);
    expect((await request(app).get(`/api/public/albums/${shareToken}`)).status).toBe(404);
  });

  it("never serves a locked album through a public link, even with a stale isPublic row", async () => {
    const { shareToken } = await shareAlbum();
    // Deliberately violate the invariant (a row that is public AND locked)
    // to prove the public endpoint defends in depth.
    const album = fakeStorage.albums.get(albumId)!;
    album.isLocked = 1;

    const app = await buildTestApp();
    expect((await request(app).get(`/api/public/albums/${shareToken}`)).status).toBe(404);
    expect((await request(app).get(`/api/public/albums/${shareToken}/media`)).status).toBe(404);
  });

  it("deleting an album attempts Cloudinary cleanup for its media", async () => {
    seedAlbumMedia();
    const destroySpy = vi.fn();
    // Instrument via the mocked module.
    const cloudinaryModule = await import("../cloudinary");
    (cloudinaryModule.default.uploader as any).destroy = destroySpy;

    const res = await ownerAgent.delete(`/api/albums/${albumId}`);
    expect(res.status).toBe(200);
    expect(destroySpy).toHaveBeenCalledWith(
      "cloudmediavault/sunset",
      expect.objectContaining({ resource_type: "image" })
    );
    expect(fakeStorage.media.size).toBe(0);
    expect(fakeStorage.albums.has(albumId)).toBe(false);
  });
});

describe("guest visibility", () => {
  it("does not leak share state of other users' albums to unauthenticated callers", async () => {
    const body = await shareAlbum();
    const app = await buildTestApp();
    // Authenticated endpoints stay private…
    expect((await request(app).get("/api/albums")).status).toBe(401);
    // …while the shared link works anonymously.
    expect((await request(app).get(`/api/public/albums/${body.shareToken}`)).status).toBe(200);
  });
});
