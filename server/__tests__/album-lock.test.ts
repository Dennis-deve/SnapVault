import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import { fakeStorage } from "./fakeStorage";

// Intercept the real (Postgres-backed) storage module with the in-memory
// fake everywhere it's imported — this is what lets these tests run without
// a live database. Must be declared before any import of routes/testApp
// pulls in the real storage.ts transitively.
vi.mock("../storage", async () => {
  const { fakeStorage } = await import("./fakeStorage");
  return { storage: fakeStorage };
});

const { buildTestApp } = await import("./testApp");

describe("Album locking is enforced server-side", () => {
  beforeEach(() => {
    fakeStorage.reset();
  });

  it("does not return a locked album's media without a valid unlock token", async () => {
    const app = await buildTestApp();
    const agent = request.agent(app);

    // Sign up and stay logged in via the session cookie for the rest of
    // this test.
    const signupRes = await agent.post("/api/auth/signup").send({
      email: "owner@example.com",
      password: "correct-horse-battery",
      pin: "1234",
    });
    expect(signupRes.status).toBe(200);

    // Create an album and drop one media item into it directly via the
    // fake store (bypassing the upload pipeline, which isn't under test
    // here).
    const albumRes = await agent.post("/api/albums").send({ name: "Private Trip" });
    expect(albumRes.status).toBe(200);
    const albumId = albumRes.body.id;

    await fakeStorage.createMedia(
      { filename: "beach.jpg", path: "https://example.com/beach.jpg", type: "image/jpeg", size: 1024, albumId },
      albumRes.body.userId
    );

    // Lock the album with the correct PIN.
    const lockRes = await agent.post(`/api/albums/${albumId}/lock`).send({ pin: "1234" });
    expect(lockRes.status).toBe(200);

    // THE CORE ASSERTION: fetching the locked album's media with a valid,
    // authenticated session — but no unlock token — must be refused. Before
    // the fix, this endpoint returned the media regardless of lock state.
    const blockedRes = await agent.get(`/api/albums/${albumId}/media`);
    expect(blockedRes.status).toBe(423);
    expect(blockedRes.body.locked).toBe(true);

    // A garbage/forged unlock token must also be refused, not just a
    // missing one.
    const forgedRes = await agent
      .get(`/api/albums/${albumId}/media`)
      .set("x-album-unlock-token", "not-a-real-token");
    expect(forgedRes.status).toBe(423);

    // Providing the correct PIN via the dedicated unlock-session endpoint
    // issues a token that DOES grant access.
    const unlockRes = await agent.post(`/api/albums/${albumId}/unlock-session`).send({ pin: "1234" });
    expect(unlockRes.status).toBe(200);
    expect(unlockRes.body.unlockToken).toBeTruthy();

    const allowedRes = await agent
      .get(`/api/albums/${albumId}/media`)
      .set("x-album-unlock-token", unlockRes.body.unlockToken);
    expect(allowedRes.status).toBe(200);
    expect(allowedRes.body).toHaveLength(1);
    expect(allowedRes.body[0].filename).toBe("beach.jpg");
  });

  it("does not require an unlock token for an unlocked album", async () => {
    const app = await buildTestApp();
    const agent = request.agent(app);

    await agent.post("/api/auth/signup").send({
      email: "owner2@example.com",
      password: "correct-horse-battery",
    });

    const albumRes = await agent.post("/api/albums").send({ name: "Public-ish Trip" });
    const albumId = albumRes.body.id;

    const res = await agent.get(`/api/albums/${albumId}/media`);
    expect(res.status).toBe(200);
  });

  it("never returns a thumbnail for a locked album in the album list", async () => {
    const app = await buildTestApp();
    const agent = request.agent(app);

    await agent.post("/api/auth/signup").send({
      email: "owner3@example.com",
      password: "correct-horse-battery",
      pin: "5678",
    });

    const albumRes = await agent.post("/api/albums").send({ name: "Locked Album" });
    const albumId = albumRes.body.id;

    await fakeStorage.createMedia(
      { filename: "secret.jpg", path: "https://example.com/secret.jpg", type: "image/jpeg", size: 2048, albumId },
      albumRes.body.userId
    );

    await agent.post(`/api/albums/${albumId}/lock`).send({ pin: "5678" });

    const listRes = await agent.get("/api/albums");
    expect(listRes.status).toBe(200);
    const locked = listRes.body.find((a: any) => a.id === albumId);
    expect(locked.thumbnail).toBeNull();
  });
});
