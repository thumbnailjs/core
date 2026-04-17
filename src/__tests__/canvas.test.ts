// ---------------------------------------------------------------------------
// canvas.test.ts — Canvas helpers tested with real browser Canvas2D
//
// Runs in Vitest Browser Mode (real Chromium). No mocks — every canvas
// operation touches actual pixels.
// ---------------------------------------------------------------------------

import { describe, it, expect } from "vitest";
import {
  fitDimensions,
  createCanvas,
  renderToCanvas,
  canvasToBlob,
  canvasToDataURL,
} from "../canvas";
import type { RenderOptions } from "../types";

// ---- helpers --------------------------------------------------------------

/** Create a solid-colour source canvas to use as input for renderToCanvas. */
function solidCanvas(
  w: number,
  h: number,
  colour = "#ff0000",
): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = colour;
  ctx.fillRect(0, 0, w, h);
  return c;
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

/** Build a RenderOptions object with sensible defaults. */
function opts(overrides: Partial<RenderOptions> = {}): RenderOptions {
  return {
    width: 256,
    height: undefined,
    fit: "contain",
    background: "transparent",
    ...overrides,
  };
}

// ===========================================================================
// fitDimensions — pure math, no DOM needed
// ===========================================================================

describe("fitDimensions()", () => {
  describe("contain", () => {
    it("wider source → constrained by width, centred vertically", () => {
      // 1600×900 (16:9) into 256×256
      const r = fitDimensions(1600, 900, 256, 256, "contain");
      expect(r.width).toBe(256);
      expect(r.height).toBe(256);
      expect(r.drawWidth).toBe(256);
      // 256 / (16/9) = 144
      expect(r.drawHeight).toBe(144);
      expect(r.offsetX).toBe(0);
      expect(r.offsetY).toBe(56); // (256 - 144) / 2
    });

    it("taller source → constrained by height, centred horizontally", () => {
      // 600×1200 (1:2) into 256×256
      const r = fitDimensions(600, 1200, 256, 256, "contain");
      expect(r.drawWidth).toBe(128); // 256 * (600/1200)
      expect(r.drawHeight).toBe(256);
      expect(r.offsetX).toBe(64); // (256 - 128) / 2
      expect(r.offsetY).toBe(0);
    });

    it("same aspect ratio → fills exactly, no offset", () => {
      const r = fitDimensions(800, 400, 200, 100, "contain");
      expect(r.drawWidth).toBe(200);
      expect(r.drawHeight).toBe(100);
      expect(r.offsetX).toBe(0);
      expect(r.offsetY).toBe(0);
    });

    it("square source into landscape target → pillarboxed", () => {
      // 500×500 into 400×200
      const r = fitDimensions(500, 500, 400, 200, "contain");
      expect(r.drawWidth).toBe(200);
      expect(r.drawHeight).toBe(200);
      expect(r.offsetX).toBe(100); // (400 - 200) / 2
      expect(r.offsetY).toBe(0);
    });

    it("square source into portrait target → letterboxed", () => {
      // 500×500 into 200×400
      const r = fitDimensions(500, 500, 200, 400, "contain");
      expect(r.drawWidth).toBe(200);
      expect(r.drawHeight).toBe(200);
      expect(r.offsetX).toBe(0);
      expect(r.offsetY).toBe(100); // (400 - 200) / 2
    });

    it("very wide panorama → thin strip, centred", () => {
      const r = fitDimensions(10000, 100, 200, 200, "contain");
      expect(r.drawWidth).toBe(200);
      expect(r.drawHeight).toBe(2); // 200 * (100/10000)
      expect(r.offsetX).toBe(0);
      expect(r.offsetY).toBe(99); // (200 - 2) / 2
    });
  });

  describe("cover", () => {
    it("wider source → constrained by height, overflows width", () => {
      // 1600×900 into 256×256
      const r = fitDimensions(1600, 900, 256, 256, "cover");
      expect(r.drawHeight).toBe(256);
      // 256 * (1600/900) ≈ 455
      expect(r.drawWidth).toBe(455);
      // Centred: (256 - 455) / 2 ≈ -100
      expect(r.offsetX).toBe(-100);
      expect(r.offsetY).toBe(0);
    });

    it("taller source → constrained by width, overflows height", () => {
      // 600×1200 into 256×256
      const r = fitDimensions(600, 1200, 256, 256, "cover");
      expect(r.drawWidth).toBe(256);
      expect(r.drawHeight).toBe(512); // 256 * (1200/600)
      expect(r.offsetX).toBe(0);
      expect(r.offsetY).toBe(-128); // (256 - 512) / 2
    });

    it("same aspect ratio → fills exactly", () => {
      const r = fitDimensions(800, 400, 200, 100, "cover");
      expect(r.drawWidth).toBe(200);
      expect(r.drawHeight).toBe(100);
      expect(r.offsetX).toBe(0);
      expect(r.offsetY).toBe(0);
    });

    it("square source into landscape target → overflows vertically", () => {
      // 500×500 into 400×200
      const r = fitDimensions(500, 500, 400, 200, "cover");
      expect(r.drawWidth).toBe(400);
      expect(r.drawHeight).toBe(400);
      expect(r.offsetX).toBe(0);
      expect(r.offsetY).toBe(-100); // (200 - 400) / 2
    });
  });

  describe("edge cases", () => {
    it("zero source dimensions → returns target dimensions, no offset", () => {
      const r = fitDimensions(0, 0, 256, 256, "contain");
      expect(r.width).toBe(256);
      expect(r.height).toBe(256);
      expect(r.drawWidth).toBe(256);
      expect(r.drawHeight).toBe(256);
      expect(r.offsetX).toBe(0);
      expect(r.offsetY).toBe(0);
    });

    it("zero source width → same fallback", () => {
      const r = fitDimensions(0, 100, 200, 200, "contain");
      expect(r.drawWidth).toBe(200);
      expect(r.drawHeight).toBe(200);
    });

    it("zero source height → same fallback", () => {
      const r = fitDimensions(100, 0, 200, 200, "cover");
      expect(r.drawWidth).toBe(200);
      expect(r.drawHeight).toBe(200);
    });

    it("1×1 source into 1×1 target → trivially exact", () => {
      const r = fitDimensions(1, 1, 1, 1, "contain");
      expect(r).toEqual({
        width: 1,
        height: 1,
        offsetX: 0,
        offsetY: 0,
        drawWidth: 1,
        drawHeight: 1,
      });
    });

    it("all results are rounded to integers", () => {
      // 3:2 into 100×100 → drawHeight = 100/(3/2) = 66.666…
      const r = fitDimensions(300, 200, 100, 100, "contain");
      expect(Number.isInteger(r.drawWidth)).toBe(true);
      expect(Number.isInteger(r.drawHeight)).toBe(true);
      expect(Number.isInteger(r.offsetX)).toBe(true);
      expect(Number.isInteger(r.offsetY)).toBe(true);
    });
  });
});

// ===========================================================================
// createCanvas — real DOM canvas creation
// ===========================================================================

describe("createCanvas()", () => {
  it("returns an HTMLCanvasElement", () => {
    const canvas = createCanvas(100, 50);
    expect(canvas).toBeInstanceOf(HTMLCanvasElement);
  });

  it("has the requested width and height", () => {
    const canvas = createCanvas(320, 240);
    expect(canvas.width).toBe(320);
    expect(canvas.height).toBe(240);
  });

  it("supports a 2d context", () => {
    const canvas = createCanvas(10, 10);
    const ctx = canvas.getContext("2d");
    expect(ctx).not.toBeNull();
  });

  it("starts transparent (alpha = 0)", () => {
    const canvas = createCanvas(10, 10);
    const [, , , a] = pixelAt(canvas, 0, 0);
    expect(a).toBe(0);
  });
});

// ===========================================================================
// renderToCanvas — real drawing with real pixels
// ===========================================================================

describe("renderToCanvas()", () => {
  it("draws source onto a new canvas with correct dimensions", () => {
    const src = solidCanvas(800, 600, "#ff0000");
    const result = renderToCanvas(
      src,
      opts({ width: 200, height: 150 }),
      800,
      600,
    );
    expect(result.width).toBe(200);
    expect(result.height).toBe(150);
  });

  it("auto-computes height from source aspect ratio when height is undefined", () => {
    const src = solidCanvas(1600, 900);
    const result = renderToCanvas(
      src,
      opts({ width: 256, height: undefined }),
      1600,
      900,
    );
    expect(result.width).toBe(256);
    // 256 * (900/1600) = 144
    expect(result.height).toBe(144);
  });

  it("falls back to square when height is undefined and source is 0×0", () => {
    // Edge case: zero-dimension source with auto-height
    const src = solidCanvas(1, 1); // need a valid source for drawImage
    const result = renderToCanvas(
      src,
      opts({ width: 128, height: undefined }),
      0,
      0,
    );
    expect(result.width).toBe(128);
    expect(result.height).toBe(128);
  });

  it("actually paints pixels (not blank)", () => {
    const src = solidCanvas(100, 100, "#ff0000");
    const result = renderToCanvas(
      src,
      opts({ width: 100, height: 100 }),
      100,
      100,
    );
    const [r, g, b, a] = pixelAt(result, 50, 50);
    expect(r).toBe(255);
    expect(g).toBe(0);
    expect(b).toBe(0);
    expect(a).toBe(255);
  });

  it("fills background when non-transparent colour is set", () => {
    // Use a small source drawn into a larger target with 'contain'
    // so there are letterboxed regions that should show the background.
    const src = solidCanvas(100, 100, "#00ff00"); // green square
    const result = renderToCanvas(
      src,
      opts({ width: 200, height: 100, background: "#0000ff", fit: "contain" }),
      100,
      100,
    );
    // The source is square (100×100) fitted 'contain' into 200×100
    // → drawn at 100×100, centred → 50px blue bars on left and right
    const [lr, lg, lb, la] = pixelAt(result, 5, 50); // left letterbox
    expect(lr).toBe(0);
    expect(lg).toBe(0);
    expect(lb).toBe(255);
    expect(la).toBe(255);

    // Centre should be green (#00ff00 → RGB 0, 255, 0)
    const [cr, cg, cb] = pixelAt(result, 100, 50);
    expect(cr).toBe(0);
    expect(cg).toBe(255);
    expect(cb).toBe(0);
  });

  it("does not fill background when set to 'transparent'", () => {
    // Contain a narrow source in a wide target → letterbox areas should be transparent
    const src = solidCanvas(50, 100, "#ff0000");
    const result = renderToCanvas(
      src,
      opts({
        width: 200,
        height: 100,
        background: "transparent",
        fit: "contain",
      }),
      50,
      100,
    );
    // Far left should be transparent (not drawn)
    const [, , , a] = pixelAt(result, 0, 0);
    expect(a).toBe(0);
  });

  it("contain mode preserves entire source (no cropping)", () => {
    // 200×100 (2:1) source → 100×100 target
    // Contain: draw 100×50, centred vertically → 25px empty top/bottom
    const src = solidCanvas(200, 100, "#ff0000");
    const result = renderToCanvas(
      src,
      opts({ width: 100, height: 100, fit: "contain" }),
      200,
      100,
    );

    // Top-left corner should be empty (transparent or background)
    const [, , , aTop] = pixelAt(result, 50, 5);
    expect(aTop).toBe(0);

    // Centre should be red
    const [r, , , aCenter] = pixelAt(result, 50, 50);
    expect(r).toBe(255);
    expect(aCenter).toBe(255);
  });

  it("cover mode fills entire target (source may be cropped)", () => {
    // 200×100 (2:1) source → 100×100 target with cover
    // Cover: draw 200×100 scaled to cover 100×100 → 100×50 would not cover,
    // so scale by height: 100×100, overflow width to 200×100… wait.
    // Actually: srcAspect=2, tgtAspect=1, cover: srcAspect > tgtAspect →
    //   drawHeight=100, drawWidth=100*(200/100)=200
    //   offset: (100-200)/2 = -50
    // So the drawn image overflows left/right but fills the target vertically.
    const src = solidCanvas(200, 100, "#ff0000");
    const result = renderToCanvas(
      src,
      opts({ width: 100, height: 100, fit: "cover" }),
      200,
      100,
    );

    // Every corner should have pixels (fully covered)
    for (const [x, y] of [
      [5, 5],
      [95, 5],
      [5, 95],
      [95, 95],
    ] as const) {
      const [, , , a] = pixelAt(result, x, y);
      expect(a).toBe(255);
    }
  });

  it("works with an ImageBitmap source", async () => {
    const src = solidCanvas(64, 64, "#0000ff");
    const bitmap = await createImageBitmap(src);
    const result = renderToCanvas(
      bitmap,
      opts({ width: 32, height: 32 }),
      bitmap.width,
      bitmap.height,
    );
    bitmap.close();

    expect(result.width).toBe(32);
    expect(result.height).toBe(32);

    const [r, g, b, a] = pixelAt(result, 16, 16);
    expect(r).toBe(0);
    expect(g).toBe(0);
    expect(b).toBe(255);
    expect(a).toBe(255);
  });

  it("handles very small target (1×1)", () => {
    const src = solidCanvas(1000, 1000, "#ff0000");
    const result = renderToCanvas(
      src,
      opts({ width: 1, height: 1 }),
      1000,
      1000,
    );
    expect(result.width).toBe(1);
    expect(result.height).toBe(1);
    const [r, , , a] = pixelAt(result, 0, 0);
    expect(r).toBe(255);
    expect(a).toBe(255);
  });
});

// ===========================================================================
// canvasToBlob — real PNG encoding
// ===========================================================================

describe("canvasToBlob()", () => {
  it("resolves with a Blob", async () => {
    const canvas = solidCanvas(50, 50, "#ff0000");
    const blob = await canvasToBlob(canvas);
    expect(blob).toBeInstanceOf(Blob);
  });

  it("returns a PNG blob", async () => {
    const canvas = solidCanvas(50, 50);
    const blob = await canvasToBlob(canvas);
    expect(blob.type).toBe("image/png");
  });

  it("blob size is non-zero", async () => {
    const canvas = solidCanvas(50, 50, "#00ff00");
    const blob = await canvasToBlob(canvas);
    expect(blob.size).toBeGreaterThan(0);
  });

  it("blob is decodable back to pixels", async () => {
    const canvas = solidCanvas(10, 10, "#ff0000");
    const blob = await canvasToBlob(canvas);

    // Decode the blob back and verify pixels
    const bitmap = await createImageBitmap(blob);
    expect(bitmap.width).toBe(10);
    expect(bitmap.height).toBe(10);

    // Paint bitmap onto a canvas and sample
    const verify = document.createElement("canvas");
    verify.width = 10;
    verify.height = 10;
    verify.getContext("2d")!.drawImage(bitmap, 0, 0);
    bitmap.close();

    const [r, g, b, a] = pixelAt(verify, 5, 5);
    expect(r).toBe(255);
    expect(g).toBe(0);
    expect(b).toBe(0);
    expect(a).toBe(255);
  });

  it("preserves transparency", async () => {
    // A canvas that's never been drawn on is fully transparent
    const canvas = createCanvas(10, 10);
    const blob = await canvasToBlob(canvas);

    const bitmap = await createImageBitmap(blob);
    const verify = document.createElement("canvas");
    verify.width = 10;
    verify.height = 10;
    verify.getContext("2d")!.drawImage(bitmap, 0, 0);
    bitmap.close();

    const [, , , a] = pixelAt(verify, 5, 5);
    expect(a).toBe(0);
  });
});

// ===========================================================================
// canvasToDataURL — real base64 encoding
// ===========================================================================

describe("canvasToDataURL()", () => {
  it("returns a string", () => {
    const canvas = solidCanvas(10, 10);
    const url = canvasToDataURL(canvas);
    expect(typeof url).toBe("string");
  });

  it("starts with the PNG data URL prefix", () => {
    const canvas = solidCanvas(10, 10);
    const url = canvasToDataURL(canvas);
    expect(url.startsWith("data:image/png;base64,")).toBe(true);
  });

  it("contains non-trivial base64 data", () => {
    const canvas = solidCanvas(10, 10, "#ff0000");
    const url = canvasToDataURL(canvas);
    const base64Part = url.split(",")[1];
    expect(base64Part.length).toBeGreaterThan(10);
  });

  it("data URL is loadable as an image", async () => {
    const canvas = solidCanvas(20, 20, "#0000ff");
    const url = canvasToDataURL(canvas);

    // Load the data URL into an Image, draw to canvas, verify pixels
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Failed to load data URL"));
      img.src = url;
    });

    expect(img.naturalWidth).toBe(20);
    expect(img.naturalHeight).toBe(20);

    const verify = document.createElement("canvas");
    verify.width = 20;
    verify.height = 20;
    verify.getContext("2d")!.drawImage(img, 0, 0);

    const [r, g, b, a] = pixelAt(verify, 10, 10);
    expect(r).toBe(0);
    expect(g).toBe(0);
    expect(b).toBe(255);
    expect(a).toBe(255);
  });
});
