import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync } from "node:fs";
import { mkdtemp, rm, truncate, writeFile } from "node:fs/promises";
import type { ClientRequest, IncomingMessage } from "node:http";
import https from "node:https";
import os from "node:os";
import path from "node:path";
import { PassThrough, Writable } from "node:stream";
import cloudinary from "../cloudinary";
import { uploadToCloudinary } from "../routes/shared";

// Exercise the installed SDK, including its v2 callback adapter, JSON parsing,
// promises, and disk/chunk upload paths. Only the outgoing HTTPS request is
// replaced: no real credentials, external requests, or Cloudinary assets.
// Uploader-level mocks alone previously locked in the wrong callback contract.
function mockUploadApi(
  reply: (options: https.RequestOptions) => { statusCode: number; body: unknown },
) {
  const request = (
    options: https.RequestOptions,
    onResponse: (response: IncomingMessage) => void,
  ) => {
    const sink = new Writable({
      write(_chunk, _encoding, done) {
        done();
      },
    });
    const fakeRequest = Object.assign(sink, {
      setTimeout: () => fakeRequest,
      abort: () => fakeRequest.destroy(),
    });
    fakeRequest.once("finish", () => {
      const { statusCode, body } = reply(options);
      const response = Object.assign(new PassThrough(), { statusCode });
      onResponse(response as unknown as IncomingMessage);
      response.end(JSON.stringify(body));
    });
    return fakeRequest as unknown as ClientRequest;
  };
  return vi.spyOn(https, "request").mockImplementation(request as typeof https.request);
}

function successResponse(resourceType: "image" | "video") {
  return {
    public_id: "cloudmediavault/test-asset",
    secure_url: `https://res.cloudinary.com/test-cloud/${resourceType}/authenticated/test-asset`,
    resource_type: resourceType,
    done: true,
  };
}

describe("uploadToCloudinary with the real v2 SDK", () => {
  let tempDir: string;
  let originalConfig: ReturnType<typeof cloudinary.config>;

  beforeEach(async () => {
    originalConfig = { ...cloudinary.config() };
    cloudinary.config(true);
    cloudinary.config({
      cloud_name: "test-cloud",
      api_key: "test-key",
      api_secret: "test-secret",
    });
    tempDir = await mkdtemp(path.join(os.tmpdir(), "snapvault-sdk-test-"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    cloudinary.config(true);
    cloudinary.config(originalConfig);
    await rm(tempDir, { recursive: true, force: true });
  });

  it.each(["image", "video"] as const)(
    "accepts the SDK's %s success callback and removes the temp file only when finished",
    async (resourceType) => {
      const filePath = path.join(tempDir, resourceType === "image" ? "pic.jpg" : "clip.mp4");
      await writeFile(filePath, "test-file-bytes");
      if (resourceType === "video") {
        // Cross the 6 MB chunk boundary to exercise an intermediate response.
        await truncate(filePath, 6 * 1024 * 1024 + 1);
      }
      const api = mockUploadApi((options) => {
        expect(existsSync(filePath)).toBe(true);
        expect(options.path).toBe(`/v1_1/test-cloud/${resourceType}/upload`);
        const range = (options.headers as Record<string, string>)["Content-Range"];
        return {
          statusCode: 200,
          body: range?.endsWith("/-1") ? { done: false } : successResponse(resourceType),
        };
      });

      await expect(uploadToCloudinary(filePath, path.basename(filePath), resourceType)).resolves.toEqual({
        url: successResponse(resourceType).secure_url,
        publicId: "cloudmediavault/test-asset",
        resourceType,
      });
      expect(api).toHaveBeenCalledTimes(resourceType === "video" ? 2 : 1);
      expect(existsSync(filePath)).toBe(false);
    },
  );

  it.each(["image", "video"] as const)(
    "propagates a %s API error without an unhandled SDK promise rejection",
    async (resourceType) => {
      const filePath = path.join(tempDir, resourceType === "image" ? "pic.jpg" : "clip.mp4");
      await writeFile(filePath, "test-file-bytes");
      const api = mockUploadApi(() => ({
        statusCode: 401,
        body: { error: { message: "Invalid API key" } },
      }));

      await expect(uploadToCloudinary(filePath, path.basename(filePath), resourceType)).rejects.toMatchObject({
        status: 502,
        cloudinaryHttpCode: 401,
        cloudinaryRawMessage: "Invalid API key",
        message: expect.stringContaining("CLOUDINARY_API_KEY"),
      });
      expect(api).toHaveBeenCalledTimes(2);
      expect(existsSync(filePath)).toBe(false);
    },
  );

  it("keeps the temp file for one retry after a transient API error", async () => {
    const filePath = path.join(tempDir, "retry.jpg");
    await writeFile(filePath, "test-file-bytes");
    let attempts = 0;
    const api = mockUploadApi(() => {
      expect(existsSync(filePath)).toBe(true);
      attempts++;
      return attempts === 1
        ? { statusCode: 500, body: { error: { message: "Service unavailable" } } }
        : { statusCode: 200, body: successResponse("image") };
    });

    await expect(uploadToCloudinary(filePath, "retry.jpg", "image")).resolves.toMatchObject({
      publicId: "cloudmediavault/test-asset",
    });
    expect(api).toHaveBeenCalledTimes(2);
    expect(existsSync(filePath)).toBe(false);
  });
});
