// ---------------------------------------------------------------------------
// Text renderer — real content previews, signal-gating, encodings, streaming
// ---------------------------------------------------------------------------
import { describe, it, expect, beforeAll } from "vitest";
import { commands } from "@vitest/browser/context";
import { thumbnail } from "../src/index";

declare module "@vitest/browser/context" {
  interface BrowserCommands {
    startFixtureServer: () => Promise<string>;
    getRequestLog: () => Promise<string[]>;
    clearRequestLog: () => Promise<void>;
  }
}

beforeAll(() => {
  thumbnail.reset();
});

function fileOf(bytes: Uint8Array | string, name: string, type = ""): File {
  const data = typeof bytes === "string" ? new TextEncoder().encode(bytes) : bytes;
  return new File([data], name, { type });
}

// A canvas that has both bright paper and dark ink → text was actually drawn.
function hasInk(canvas: HTMLCanvasElement): boolean {
  const ctx = canvas.getContext("2d")!;
  const d = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  let light = 0;
  let dark = 0;
  for (let i = 0; i < d.length; i += 4) {
    const lum = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
    if (lum > 200) light++;
    else if (lum < 120) dark++;
  }
  return light > 0 && dark > 0;
}

const SAMPLE =
  "first line of the file\nsecond line here\nthird line with words\n" +
  "fourth line 1234567890\nfifth line the end\n";

describe("text renderer", () => {
  it("draws real content for a .txt (portrait page, has ink)", async () => {
    const canvas = await thumbnail(fileOf(SAMPLE, "notes.txt", "text/plain"), {
      width: 200,
      format: "canvas",
    });
    expect(canvas.width).toBe(200);
    expect(canvas.height).toBeGreaterThan(canvas.width); // portrait "page"
    expect(hasInk(canvas)).toBe(true);
  });

  it("honours an explicit width and height", async () => {
    const canvas = await thumbnail(fileOf(SAMPLE, "notes.txt", "text/plain"), {
      width: 128,
      height: 128,
      format: "canvas",
    });
    expect(canvas.width).toBe(128);
    expect(canvas.height).toBe(128);
  });

  it("catches csv/json/markdown by extension", async () => {
    for (const [name, type] of [
      ["data.csv", "text/csv"],
      ["data.json", "application/json"],
      ["readme.md", ""],
    ] as const) {
      const canvas = await thumbnail(fileOf(SAMPLE, name, type), {
        width: 120,
        format: "canvas",
      });
      expect(canvas.height, name).toBeGreaterThan(canvas.width);
      expect(hasInk(canvas), name).toBe(true);
    }
  });

  // ---- signal-gating: only text signals get the text renderer -------------

  it("a binary file wearing a .txt name falls through to the icon", async () => {
    const bin = new Uint8Array([0x00, 0x01, 0x02, 0x00, 0xff, 0x10, 0x00]);
    const canvas = await thumbnail(fileOf(bin, "fake.txt", "text/plain"), {
      width: 128,
      format: "canvas",
    });
    // Fallback icon is square (auto height); the text page is portrait.
    expect(canvas.height).toBe(canvas.width);
  });

  it("text content with an unknown extension stays a fallback icon", async () => {
    const canvas = await thumbnail(fileOf("plain text, unknown ext", "mystery.xyz", ""), {
      width: 128,
      format: "canvas",
    });
    expect(canvas.height).toBe(canvas.width); // square fallback, not a text page
  });

  it("empty file is not treated as text", async () => {
    const canvas = await thumbnail(fileOf(new Uint8Array(0), "empty.txt", "text/plain"), {
      width: 128,
      format: "canvas",
    });
    expect(canvas.height).toBe(canvas.width); // fallback icon
  });

  // ---- encodings ----------------------------------------------------------

  it("renders UTF-8 with a BOM", async () => {
    const bom = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode(SAMPLE)]);
    const canvas = await thumbnail(fileOf(bom, "bom.txt", "text/plain"), {
      width: 160,
      format: "canvas",
    });
    expect(hasInk(canvas)).toBe(true);
  });

  it("renders UTF-16LE with a BOM", async () => {
    const src = "hello utf sixteen\nsecond line\n";
    const buf = new Uint8Array(2 + src.length * 2);
    buf[0] = 0xff;
    buf[1] = 0xfe;
    for (let i = 0; i < src.length; i++) buf[2 + i * 2] = src.charCodeAt(i);
    const canvas = await thumbnail(fileOf(buf, "utf16.txt", "text/plain"), {
      width: 160,
      format: "canvas",
    });
    expect(hasInk(canvas)).toBe(true);
  });

  it("renders legacy single-byte (Windows-1252) text", async () => {
    // 0xE9 = 'é' in Windows-1252, invalid as standalone UTF-8
    const bytes = new Uint8Array([...new TextEncoder().encode("caf"), 0xe9, 0x0a, ...new TextEncoder().encode("line two\n")]);
    const canvas = await thumbnail(fileOf(bytes, "latin.txt", "text/plain"), {
      width: 160,
      format: "canvas",
    });
    expect(hasInk(canvas)).toBe(true);
  });

  // ---- streaming: URL input range-fetches only the head -------------------

  it("URL input renders and uses a range request (head only)", async () => {
    const base = await commands.startFixtureServer();
    await commands.clearRequestLog();
    const canvas = await thumbnail(`${base}/fixtures/sample.txt`, {
      width: 200,
      format: "canvas",
    });
    expect(hasInk(canvas)).toBe(true);

    const log = await commands.getRequestLog();
    expect(
      log.some((l) => l.includes("/fixtures/sample.txt") && l.includes("range=")),
    ).toBe(true);
  });
});
