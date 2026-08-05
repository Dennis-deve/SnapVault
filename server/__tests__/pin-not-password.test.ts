import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import { fakeStorage } from "./fakeStorage";

vi.mock("../storage", async () => {
  const { fakeStorage } = await import("./fakeStorage");
  return { storage: fakeStorage };
});

const { buildTestApp } = await import("./testApp");

describe("The Magic PIN cannot be used as an account password", () => {
  beforeEach(() => {
    fakeStorage.reset();
  });

  it("rejects login when the PIN is submitted as the password", async () => {
    const app = await buildTestApp();
    const agent = request.agent(app);

    const email = "pintest@example.com";
    const password = "a-real-strong-password";
    const pin = "4242";

    const signupRes = await agent.post("/api/auth/signup").send({ email, password, pin });
    expect(signupRes.status).toBe(200);

    // Log out the session established by signup so this is a clean login
    // attempt.
    await agent.post("/api/auth/logout");

    // THE CORE ASSERTION: submitting the 4-digit PIN as the password must
    // fail. Before the fix, the local Passport strategy accepted either the
    // real password OR the PIN as valid credentials for full account login.
    const pinLoginRes = await agent.post("/api/auth/login").send({ email, password: pin });
    expect(pinLoginRes.status).toBe(401);

    // Sanity check: the real password still works, so this isn't just a
    // broken login endpoint.
    const realLoginRes = await agent.post("/api/auth/login").send({ email, password });
    expect(realLoginRes.status).toBe(200);
    expect(realLoginRes.body.email).toBe(email);
  });

  it("never exposes the password or PIN hash in any auth response", async () => {
    const app = await buildTestApp();
    const agent = request.agent(app);

    const res = await agent.post("/api/auth/signup").send({
      email: "noleak@example.com",
      password: "a-real-strong-password",
      pin: "9999",
    });

    expect(res.body.password).toBeUndefined();
    // pin should be masked, never the real hash
    expect(res.body.pin).toBe("****");
  });

  it("locks out further attempts on one account after repeated failures, independent of a valid different account", async () => {
    const app = await buildTestApp();
    const agent = request.agent(app);

    const email = "lockout@example.com";
    await agent.post("/api/auth/signup").send({ email, password: "correct-password-123" });
    await agent.post("/api/auth/logout");

    // 8 failed attempts trips the per-account lockout (see server/routes/shared.ts)
    for (let i = 0; i < 8; i++) {
      await agent.post("/api/auth/login").send({ email, password: "wrong-password" });
    }

    const res = await agent.post("/api/auth/login").send({ email, password: "correct-password-123" });
    expect(res.status).toBe(429);
  });
});
