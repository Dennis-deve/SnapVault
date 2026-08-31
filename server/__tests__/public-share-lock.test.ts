import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import { fakeStorage } from "./fakeStorage";

vi.mock("../storage", async () => {
  const { fakeStorage } = await import("./fakeStorage");
  return { storage: fakeStorage };
});

const { buildTestApp } = await import("./testApp");

describe("Locking a shared album revokes its public link", () => {
  beforeEach(() => {
    fakeStorage.reset();
  });

  it("stops serving a public share link once the album is locked", async () => {
    const app = await buildTestApp();
    const agent = request.agent(app);

    await agent.post("/api/auth/signup").send({
      email: "owner@example.com",
      password: "correct-horse-battery",
      pin: "1234",
    });

    const albumRes = await agent.post("/api/albums").send({ name: "Family Trip" });
    const albumId = albumRes.body.id;

    await fakeStorage.createMedia(
      { filename: "sunset.jpg", path: "https://example.com/sunset.jpg", type: "image/jpeg", size: 1024, albumId },
      albumRes.body.userId
    );

    // Share the album publicly while it's unlocked.
    const shareRes = await agent.post(`/api/albums/${albumId}/share`);
    expect(shareRes.status).toBe(200);
    const { shareToken } = shareRes.body;
    expect(shareToken).toBeTruthy();

    // The public link works before the album is locked.
    const beforeLock = await request(app).get(`/api/public/albums/${shareToken}`);
    expect(beforeLock.status).toBe(200);
    expect(beforeLock.body.itemCount).toBe(1);

    // Lock the album with the correct PIN.
    const lockRes = await agent.post(`/api/albums/${albumId}/lock`).send({ pin: "1234" });
    expect(lockRes.status).toBe(200);

    // THE CORE ASSERTION: the same public share link must no longer work —
    // locking must revoke public access, not just gate the authenticated
    // API routes.
    const afterLock = await request(app).get(`/api/public/albums/${shareToken}`);
    expect(afterLock.status).toBe(404);

    const afterLockMedia = await request(app).get(`/api/public/albums/${shareToken}/media`);
    expect(afterLockMedia.status).toBe(404);
  });
});
