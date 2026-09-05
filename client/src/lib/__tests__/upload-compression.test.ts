// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { compressImage, isCompressibleImage } from "../upload";

/**
 * Browser-compression decision logic. jsdom has no real canvas encoder, so
 * the canvas/blob primitives are stubbed with fakes whose behavior we
 * control — what's under test is compressImage's decision-making: which
 * inputs to compress, exact dimension preservation, the ≥5% savings gate,
 * transparency/animation protection, and the always-fall-back-to-original
 * contract.
 */

const WEBP = "image/webp";
const PNG = "image/png";
const JPEG = "image/jpeg";

function bytes(n: number): BlobPart {
  return new Uint8Array(n);
}

function makeFile(name: string, type: string, size: number): File {
  const content = size > 0 ? "x".repeat(size) : "";
  const f = new File([content], name, { type });
  // Force the reported size for threshold tests without allocating huge
  // strings: File.size is readonly, so instead we pass real content. Tests
  // use sizes just above/below the 100KB threshold with sparse strings.
  return f;
}

let canvasToBlobImpl: ((type: string, quality: number) => Blob | null) | null = null;
let lastCanvas: any = null;

class FakeImage {
  naturalWidth = 0;
  naturalHeight = 0;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  private _src = "";
  set src(v: string) {
    this._src = v;
    queueMicrotask(() => {
      const dims = (FakeImage as any).nextDims ?? { width: 4000, height: 3000 };
      this.naturalWidth = dims.width;
      this.naturalHeight = dims.height;
      this.onload?.();
    });
  }
  get src() {
    return this._src;
  }
}

beforeEach(() => {
  vi.stubGlobal("createImageBitmap", undefined); // force the Image fallback path
  vi.stubGlobal("Image", FakeImage as any);
  vi.stubGlobal("URL", Object.assign(URL, {
    createObjectURL: () => "blob:fake",
    revokeObjectURL: () => {},
  }));

  lastCanvas = null;
  vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
    if (tag === "canvas") {
      const canvas: any = {
        width: 0,
        height: 0,
        getContext: () => ({ drawImage: vi.fn() }),
        toBlob: (cb: (b: Blob | null) => void, type: string, quality: number) => {
          const blob = canvasToBlobImpl ? canvasToBlobImpl(type, quality) : null;
          queueMicrotask(() => cb(blob));
        },
      };
      lastCanvas = canvas;
      return canvas;
    }
    return (document.createElement as any).wrappedMethod?.(tag) ?? {};
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("isCompressibleImage", () => {
  it("accepts only static JPEG/PNG inputs", () => {
    expect(isCompressibleImage(new File(["x"], "a.jpg", { type: JPEG }))).toBe(true);
    expect(isCompressibleImage(new File(["x"], "b.png", { type: PNG }))).toBe(true);
    expect(isCompressibleImage(new File(["x"], "c.heic", { type: "image/heic" }))).toBe(false);
    expect(isCompressibleImage(new File(["x"], "d.gif", { type: "image/gif" }))).toBe(false);
    expect(isCompressibleImage(new File(["x"], "e.webp", { type: "image/webp" }))).toBe(false);
    expect(isCompressibleImage(new File(["x"], "f.mp4", { type: "video/mp4" }))).toBe(false);
  });
});

describe("compressImage", () => {
  it("bypasses HEIC (browsers cannot decode it in a canvas anyway)", async () => {
    const file = makeFile("iphone.heic", "image/heic", 200 * 1024);
    const out = await compressImage(file);
    expect(out).toBe(file);
  });

  it("bypasses animated-capable containers like GIF", async () => {
    const file = makeFile("animation.gif", "image/gif", 200 * 1024);
    const out = await compressImage(file);
    expect(out).toBe(file);
  });

  it("bypasses files below the compression threshold", async () => {
    const file = makeFile("tiny.jpg", JPEG, 50 * 1024);
    const out = await compressImage(file);
    expect(out).toBe(file);
    expect(canvasToBlobImpl).toBeNull(); // not even set; nothing runs
  });

  it("keeps a JPEG as high-quality WebP when it saves ≥5%, preserving exact dimensions and name", async () => {
    canvasToBlobImpl = (type) => {
      expect(type).toBe(WEBP);
      return new File([bytes(1)], "out", { type: WEBP }); // tiny → big savings
    };
    (FakeImage as any).nextDims = { width: 4000, height: 3000 };

    const file = makeFile("beach.jpg", JPEG, 150 * 1024);
    const out = await compressImage(file);

    expect(out).not.toBe(file);
    expect(out.type).toBe(WEBP);
    expect(out.name).toBe("beach.jpg");
    // Exact original dimensions — no upscale, no downscale.
    expect(lastCanvas.width).toBe(4000);
    expect(lastCanvas.height).toBe(3000);
  });

  it("keeps the ORIGINAL when WebP output saves <5% (threshold-size input)", async () => {
    const size = 150 * 1024;
    // Input 150KB; output 147KB (98% of input — only 2% saved).
    canvasToBlobImpl = () => new File(["z".repeat(147 * 1024)], "out", { type: WEBP });

    const file = new File(["x".repeat(size)], "gate.jpg", { type: JPEG });
    const out = await compressImage(file);
    expect(out).toBe(file);
  });

  it("never flattens transparency: a JPEG fallback blob is refused", async () => {
    // Browser can't encode WebP and returns a JPEG blob from toBlob —
    // accepting it would flatten any alpha. Must fall back to the original.
    const size = 150 * 1024;
    canvasToBlobImpl = (requested) =>
      requested === WEBP ? new File([bytes(1)], "out", { type: JPEG }) : null;

    const file = new File(["x".repeat(size)], "alpha.png", { type: PNG });
    const out = await compressImage(file);
    expect(out).toBe(file);
  });

  it("accepts a PNG fallback (no WebP encoder) for PNG input when it saves enough", async () => {
    const size = 150 * 1024;
    canvasToBlobImpl = (requested) =>
      requested === WEBP ? new File([bytes(10 * 1024)], "out", { type: PNG }) : null;

    const file = new File(["x".repeat(size)], "drawing.png", { type: PNG });
    const out = await compressImage(file);
    expect(out).not.toBe(file);
    expect(out.type).toBe(PNG); // transparency-safe container retained
  });

  it("bypasses images too large for a mobile canvas instead of risking a broken encode", async () => {
    (FakeImage as any).nextDims = { width: 5000, height: 4000 }; // 20MP > 16MP guard
    const size = 150 * 1024;
    canvasToBlobImpl = () => new File([bytes(1)], "out", { type: WEBP });

    const file = new File(["x".repeat(size)], "huge.jpg", { type: JPEG });
    const out = await compressImage(file);
    expect(out).toBe(file);
  });

  it("falls back to the original when encoding never completes (bounded fallback)", async () => {
    vi.useFakeTimers();
    try {
      const size = 150 * 1024;
      // toBlob never calls its callback (wedged encoder).
      vi.spyOn(document, "createElement").mockImplementation(() => ({
        width: 0,
        height: 0,
        getContext: () => ({ drawImage: vi.fn() }),
        toBlob: () => {
          /* never resolves */
        },
      }));

      const file = new File(["x".repeat(size)], "stuck.jpg", { type: JPEG });
      const promise = compressImage(file);
      const out = await vi.advanceTimersByTimeAsync(16_000).then(() => promise);
      expect(out).toBe(file);
    } finally {
      vi.useRealTimers();
    }
  });
});
