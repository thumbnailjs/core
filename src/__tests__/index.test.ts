// ---------------------------------------------------------------------------
// index.test.ts — Integration tests for thumbnail() and thumbnail.use()
//
// Runs in Vitest Browser Mode (real Chromium). No mocks for DOM or browser
// APIs — every canvas, blob, and pixel is real. vi.fn() is used only to
// build spy renderers, never to replace platform APIs.
//
// Each test calls `thumbnail.reset()` to restore the default renderer registry
// so registration from one test never leaks into another.
// ---------------------------------------------------------------------------

import { describe, it, expect, vi, beforeEach } from "vitest";
import { thumbnail } from "../index";

// ---- helpers --------------------------------------------------------------

/** Create a real PNG Blob by painting a solid colour onto a canvas. */
function makePngBlob(w: number, h: number, colour = "#ff0000"): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = colour;
  ctx.fillRect(0, 0, w, h);
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("toBlob failed"))),
      "image/png",
    );
  });
}

/** Create a real JPEG Blob. */
function makeJpegBlob(w: number, h: number, colour = "#00ff00"): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = colour;
  ctx.fillRect(0, 0, w, h);
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("toBlob failed"))),
      "image/jpeg",
      0.9,
    );
  });
}

/** Read the RGBA value of a single pixel from a canvas. */
function pixelAt(
  canvas: HTMLCanvasElement,
  x: number,
  y: number,
): [number, number, number, number] {
  const ctx = canvas.getContext("2d")!;
  const d = ctx.getImageData(x, y, 1, 1).data;
  return [d[0], d[1], d[2], d[3]];
}

beforeEach(() => {
  thumbnail.reset();
});

// ===========================================================================
// Built-in image handling (no thumbnail.use() needed)
// ===========================================================================

describe("thumbnail() — built-in image handling", () => {
  it("produces a Blob from a PNG input", async () => {
    const png = await makePngBlob(200, 100);
    const result = await thumbnail(png);
    expect(result).toBeInstanceOf(Blob);
    expect((result as Blob).size).toBeGreaterThan(0);
  });

  it("produces a Blob from a JPEG input", async () => {
    const jpeg = await makeJpegBlob(200, 100);
    const result = await thumbnail(jpeg);
    expect(result).toBeInstanceOf(Blob);
    expect((result as Blob).size).toBeGreaterThan(0);
  });

  it("output Blob is a valid decodable PNG", async () => {
    const png = await makePngBlob(300, 150);
    const result = (await thumbnail(png)) as Blob;
    expect(result.type).toBe("image/png");

    // Decode and verify it's a real image
    const bitmap = await createImageBitmap(result);
    expect(bitmap.width).toBeGreaterThan(0);
    expect(bitmap.height).toBeGreaterThan(0);
    bitmap.close();
  });

  it("default width is 256 and preserves aspect ratio", async () => {
    // 800×400 source → default width=256, auto height → 256*(400/800)=128
    const png = await makePngBlob(800, 400);
    const result = (await thumbnail(png, {
      format: "canvas",
    })) as HTMLCanvasElement;
    expect(result.width).toBe(256);
    expect(result.height).toBe(128);
  });

  it("respects custom width with auto height", async () => {
    const png = await makePngBlob(1000, 500); // 2:1
    const result = (await thumbnail(png, {
      width: 100,
      format: "canvas",
    })) as HTMLCanvasElement;
    expect(result.width).toBe(100);
    expect(result.height).toBe(50); // 100 * (500/1000)
  });

  it("respects custom width and height", async () => {
    const png = await makePngBlob(400, 400);
    const result = (await thumbnail(png, {
      width: 120,
      height: 80,
      format: "canvas",
    })) as HTMLCanvasElement;
    expect(result.width).toBe(120);
    expect(result.height).toBe(80);
  });

  it("thumbnail contains actual pixel data (not blank)", async () => {
    const png = await makePngBlob(100, 100, "#ff0000");
    const canvas = (await thumbnail(png, {
      width: 50,
      height: 50,
      format: "canvas",
    })) as HTMLCanvasElement;

    const [r, g, b, a] = pixelAt(canvas, 25, 25);
    expect(r).toBe(255);
    expect(g).toBe(0);
    expect(b).toBe(0);
    expect(a).toBe(255);
  });

  it("handles File objects (with name and type)", async () => {
    const pngBlob = await makePngBlob(100, 100);
    const arrayBuf = await pngBlob.arrayBuffer();
    const file = new File([arrayBuf], "test-image.png", { type: "image/png" });
    const result = await thumbnail(file);
    expect(result).toBeInstanceOf(Blob);
    expect((result as Blob).size).toBeGreaterThan(0);
  });

  it("handles ArrayBuffer input", async () => {
    const png = await makePngBlob(80, 80);
    const arrayBuffer = await png.arrayBuffer();
    const result = await thumbnail(arrayBuffer);
    expect(result).toBeInstanceOf(Blob);
    expect((result as Blob).size).toBeGreaterThan(0);
  });

  it("handles string URL input (blob URL)", async () => {
    const png = await makePngBlob(60, 60, "#0000ff");
    const url = URL.createObjectURL(png);
    try {
      const result = await thumbnail(url);
      expect(result).toBeInstanceOf(Blob);
      expect((result as Blob).size).toBeGreaterThan(0);
    } finally {
      URL.revokeObjectURL(url);
    }
  });
});

// ===========================================================================
// Output formats
// ===========================================================================

describe("thumbnail() — output formats", () => {
  it("default format returns a Blob", async () => {
    const png = await makePngBlob(100, 100);
    const result = await thumbnail(png);
    expect(result).toBeInstanceOf(Blob);
  });

  it("format 'blob' returns a PNG Blob", async () => {
    const png = await makePngBlob(100, 100);
    const result = (await thumbnail(png, { format: "blob" })) as Blob;
    expect(result).toBeInstanceOf(Blob);
    expect(result.type).toBe("image/png");
  });

  it("format 'dataurl' returns a data URL string", async () => {
    const png = await makePngBlob(100, 100);
    const result = await thumbnail(png, { format: "dataurl" });
    expect(typeof result).toBe("string");
    expect((result as string).startsWith("data:image/png;base64,")).toBe(true);
  });

  it("data URL contains substantial base64 data", async () => {
    const png = await makePngBlob(100, 100, "#ff0000");
    const result = (await thumbnail(png, { format: "dataurl" })) as string;
    const base64 = result.split(",")[1];
    expect(base64.length).toBeGreaterThan(20);
  });

  it("format 'canvas' returns an HTMLCanvasElement", async () => {
    const png = await makePngBlob(100, 100);
    const result = await thumbnail(png, { format: "canvas" });
    expect(result).toBeInstanceOf(HTMLCanvasElement);
  });

  it("canvas output has a working 2d context", async () => {
    const png = await makePngBlob(50, 50);
    const canvas = (await thumbnail(png, {
      format: "canvas",
    })) as HTMLCanvasElement;
    const ctx = canvas.getContext("2d");
    expect(ctx).not.toBeNull();
  });
});

// ===========================================================================
// Fit and background options
// ===========================================================================

describe("thumbnail() — fit and background", () => {
  it("contain mode letterboxes a wide image into a square target", async () => {
    // 200×100 red image → 100×100 contain → 100×50 centred, top/bottom transparent
    const png = await makePngBlob(200, 100, "#ff0000");
    const canvas = (await thumbnail(png, {
      width: 100,
      height: 100,
      fit: "contain",
      format: "canvas",
    })) as HTMLCanvasElement;

    // Top-left corner should be transparent (letterbox area)
    const [, , , aTop] = pixelAt(canvas, 10, 5);
    expect(aTop).toBe(0);

    // Centre should be red (the image)
    const [r, g, b, aCenter] = pixelAt(canvas, 50, 50);
    expect(r).toBe(255);
    expect(g).toBe(0);
    expect(b).toBe(0);
    expect(aCenter).toBe(255);
  });

  it("cover mode fills entire target (no transparent regions)", async () => {
    // 200×100 red image → 100×100 cover → fully covered
    const png = await makePngBlob(200, 100, "#ff0000");
    const canvas = (await thumbnail(png, {
      width: 100,
      height: 100,
      fit: "cover",
      format: "canvas",
    })) as HTMLCanvasElement;

    // Every corner should have non-transparent pixels
    for (const [x, y] of [
      [5, 5],
      [95, 5],
      [5, 95],
      [95, 95],
    ] as const) {
      const [, , , a] = pixelAt(canvas, x, y);
      expect(a).toBe(255);
    }
  });

  it("background colour fills letterbox areas", async () => {
    // 200×100 red → 100×100 contain with blue background
    const png = await makePngBlob(200, 100, "#ff0000");
    const canvas = (await thumbnail(png, {
      width: 100,
      height: 100,
      fit: "contain",
      background: "#0000ff",
      format: "canvas",
    })) as HTMLCanvasElement;

    // Letterbox area should be blue
    const [r, g, b, a] = pixelAt(canvas, 50, 2);
    expect(r).toBe(0);
    expect(g).toBe(0);
    expect(b).toBe(255);
    expect(a).toBe(255);
  });
});

// ===========================================================================
// AbortSignal support
// ===========================================================================

describe("thumbnail() — AbortSignal", () => {
  it("throws AbortError when signal is already aborted", async () => {
    const png = await makePngBlob(100, 100);
    const controller = new AbortController();
    controller.abort();

    await expect(
      thumbnail(png, { signal: controller.signal }),
    ).rejects.toThrow();
  });

  it("thrown error has name 'AbortError'", async () => {
    const png = await makePngBlob(100, 100);
    const controller = new AbortController();
    controller.abort();

    try {
      await thumbnail(png, { signal: controller.signal });
      expect.unreachable("should have thrown");
    } catch (err: any) {
      expect(err.name).toBe("AbortError");
    }
  });

  it("signal forwarded to fetch when input is a URL", async () => {
    const controller = new AbortController();
    controller.abort();

    // blob URL + aborted signal → should throw AbortError before fetch completes
    const png = await makePngBlob(50, 50);
    const url = URL.createObjectURL(png);
    try {
      await expect(
        thumbnail(url, { signal: controller.signal }),
      ).rejects.toThrow();
    } finally {
      URL.revokeObjectURL(url);
    }
  });
});

// ===========================================================================
// Fallback icon (unknown file types)
// ===========================================================================

describe("thumbnail() — fallback icon", () => {
  it("generates an icon instead of throwing for unknown file", async () => {
    // Random bytes that aren't a valid image
    const unknown = new Blob([new Uint8Array([0x01, 0x02, 0x03, 0x04, 0x05])]);
    const result = await thumbnail(unknown);
    expect(result).toBeInstanceOf(Blob);
    expect((result as Blob).size).toBeGreaterThan(0);
  });

  it("fallback icon has requested dimensions", async () => {
    const unknown = new Blob([new Uint8Array([0xde, 0xad, 0xbe, 0xef])]);
    const canvas = (await thumbnail(unknown, {
      width: 128,
      height: 128,
      format: "canvas",
    })) as HTMLCanvasElement;
    expect(canvas.width).toBe(128);
    expect(canvas.height).toBe(128);
  });

  it("fallback icon contains non-transparent pixels (actually drawn)", async () => {
    const unknown = new Blob([new Uint8Array([0xde, 0xad, 0xbe, 0xef])]);
    const canvas = (await thumbnail(unknown, {
      width: 200,
      height: 200,
      format: "canvas",
    })) as HTMLCanvasElement;

    // Sample several points — at least some should be non-transparent
    const ctx = canvas.getContext("2d")!;
    const imgData = ctx.getImageData(0, 0, 200, 200);
    let nonTransparentCount = 0;
    for (let i = 3; i < imgData.data.length; i += 4) {
      if (imgData.data[i] > 0) nonTransparentCount++;
    }
    expect(nonTransparentCount).toBeGreaterThan(100);
  });

  it("fallback icon for a File with .xyz extension works", async () => {
    const file = new File([new Uint8Array([0x01, 0x02, 0x03])], "report.xyz", {
      type: "",
    });
    const result = await thumbnail(file);
    expect(result).toBeInstanceOf(Blob);
    expect((result as Blob).size).toBeGreaterThan(0);
  });

  it("fallback blob output is a valid PNG", async () => {
    const unknown = new Blob([new Uint8Array([0xca, 0xfe])]);
    const result = (await thumbnail(unknown)) as Blob;
    expect(result.type).toBe("image/png");
    // Should be decodable
    const bitmap = await createImageBitmap(result);
    expect(bitmap.width).toBeGreaterThan(0);
    bitmap.close();
  });
});

// ===========================================================================
// thumbnail.use() and custom renderers
// ===========================================================================

describe("thumbnail.use() — custom renderers", () => {
  it("registered renderer is invoked when test() returns true", async () => {
    thumbnail.reset();
    const renderFn = vi.fn(async (_file: Blob, opts: any) => {
      const canvas = document.createElement("canvas");
      canvas.width = opts.width || 100;
      canvas.height = opts.height || 100;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#00ff00";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      return canvas;
    });

    thumbnail.use({
      name: "test-renderer",
      test: () => true,
      render: renderFn,
    });

    const blob = new Blob([new Uint8Array([1, 2, 3])]);
    await thumbnail(blob, { format: "canvas" });

    expect(renderFn).toHaveBeenCalledTimes(1);
  });

  it("renderer receives the file blob and resolved options", async () => {
    thumbnail.reset();
    let receivedFile: Blob | null = null;
    let receivedOpts: any = null;

    thumbnail.use({
      name: "spy-renderer",
      test: () => true,
      render: async (file, opts) => {
        receivedFile = file;
        receivedOpts = opts;
        const c = document.createElement("canvas");
        c.width = opts.width;
        c.height = opts.height || opts.width;
        return c;
      },
    });

    const input = new Blob([new Uint8Array([10, 20, 30])]);
    await thumbnail(input, {
      width: 300,
      height: 200,
      fit: "cover",
      background: "#fff",
    });

    expect(receivedFile).toBeInstanceOf(Blob);
    expect(receivedOpts).not.toBeNull();
    expect(receivedOpts.width).toBe(300);
    expect(receivedOpts.height).toBe(200);
    expect(receivedOpts.fit).toBe("cover");
    expect(receivedOpts.background).toBe("#fff");
  });

  it("renderer result is used as the thumbnail output", async () => {
    thumbnail.reset();
    thumbnail.use({
      name: "green-renderer",
      test: () => true,
      render: async (_file, opts) => {
        const c = document.createElement("canvas");
        c.width = opts.width;
        c.height = opts.height || opts.width;
        const ctx = c.getContext("2d")!;
        ctx.fillStyle = "#00ff00";
        ctx.fillRect(0, 0, c.width, c.height);
        return c;
      },
    });

    const input = new Blob([new Uint8Array([0])]);
    const canvas = (await thumbnail(input, {
      width: 50,
      height: 50,
      format: "canvas",
    })) as HTMLCanvasElement;

    const [r, g, b, a] = pixelAt(canvas, 25, 25);
    expect(r).toBe(0);
    expect(g).toBe(255);
    expect(b).toBe(0);
    expect(a).toBe(255);
  });

  it("renderer with test() returning false is skipped", async () => {
    const skippedRender = vi.fn(async () => document.createElement("canvas"));

    thumbnail.use({
      name: "never-match",
      test: () => false,
      render: skippedRender,
    });

    const png = await makePngBlob(50, 50);
    await thumbnail(png);

    expect(skippedRender).not.toHaveBeenCalled();
  });

  it("first matching renderer wins (order matters)", async () => {
    thumbnail.reset();
    const firstRender = vi.fn(async (_f: Blob, opts: any) => {
      const c = document.createElement("canvas");
      c.width = opts.width;
      c.height = opts.height || opts.width;
      return c;
    });
    const secondRender = vi.fn(async (_f: Blob, opts: any) => {
      const c = document.createElement("canvas");
      c.width = opts.width;
      c.height = opts.height || opts.width;
      return c;
    });

    thumbnail.use({ name: "first", test: () => true, render: firstRender });
    thumbnail.use({ name: "second", test: () => true, render: secondRender });

    const blob = new Blob([new Uint8Array([1])]);
    await thumbnail(blob);

    expect(firstRender).toHaveBeenCalledTimes(1);
    expect(secondRender).not.toHaveBeenCalled();
  });

  it("custom renderer catches files defaults do not match", async () => {
    thumbnail.reset();
    const customRender = vi.fn(async (_f: Blob, opts: any) => {
      const c = document.createElement("canvas");
      c.width = opts.width;
      c.height = opts.height || opts.width;
      const ctx = c.getContext("2d")!;
      ctx.fillStyle = "#0000ff";
      ctx.fillRect(0, 0, c.width, c.height);
      return c;
    });

    thumbnail.use({
      name: "catch-all",
      test: () => true,
      render: customRender,
    });

    // Unknown blob — built-in renderers won't match, custom renderer catches it
    const blob = new Blob([new Uint8Array([0xde, 0xad])]);
    const canvas = (await thumbnail(blob, {
      width: 50,
      height: 50,
      format: "canvas",
    })) as HTMLCanvasElement;

    expect(customRender).toHaveBeenCalledTimes(1);

    // Should be blue (from custom renderer)
    const [r, , b] = pixelAt(canvas, 25, 25);
    expect(b).toBe(255);
    expect(r).toBe(0);
  });

  it("supports async test() functions", async () => {
    const renderFn = vi.fn(async (_f: Blob, opts: any) => {
      const c = document.createElement("canvas");
      c.width = opts.width;
      c.height = opts.height || opts.width;
      return c;
    });

    thumbnail.reset();
    thumbnail.use({
      name: "async-test",
      test: async (file) => {
        // Simulate async work (e.g. reading bytes)
        const buf = await file.slice(0, 1).arrayBuffer();
        return new Uint8Array(buf)[0] === 0xab;
      },
      render: renderFn,
    });

    // Matching byte
    const matching = new Blob([new Uint8Array([0xab, 0x00])]);
    await thumbnail(matching);
    expect(renderFn).toHaveBeenCalledTimes(1);

    // Non-matching byte → render should not be called again
    // (will fall through to built-in or fallback)
    renderFn.mockClear();
    const nonMatching = new Blob([new Uint8Array([0x00, 0x00])]);
    await thumbnail(nonMatching);
    expect(renderFn).not.toHaveBeenCalled();
  });

  it("multiple thumbnail.use() calls accumulate renderers", async () => {
    thumbnail.reset();
    const calls: string[] = [];

    thumbnail.use({
      name: "r1",
      test: () => {
        calls.push("test-r1");
        return false;
      },
      render: async () => document.createElement("canvas"),
    });

    thumbnail.use({
      name: "r2",
      test: () => {
        calls.push("test-r2");
        return false;
      },
      render: async () => document.createElement("canvas"),
    });

    thumbnail.use({
      name: "r3",
      test: () => {
        calls.push("test-r3");
        return true;
      },
      render: async (_f, opts) => {
        const c = document.createElement("canvas");
        c.width = opts.width;
        c.height = opts.height || opts.width;
        return c;
      },
    });

    const blob = new Blob([new Uint8Array([1])]);
    await thumbnail(blob);

    // All three test() functions should be called in order
    expect(calls).toEqual(["test-r1", "test-r2", "test-r3"]);
  });
});

// ===========================================================================
// Re-exports
// ===========================================================================

describe("module exports", () => {
  it("exports thumbnail function", () => {
    expect(typeof thumbnail).toBe("function");
  });

  it("exports thumbnail.use method", () => {
    expect(typeof thumbnail.use).toBe("function");
  });

  it("exports thumbnail.reset method", () => {
    expect(typeof thumbnail.reset).toBe("function");
  });

  it("exports detect function", async () => {
    const { detect } = await import("../index");
    expect(typeof detect).toBe("function");
  });

  it("exports familyColors object", async () => {
    const { familyColors } = await import("../index");
    expect(typeof familyColors).toBe("object");
    expect(familyColors).toHaveProperty("image");
    expect(familyColors).toHaveProperty("video");
    expect(familyColors).toHaveProperty("document");
  });
});

// ===========================================================================
// Edge cases
// ===========================================================================

describe("thumbnail() — edge cases", () => {
  it("handles a 1×1 pixel image", async () => {
    const tiny = await makePngBlob(1, 1, "#ff0000");
    const result = await thumbnail(tiny, { width: 50, format: "canvas" });
    expect(result).toBeInstanceOf(HTMLCanvasElement);
    expect((result as HTMLCanvasElement).width).toBe(50);
  });

  it("handles a very large dimension request", async () => {
    const png = await makePngBlob(10, 10);
    const canvas = (await thumbnail(png, {
      width: 2000,
      height: 2000,
      format: "canvas",
    })) as HTMLCanvasElement;
    expect(canvas.width).toBe(2000);
    expect(canvas.height).toBe(2000);
  });

  it("handles a wide panoramic source", async () => {
    const wide = await makePngBlob(2000, 100); // 20:1 aspect
    const canvas = (await thumbnail(wide, {
      width: 200,
      format: "canvas",
    })) as HTMLCanvasElement;
    expect(canvas.width).toBe(200);
    // Auto height: 200 * (100/2000) = 10
    expect(canvas.height).toBe(10);
  });

  it("handles a tall portrait source", async () => {
    const tall = await makePngBlob(100, 2000); // 1:20 aspect
    const canvas = (await thumbnail(tall, {
      width: 200,
      format: "canvas",
    })) as HTMLCanvasElement;
    expect(canvas.width).toBe(200);
    // Auto height: 200 * (2000/100) = 4000
    expect(canvas.height).toBe(4000);
  });

  it("rejects invalid input type", async () => {
    await expect(thumbnail(12345 as any)).rejects.toThrow(
      /input must be a File, Blob, ArrayBuffer, or URL string/,
    );
  });

  it("empty Blob triggers fallback icon (not a crash)", async () => {
    const empty = new Blob([]);
    const result = await thumbnail(empty);
    expect(result).toBeInstanceOf(Blob);
    expect((result as Blob).size).toBeGreaterThan(0);
  });
});
