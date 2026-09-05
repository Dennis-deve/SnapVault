import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import { fakeStorage } from "./fakeStorage";

// The Cloudinary SDK is mocked at the uploader level. CRUCIALLY, the mocks
// invoke the callback exactly the way the real v2.x SDK does — with a
// SINGLE argument (the result object; failures carry a `.error` field
// inside it), NOT the old (error, result) two-argument style. Regression
// tests below assert the server survives that contract.
// The auth routes use a module-level rate limiter (5 signups per IP per
// 15 min). Tests sign up several times from the same synthetic IP, so stub
// the limiter out — it's not what's under test here.
vi.mock("express-rate-limit", () => ({
  default: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

const mocks = vi.hoisted(() => ({
  upload: vi.fn(),
  uploadLarge: vi.fn(),
  destroy: vi.fn(),
}));

vi.mock("../cloudinary", () => ({
  default: {
    config: () => {},
    uploader: {
      upload: mocks.upload,
      upload_large: mocks.uploadLarge,
      destroy: mocks.destroy,
    },
    url: (publicId: string) =>
      `https://res.cloudinary.com/test/image/upload/signed/${publicId}`,
  },
}));

vi.mock("../storage", async () => {
  const { fakeStorage } = await import("./fakeStorage");
  return { storage: fakeStorage };
});

const { buildTestApp } = await import("./testApp");

/** Mimic the real SDK: callback is invoked with ONE argument. */
function sdkSuccess(result: Record<string, unknown>) {
  return (file: unknown, _options: unknown, cb: (r: unknown) => void) => {
    cb({ ...result });
  };
}
function sdkFailure(cloudinaryError: { message: string; http_code?: number }) {
  return (file: unknown, _options: unknown, cb: (r: unknown) => void) => {
    cb({ error: cloudinaryError });
  };
}

const tinyJpeg = Buffer.from("fake-jpeg-bytes", "utf8");

describe("POST /api/upload", () => {
  beforeEach(() => {
    fakeStorage.reset();
    mocks.upload.mockReset();
    mocks.uploadLarge.mockReset();
    mocks.destroy.mockReset();
  });

  it("saves media when Cloudinary's callback delivers a success result (single-arg contract)", async () => {
    // This is the exact shape the v2.x SDK produces on success:
    // callback({ secure_url, public_id, ... }) — one argument.
    mocks.upload.mockImplementation(
      sdkSuccess({
        secure_url: "https://res.cloudinary.com/demo/image/upload/v16000/pic",
        public_id: "pic",
        resource_type: "image",
      })
    );

    const app = await buildTestApp();
    const agent = request.agent(app);
    await agent.post("/api/auth/signup").send({
      email: "owner@example.com",
      password: "correct-horse-battery",
    });

    const res = await agent
      .post("/api/upload")
      .attach("file", tinyJpeg, "pic.jpg");

    expect(res.status).toBe(200);
    expect(res.body.filename).toBe("pic.jpg");
    expect(res.body.path).toContain("signed");
    expect(fakeStorage.media.size).toBe(1);
  });

  it("saves video media via upload_large (single-arg contract)", async () => {
    mocks.uploadLarge.mockImplementation(
      sdkSuccess({
        secure_url: "https://res.cloudinary.com/demo/video/upload/v16000/clip",
        public_id: "clip",
        resource_type: "video",
      })
    );

    const app = await buildTestApp();
    const agent = request.agent(app);
    await agent.post("/api/auth/signup").send({
      email: "videouser@example.com",
      password: "correct-horse-battery",
    });

    const res = await agent
      .post("/api/upload")
      .attach("file", Buffer.from("fake-video-bytes"), "clip.mp4");

    expect(res.status).toBe(200);
    expect(res.body.type).toBe("video/mp4");
    expect(mocks.uploadLarge).toHaveBeenCalledOnce();
    expect(fakeStorage.media.size).toBe(1);
  });

  it("surfaces the real Cloudinary error (e.g. its 403) instead of a generic 500", async () => {
    // e.g. wrong Cloudinary credentials / plan restriction
    mocks.upload.mockImplementation(
      sdkFailure({ message: "Unknown account", http_code: 403 })
    );

    const app = await buildTestApp();
    const agent = request.agent(app);
    await agent.post("/api/auth/signup").send({
      email: "failuser@example.com",
      password: "correct-horse-battery",
    });

    const res = await agent
      .post("/api/upload")
      .attach("file", tinyJpeg, "pic.jpg");

    // Upstream storage failure: must NOT look like an app auth/permission
    // problem, and the message must carry Cloudinary's actual reason.
    expect(res.status).toBe(502);
    expect(res.body.message).toContain("Unknown account");
    expect(fakeStorage.media.size).toBe(0);
  });

  it("returns 404 (not 403) when the albumId does not exist", async () => {
    const app = await buildTestApp();
    const agent = request.agent(app);
    await agent.post("/api/auth/signup").send({
      email: "stale-album@example.com",
      password: "correct-horse-battery",
    });

    const res = await agent
      .post("/api/upload")
      .field("albumId", "does-not-exist")
      .attach("file", tinyJpeg, "pic.jpg");

    expect(res.status).toBe(404);
    expect(res.body.message).toBe("Album not found");
  });

  it("returns 403 only when the album exists but belongs to a different account", async () => {
    const app = await buildTestApp();

    // Sign up through each agent so the session cookie is bound to it.
    const ownerAgent = request.agent(app);
    await ownerAgent.post("/api/auth/signup").send({
      email: "owner2@example.com",
      password: "correct-horse-battery",
    });
    const otherAgent = request.agent(app);
    await otherAgent.post("/api/auth/signup").send({
      email: "intruder@example.com",
      password: "correct-horse-battery",
    });

    const albumRes = await ownerAgent.post("/api/albums").send({ name: "Mine" });
    expect(albumRes.status).toBe(200);
    const albumId = albumRes.body.id;
    expect(albumId).toBeTruthy();

    const res = await otherAgent
      .post("/api/upload")
      .field("albumId", albumId)
      .attach("file", tinyJpeg, "pic.jpg");

    expect(res.status).toBe(403);
    expect(res.body.message).not.toBe("Forbidden");
    expect(fakeStorage.media.size).toBe(0);
  });

  it("accepts uploads without an albumId (album-less media)", async () => {
    mocks.upload.mockImplementation(
      sdkSuccess({
        secure_url: "https://res.cloudinary.com/demo/image/upload/v16000/loose",
        public_id: "loose",
        resource_type: "image",
      })
    );

    const app = await buildTestApp();
    const agent = request.agent(app);
    await agent.post("/api/auth/signup").send({
      email: "loose@example.com",
      password: "correct-horse-battery",
    });

    const res = await agent
      .post("/api/upload")
      .attach("file", tinyJpeg, "loose.jpg");

    expect(res.status).toBe(200);
    expect(fakeStorage.media.size).toBe(1);
  });

  // --- New in 6458d17: secure_url fallback, one retry, self-diagnosing ---

  it("uses url fallback when secure_url is missing but url is present", async () => {
    // Some Cloudinary responses / older SDKs may return `url` instead of `secure_url`
    mocks.upload.mockImplementation(
      sdkSuccess({
        url: "https://res.cloudinary.com/demo/image/upload/v16000/fallback",
        public_id: "fallback",
        resource_type: "image",
      })
    );

    const app = await buildTestApp();
    const agent = request.agent(app);
    await agent.post("/api/auth/signup").send({
      email: "fallback@example.com",
      password: "correct-horse-battery",
    });

    const res = await agent
      .post("/api/upload")
      .attach("file", tinyJpeg, "fallback.jpg");

    expect(res.status).toBe(200);
    expect(fakeStorage.media.size).toBe(1);
    // path is signed URL derived from public_id, but the upload itself should succeed via fallback
    expect(res.body.filename).toBe("fallback.jpg");
  });

  it("retries once and succeeds after a transient failure", async () => {
    let callCount = 0;
    mocks.upload.mockImplementation((file: unknown, _opts: unknown, cb: (r: unknown) => void) => {
      callCount++;
      if (callCount === 1) {
        cb({ error: { message: "Transient error", http_code: 500 } });
      } else {
        cb({
          secure_url: "https://res.cloudinary.com/demo/image/upload/v16000/retry-ok",
          public_id: "retry-ok",
          resource_type: "image",
        });
      }
    });

    const app = await buildTestApp();
    const agent = request.agent(app);
    await agent.post("/api/auth/signup").send({
      email: "retry@example.com",
      password: "correct-horse-battery",
    });

    const res = await agent
      .post("/api/upload")
      .attach("file", tinyJpeg, "retry.jpg");

    expect(res.status).toBe(200);
    expect(callCount).toBe(2);
    expect(fakeStorage.media.size).toBe(1);
  });

  it("returns 502 after retry exhausted (both attempts fail)", async () => {
    mocks.upload.mockImplementation(
      sdkFailure({ message: "Service unavailable", http_code: 503 })
    );

    const app = await buildTestApp();
    const agent = request.agent(app);
    await agent.post("/api/auth/signup").send({
      email: "retry-fail@example.com",
      password: "correct-horse-battery",
    });

    const res = await agent
      .post("/api/upload")
      .attach("file", tinyJpeg, "fail.jpg");

    expect(res.status).toBe(502);
    expect(res.body.message).toContain("Service unavailable");
    // Should have attempted twice (one retry)
    expect(mocks.upload).toHaveBeenCalledTimes(2);
    expect(fakeStorage.media.size).toBe(0);
  });

  it("self-diagnoses api_key error with helpful hint mentioning CLOUDINARY_API_KEY", async () => {
    mocks.upload.mockImplementation(
      sdkFailure({ message: "Invalid API key", http_code: 401 })
    );

    const app = await buildTestApp();
    const agent = request.agent(app);
    await agent.post("/api/auth/signup").send({
      email: "diag-apikey@example.com",
      password: "correct-horse-battery",
    });

    const res = await agent
      .post("/api/upload")
      .attach("file", tinyJpeg, "diag.jpg");

    expect(res.status).toBe(502);
    expect(res.body.message).toContain("Invalid API key");
    expect(res.body.message).toContain("CLOUDINARY_API_KEY");
  });

  it("self-diagnoses cloud_name / unknown account error with helpful hint mentioning CLOUDINARY_CLOUD_NAME", async () => {
    mocks.upload.mockImplementation(
      sdkFailure({ message: "Unknown cloud_name", http_code: 404 })
    );

    const app = await buildTestApp();
    const agent = request.agent(app);
    await agent.post("/api/auth/signup").send({
      email: "diag-cloudname@example.com",
      password: "correct-horse-battery",
    });

    const res = await agent
      .post("/api/upload")
      .attach("file", tinyJpeg, "diag2.jpg");

    expect(res.status).toBe(502);
    expect(res.body.message).toContain("cloud_name");
    expect(res.body.message).toContain("CLOUDINARY_CLOUD_NAME");
  });
});
