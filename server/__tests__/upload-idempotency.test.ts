import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { fakeStorage } from "./fakeStorage";

// Upload identity + idempotency at the route level: stable client upload
// ids, namespaced Cloudinary public ids, overwrite:false, provider-reported
// byte counts/types in the media row, and duplicate-record prevention after
// a lost response — plus the search endpoint's filter/pagination envelope.

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
    url: (publicId: string) => `https://res.cloudinary.com/test/image/upload/signed/${publicId}`,
  },
}));

vi.mock("../storage", async () => {
  const { fakeStorage } = await import("./fakeStorage");
  return { storage: fakeStorage };
});

const { buildTestApp } = await import("./testApp");

const tinyJpeg = Buffer.from("fake-jpeg-bytes", "utf8");
const tinyMp4 = Buffer.from("fake-mp4-bytes", "utf8");

function sdkSuccess(result: Record<string, unknown>) {
  return (_file: unknown, _options: unknown, cb: any) => {
    cb(undefined, { ...result });
  };
}

let agent: request.Agent;
let userId: string;
let albumId: string;

beforeEach(async () => {
  fakeStorage.reset();
  mocks.upload.mockReset();
  mocks.uploadLarge.mockReset();
  mocks.destroy.mockReset();

  const app = await buildTestApp();
  agent = request.agent(app);
  const signup = await agent
    .post("/api/auth/signup")
    .send({ email: "uploader@example.com", password: "correct-horse-battery" });
  userId = signup.body.id;

  const album = await agent.post("/api/albums").send({ name: "Uploads" });
  albumId = album.body.id;
});

describe("POST /api/upload with a stable upload id", () => {
  it("uses a per-account namespaced public id with overwrite:false", async () => {
    mocks.upload.mockImplementation(
      sdkSuccess({
        public_id: "irrelevant-server-assigned",
        secure_url: "https://res.cloudinary.com/t/image/authenticated/x",
        bytes: 4321,
        format: "jpg",
      })
    );

    const res = await agent
      .post("/api/upload")
      .field("albumId", albumId)
      .field("uploadId", "0123456789abcdef")
      .attach("file", tinyJpeg, "photo.jpg");

    expect(res.status).toBe(200);
    const [, options] = mocks.upload.mock.calls[0];
    expect(options.folder).toBe(`cloudmediavault/${userId}`);
    expect(options.public_id).toBe("0123456789abcdef");
    expect(options.overwrite).toBe(false);
    expect(options.unique_filename).toBe(false);
    // Still-photo optimization for JPEG input (and no resize).
    expect(options.quality).toBe("auto:good");
  });

  it("does NOT apply lossy optimization to potentially-animated containers", async () => {
    mocks.upload.mockImplementation(
      sdkSuccess({
        public_id: "cloudmediavault/x/gif-1",
        secure_url: "https://res.cloudinary.com/t/image/authenticated/gif-1",
        bytes: 99,
        format: "gif",
      })
    );

    const res = await agent
      .post("/api/upload")
      .field("uploadId", "gif-upload-0001")
      .attach("file", tinyJpeg, "animation.gif", { contentType: "image/gif" });

    expect(res.status).toBe(200);
    const [, options] = mocks.upload.mock.calls[0];
    expect(options.quality).toBeUndefined();
  });

  it("requests H.264/MP4 with content-aware quality for videos — no resize or fps cap", async () => {
    mocks.uploadLarge.mockImplementation(
      sdkSuccess({
        public_id: "cloudmediavault/x/vid-1",
        secure_url: "https://res.cloudinary.com/t/video/authenticated/vid-1",
        bytes: 5000,
        format: "mp4",
      })
    );

    const res = await agent
      .post("/api/upload")
      .field("albumId", albumId)
      .field("uploadId", "video-upload-01")
      .attach("file", tinyMp4, "clip.mov", { contentType: "video/quicktime" });

    expect(res.status).toBe(200);
    expect(mocks.uploadLarge).toHaveBeenCalled();
    const [, options] = mocks.uploadLarge.mock.calls[0];
    expect(options.video_codec).toBe("h264");
    expect(options.format).toBe("mp4");
    expect(options.quality).toBe("auto");
    expect(options.chunk_size).toBe(6 * 1024 * 1024);
    expect(options.width).toBeUndefined();
    expect(options.height).toBeUndefined();
    expect(options.fps).toBeUndefined();
    // The stored row reflects the delivered MP4, not the QuickTime input.
    expect(res.body.type).toBe("video/mp4");
  });

  it("stores Cloudinary's actual optimized byte count", async () => {
    mocks.upload.mockImplementation(
      sdkSuccess({
        public_id: "cloudmediavault/x/opt-1",
        secure_url: "https://res.cloudinary.com/t/image/authenticated/opt-1",
        bytes: 4321,
        format: "jpg",
      })
    );

    const res = await agent
      .post("/api/upload")
      .field("uploadId", "opt-upload-0001")
      .attach("file", Buffer.alloc(10_000), "big.jpg", { contentType: "image/jpeg" });

    expect(res.status).toBe(200);
    expect(res.body.size).toBe(4321); // provider bytes, not the 10,000 input
  });

  it("prevents duplicate records when the same uploadId is re-sent after a lost response", async () => {
    mocks.upload.mockImplementation(
      sdkSuccess({
        public_id: `cloudmediavault/${userId}/dupe-1`,
        secure_url: "https://res.cloudinary.com/t/image/authenticated/dupe-1",
        bytes: 100,
        format: "jpg",
      })
    );

    const first = await agent
      .post("/api/upload")
      .field("uploadId", "dupe-upload-001")
      .attach("file", tinyJpeg, "one.jpg");
    expect(first.status).toBe(200);

    const second = await agent
      .post("/api/upload")
      .field("uploadId", "dupe-upload-001")
      .attach("file", tinyJpeg, "one.jpg");
    expect(second.status).toBe(200);

    // Same underlying record returned; no duplicate row was created.
    expect(second.body.id).toBe(first.body.id);
    expect(fakeStorage.media.size).toBe(1);
  });

  it("treats Cloudinary's 'already exists' as reuse, not failure", async () => {
    mocks.upload.mockImplementation((_f: unknown, _o: unknown, cb: any) => {
      cb({ message: "File already exists", http_code: 400, name: "BadRequest" });
    });

    const res = await agent
      .post("/api/upload")
      .field("uploadId", "reuse-upload-001")
      .attach("file", tinyJpeg, "retry.jpg");

    expect(res.status).toBe(200);
    expect(mocks.upload).toHaveBeenCalledTimes(1); // permanent: not retried
    expect(res.body.cloudinaryPublicId).toBe(`cloudmediavault/${userId}/reuse-upload-001`);
    expect(fakeStorage.media.size).toBe(1);
  });

  it("still accepts legacy clients that send no uploadId (unique filenames)", async () => {
    mocks.upload.mockImplementation(
      sdkSuccess({
        public_id: "cloudmediavault/legacy",
        secure_url: "https://res.cloudinary.com/t/image/authenticated/legacy",
        bytes: 55,
        format: "jpg",
      })
    );

    const res = await agent.post("/api/upload").attach("file", tinyJpeg, "old-client.jpg");
    expect(res.status).toBe(200);
    const [, options] = mocks.upload.mock.calls[0];
    expect(options.public_id).toBeUndefined();
    expect(options.unique_filename).toBe(true);
    expect(options.overwrite).toBe(false);
  });

  it("ignores malformed upload ids rather than trusting arbitrary values", async () => {
    mocks.upload.mockImplementation(
      sdkSuccess({
        public_id: "cloudmediavault/x/bad",
        secure_url: "https://res.cloudinary.com/t/image/authenticated/bad",
        bytes: 1,
        format: "jpg",
      })
    );

    const res = await agent
      .post("/api/upload")
      .field("uploadId", "../../etc/passwd; DROP TABLE users; --")
      .attach("file", tinyJpeg, "photo.jpg");

    expect(res.status).toBe(200);
    const [, options] = mocks.upload.mock.calls[0];
    // Malformed id ignored: no deterministic public id from user input.
    expect(options.public_id).toBeUndefined();
  });
});

describe("GET /api/media/search envelope", () => {
  it("returns paginated metadata with hasMore and applies filters server-side", async () => {
    // Seed via storage directly (route-level envelope is under test).
    for (let i = 0; i < 3; i++) {
      await fakeStorage.createMedia(
        {
          filename: `photo-${i}.jpg`,
          path: "p",
          type: "image/jpeg",
          size: 1,
          albumId,
        } as any,
        userId,
        { publicId: `p${i}`, resourceType: "image" }
      );
    }
    await fakeStorage.createMedia(
      { filename: "clip.mp4", path: "p", type: "video/mp4", size: 1, albumId } as any,
      userId,
      { publicId: "v", resourceType: "video" }
    );

    const res = await agent.get("/api/media/search?q=photo&type=image&limit=2&page=1");
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(3);
    expect(res.body.items).toHaveLength(2);
    expect(res.body.hasMore).toBe(true);
    expect(res.body.page).toBe(1);
    expect(res.body.items.every((m: any) => m.type === "image/jpeg")).toBe(true);

    const page2 = await agent.get("/api/media/search?q=photo&type=image&limit=2&page=2");
    expect(page2.body.items).toHaveLength(1);
    expect(page2.body.hasMore).toBe(false);
  });

  it("supports the favorites filter without any text query", async () => {
    const fav = await fakeStorage.createMedia(
      { filename: "heart.jpg", path: "p", type: "image/jpeg", size: 1, albumId } as any,
      userId,
      { publicId: "h", resourceType: "image" }
    );
    await fakeStorage.setMediaFavorite(fav.id, true);
    await fakeStorage.createMedia(
      { filename: "plain.jpg", path: "p", type: "image/jpeg", size: 1, albumId } as any,
      userId,
      { publicId: "pl", resourceType: "image" }
    );

    const res = await agent.get("/api/media/search?favorite=true");
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.items[0].filename).toBe("heart.jpg");
  });

  it("requires authentication", async () => {
    const app = await buildTestApp();
    const res = await request(app).get("/api/media/search?q=anything");
    expect(res.status).toBe(401);
  });
});
