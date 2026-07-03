// ---------------------------------------------------------------------------
// Encode options — `type` / `quality`, and the canEncode() probe
// ---------------------------------------------------------------------------
import { describe, it, expect, beforeAll } from "vitest";
import { commands } from "@vitest/browser/context";
import { thumbnail, canEncode } from "../src/index";

async function readFixture(filename: string, mime: string): Promise<File> {
  const base64 = await commands.readFile(`./fixtures/${filename}`, "base64");
  const raw = atob(base64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return new File([bytes], filename, { type: mime });
}

describe("encode options", () => {
  let photo: File;

  beforeAll(async () => {
    thumbnail.reset();
    photo = await readFixture("photo.jpg", "image/jpeg");
  });

  it("defaults to PNG", async () => {
    const blob = await thumbnail(photo, { width: 128 });
    expect(blob.type).toBe("image/png");
  });

  it("encodes WebP on request and beats PNG on size for photos", async () => {
    const png = await thumbnail(photo, { width: 512 });
    const webp = await thumbnail(photo, { width: 512, type: "image/webp", quality: 0.8 });

    expect(webp.type).toBe("image/webp");
    expect(webp.size).toBeLessThan(png.size);
  });

  it("encodes JPEG and quality drives the size", async () => {
    const low = await thumbnail(photo, { width: 512, type: "image/jpeg", quality: 0.3 });
    const high = await thumbnail(photo, { width: 512, type: "image/jpeg", quality: 0.95 });

    expect(low.type).toBe("image/jpeg");
    expect(high.type).toBe("image/jpeg");
    expect(low.size).toBeLessThan(high.size);
  });

  it("dataurl output respects the encoding type", async () => {
    const dataurl = await thumbnail(photo, {
      width: 64,
      format: "dataurl",
      type: "image/jpeg",
      quality: 0.8,
    });
    expect(dataurl.startsWith("data:image/jpeg")).toBe(true);
  });

  it("canEncode() reports engine support", () => {
    expect(canEncode("image/png")).toBe(true);
    expect(canEncode("image/jpeg")).toBe(true);
    // Chromium supports WebP encoding; WebKit builds may not — in the
    // Chromium test env this must be true.
    expect(canEncode("image/webp")).toBe(true);
    expect(canEncode("image/definitely-not-a-format")).toBe(false);
  });
});
