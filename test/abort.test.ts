// ---------------------------------------------------------------------------
// Abort semantics — thumbnail() must reject promptly at every stage
// ---------------------------------------------------------------------------
import { describe, it, expect, afterEach } from "vitest";
import { thumbnail } from "../src/index";

// A blob no built-in renderer matches (not SVG text, no magic bytes, no MIME)
// → falls through to the custom renderers registered below.
const unmatched = () => new Blob(["plain text payload"]);

afterEach(() => {
  thumbnail.reset();
});

describe("thumbnail() — abort responsiveness", () => {
  it("rejects promptly even when the renderer ignores the signal", async () => {
    thumbnail.use({
      name: "hang",
      test: () => true,
      render: () => new Promise<never>(() => {}), // never settles
    });

    const controller = new AbortController();
    const promise = thumbnail(unmatched(), { signal: controller.signal });
    setTimeout(() => controller.abort(), 20);

    await expect(promise).rejects.toMatchObject({ name: "AbortError" });
  });

  it("rejects when aborted between render and encode", async () => {
    const controller = new AbortController();
    thumbnail.use({
      name: "aborts-mid-pipeline",
      test: () => true,
      render: async () => {
        controller.abort(); // fires while the pipeline is mid-flight
        const canvas = document.createElement("canvas");
        canvas.width = 4;
        canvas.height = 4;
        return canvas;
      },
    });

    await expect(
      thumbnail(unmatched(), { signal: controller.signal }),
    ).rejects.toMatchObject({ name: "AbortError" });
  });

  it("propagates a custom abort reason", async () => {
    const controller = new AbortController();
    controller.abort(new Error("hover moved on"));

    await expect(
      thumbnail(unmatched(), { signal: controller.signal }),
    ).rejects.toThrow("hover moved on");
  });

  it("resolves normally when the signal never fires", async () => {
    const controller = new AbortController();
    thumbnail.use({
      name: "ok",
      test: () => true,
      render: async () => {
        const canvas = document.createElement("canvas");
        canvas.width = 4;
        canvas.height = 4;
        return canvas;
      },
    });

    const blob = await thumbnail(unmatched(), { signal: controller.signal });
    expect(blob.type).toBe("image/png");
  });
});
