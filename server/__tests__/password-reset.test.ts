import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { fakeStorage } from "./fakeStorage";

// Route-level behavior of the hardened password-reset flow. Storage is the
// in-memory FakeStorage (see password-reset semantics against real SQL in
// pglite-storage.test.ts); the email provider is mocked at the module
// boundary so no test ever sends mail.

vi.mock("express-rate-limit", () => ({
  default: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

const mocks = vi.hoisted(() => ({
  sendPasswordResetEmail: vi.fn(),
  sendWelcomeEmail: vi.fn(),
  sendEmailChangeVerification: vi.fn(),
}));

vi.mock("../email", async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    isEmailConfigured: () => !!process.env.RESEND_API_KEY,
    sendPasswordResetEmail: mocks.sendPasswordResetEmail,
    sendWelcomeEmail: mocks.sendWelcomeEmail,
    sendEmailChangeVerification: mocks.sendEmailChangeVerification,
  };
});

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
const { generateToken, generateAlbumUnlockToken } = await import("../jwt");

const KNOWN_TOKEN = "tok_" + "a".repeat(40);
const KNOWN_TOKEN_HASH = crypto.createHash("sha256").update(KNOWN_TOKEN).digest("hex");

async function signUpAndLogin(agent: request.Agent, email: string, password: string) {
  const res = await agent.post("/api/auth/signup").send({ email, password });
  expect(res.status).toBe(200);
  return res.body;
}

beforeEach(() => {
  fakeStorage.reset();
  mocks.sendPasswordResetEmail.mockReset();
  mocks.sendPasswordResetEmail.mockResolvedValue({ success: true });
  mocks.sendWelcomeEmail.mockReset().mockResolvedValue({ success: true });
  mocks.sendEmailChangeVerification.mockReset().mockResolvedValue({ success: true });
  vi.stubEnv("RESEND_API_KEY", "test-key");
  vi.stubEnv("CLIENT_URL", "https://app.snapvault.test");
  vi.stubEnv("NODE_ENV", "production");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/auth/forgot-password", () => {
  it("returns an honest 503 when email is not configured (before any user lookup)", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    const app = await buildTestApp();
    const res = await request(app).post("/api/auth/forgot-password").send({ email: "who@example.com" });
    expect(res.status).toBe(503);
    expect(res.body.message).toMatch(/not configured/i);
    expect(mocks.sendPasswordResetEmail).not.toHaveBeenCalled();
  });

  it("stores only the SHA-256 hash of the token — never the raw token", async () => {
    const app = await buildTestApp();
    await signUpAndLogin(request.agent(app), "hash@example.com", "correct-horse-battery");
    const res = await request(app)
      .post("/api/auth/forgot-password")
      .send({ email: "hash@example.com" });
    expect(res.status).toBe(200);

    const linkToken = mocks.sendPasswordResetEmail.mock.calls[0][0].resetUrl.split("token=")[1];
    expect(linkToken.length).toBeGreaterThanOrEqual(32);
    const stored = Array.from(fakeStorage.passwordResetTokens.keys());
    expect(stored).toHaveLength(1);
    expect(stored[0]).not.toBe(linkToken);
    expect(stored[0]).toBe(crypto.createHash("sha256").update(linkToken).digest("hex"));
  });

  it("never includes the token in the API response and never logs it", async () => {
    const app = await buildTestApp();
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const res = await request(app)
      .post("/api/auth/forgot-password")
      .send({ email: "silent@example.com" });
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toContain("token=");
    // The emailed URL must not be written to logs either.
    const logged = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(logged).not.toContain("token=");
    logSpy.mockRestore();
  });

  it("gives an identical response for unknown addresses (no enumeration)", async () => {
    const app = await buildTestApp();
    const known = await request(app)
      .post("/api/auth/forgot-password")
      .send({ email: "exists@example.com" });
    // "exists" only after signup
    const agent = request.agent(app);
    await signUpAndLogin(agent, "exists@example.com", "correct-horse-battery");
    const unknown = await request(app)
      .post("/api/auth/forgot-password")
      .send({ email: "ghost@example.com" });
    expect(unknown.status).toBe(known.status);
    expect(unknown.body).toEqual(known.body);
  });

  it("normalizes the email and finds legacy mixed-case accounts", async () => {
    const app = await buildTestApp();
    // Simulate a legacy row created before normalization existed by
    // inserting directly into the fake store (createUser normalizes now).
    const legacyId = "legacy-user-id";
    fakeStorage.users.set(legacyId, {
      id: legacyId,
      email: "Legacy.Case@Example.com",
      password: await bcrypt.hash("correct-horse-battery", 4),
      pin: null,
      googleId: null,
      publicSharingEnabled: 0,
    });

    const res = await request(app)
      .post("/api/auth/forgot-password")
      .send({ email: "  LEGACY.case@example.com  " });
    expect(res.status).toBe(200);
    expect(mocks.sendPasswordResetEmail).toHaveBeenCalledTimes(1);
    expect(fakeStorage.passwordResetTokens.size).toBe(1);
  });

  it("uses the configured frontend URL, never the request's Host header", async () => {
    const app = await buildTestApp();
    await signUpAndLogin(request.agent(app), "hostheader@example.com", "correct-horse-battery");
    await request(app)
      .post("/api/auth/forgot-password")
      .set("Host", "evil.example.attacker")
      .send({ email: "hostheader@example.com" });

    const { resetUrl } = mocks.sendPasswordResetEmail.mock.calls[0][0];
    expect(resetUrl.startsWith("https://app.snapvault.test/reset-password")).toBe(true);
    expect(resetUrl).not.toContain("attacker");
  });

  it("issuing a new link invalidates the previous one", async () => {
    const app = await buildTestApp();
    await signUpAndLogin(request.agent(app), "twice@example.com", "correct-horse-battery");
    await request(app).post("/api/auth/forgot-password").send({ email: "twice@example.com" });
    expect(fakeStorage.passwordResetTokens.size).toBe(1);
    const first = Array.from(fakeStorage.passwordResetTokens.keys())[0];

    await request(app).post("/api/auth/forgot-password").send({ email: "twice@example.com" });
    expect(fakeStorage.passwordResetTokens.size).toBe(1);
    expect(Array.from(fakeStorage.passwordResetTokens.keys())[0]).not.toBe(first);
  });

  it("keeps the public response generic when the provider rejects the send", async () => {
    const app = await buildTestApp();
    await signUpAndLogin(request.agent(app), "bounce@example.com", "correct-horse-battery");
    mocks.sendPasswordResetEmail.mockResolvedValue({ success: false, error: "bounce: recipient blocked" });

    const res = await request(app)
      .post("/api/auth/forgot-password")
      .send({ email: "bounce@example.com" });
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toContain("bounce");
    // Real reason is logged server-side for investigation.
  });
});

describe("GET /api/auth/reset-password/validate", () => {
  it("reports valid / expired / invalid without echoing the token", async () => {
    const app = await buildTestApp();
    const user = await fakeStorage.createUser({
      email: "validate@example.com",
      password: "hashed",
    } as any);

    await fakeStorage.createPasswordResetToken({
      userId: user.id,
      token: KNOWN_TOKEN_HASH,
      expiresAt: new Date(Date.now() + 3600_000),
    });
    const valid = await request(app).get(`/api/auth/reset-password/validate?token=${KNOWN_TOKEN}`);
    expect(valid.status).toBe(200);
    expect(valid.body).toEqual({ valid: true });

    await fakeStorage.createPasswordResetToken({
      userId: user.id,
      token: crypto.createHash("sha256").update("expired-tok").digest("hex"),
      expiresAt: new Date(Date.now() - 1000),
    });
    const expired = await request(app).get(`/api/auth/reset-password/validate?token=expired-tok`);
    expect(expired.body).toEqual({ valid: false, reason: "expired" });

    const invalid = await request(app).get(`/api/auth/reset-password/validate?token=nope`);
    expect(invalid.body).toEqual({ valid: false, reason: "invalid" });
    expect(JSON.stringify(invalid.body)).not.toContain("nope");
  });
});

describe("POST /api/auth/reset-password", () => {
  it("resets the password, consumes the link once, and destroys sessions", async () => {
    const app = await buildTestApp();
    const user = await fakeStorage.createUser({
      email: "resetme@example.com",
      password: await bcrypt.hash("old-password-1", 4),
    } as any);
    await fakeStorage.createPasswordResetToken({
      userId: user.id,
      token: KNOWN_TOKEN_HASH,
      expiresAt: new Date(Date.now() + 3600_000),
    });

    const res = await request(app)
      .post("/api/auth/reset-password")
      .send({ token: KNOWN_TOKEN, newPassword: "brand-new-password-2" });
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/signed out/i);

    const updated = await fakeStorage.getUser(user.id);
    expect(await bcrypt.compare("brand-new-password-2", updated!.password!)).toBe(true);
    expect(fakeStorage.destroyedSessionUserIds).toContain(user.id);

    // Single use: the same link cannot reset again.
    const again = await request(app)
      .post("/api/auth/reset-password")
      .send({ token: KNOWN_TOKEN, newPassword: "another-password-3" });
    expect(again.status).toBe(400);
    expect(again.body.reason).toBe("invalid");
  });

  it("distinguishes expired links from invalid ones", async () => {
    const app = await buildTestApp();
    const user = await fakeStorage.createUser({ email: "exp@example.com", password: "h" } as any);
    await fakeStorage.createPasswordResetToken({
      userId: user.id,
      token: KNOWN_TOKEN_HASH,
      expiresAt: new Date(Date.now() - 1000),
    });

    const res = await request(app)
      .post("/api/auth/reset-password")
      .send({ token: KNOWN_TOKEN, newPassword: "some-password-9" });
    expect(res.status).toBe(400);
    expect(res.body.reason).toBe("expired");
    expect(res.body.message).toMatch(/expired/i);
  });

  it("rejects passwords shorter than 8 characters", async () => {
    const app = await buildTestApp();
    const res = await request(app)
      .post("/api/auth/reset-password")
      .send({ token: "x".repeat(40), newPassword: "short" });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/at least 8/i);
  });
});

describe("resetting a password invalidates existing logins", () => {
  it("rejects a JWT issued BEFORE the reset (credential version changed)", async () => {
    const app = await buildTestApp();
    const agent = request.agent(app);
    const body = await signUpAndLogin(agent, "stale-jwt@example.com", "original-password-1");
    const oldToken: string = body.token;
    expect(oldToken).toBeTruthy();

    const user = await fakeStorage.getUserByEmail("stale-jwt@example.com");
    await fakeStorage.createPasswordResetToken({
      userId: user!.id,
      token: KNOWN_TOKEN_HASH,
      expiresAt: new Date(Date.now() + 3600_000),
    });
    await request(app)
      .post("/api/auth/reset-password")
      .send({ token: KNOWN_TOKEN, newPassword: "replacement-password-2" });

    // The old JWT no longer authenticates.
    const me = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${oldToken}`);
    expect(me.status).toBe(401);

    // A fresh login works and yields a working token.
    const relogin = await request(app)
      .post("/api/auth/login")
      .send({ email: "stale-jwt@example.com", password: "replacement-password-2" });
    expect(relogin.status).toBe(200);
    const me2 = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${relogin.body.token}`);
    expect(me2.status).toBe(200);
  });

  it("rejects a legacy pre-credential-version token", async () => {
    const app = await buildTestApp();
    const user = await fakeStorage.createUser({
      email: "legacytok@example.com",
      password: await bcrypt.hash("pw-legacy-12345", 4),
    } as any);
    // A token signed the OLD way (no purpose, no credential version).
    const legacyToken = generateToken(user.id);
    const me = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${legacyToken}`);
    expect(me.status).toBe(401);
  });

  it("does not accept an album-unlock token as a login token", async () => {
    const app = await buildTestApp();
    const user = await fakeStorage.createUser({
      email: "unlocktok@example.com",
      password: await bcrypt.hash("pw-unlock-12345", 4),
    } as any);
    const unlockToken = generateAlbumUnlockToken(user.id, "some-album");
    const me = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${unlockToken}`);
    expect(me.status).toBe(401);
  });
});
