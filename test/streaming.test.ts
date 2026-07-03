// ---------------------------------------------------------------------------
// URL-streaming pipeline — head sniffing, renderFromURL, full-fetch fallback
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

let base: string;

beforeAll(async () => {
  thumbnail.reset();
  base = await commands.startFixtureServer();
});

async function readFixture(filename: string, mime: string): Promise<File> {
  const base64 = await commands.readFile(`./fixtures/${filename}`, "base64");
  const raw = atob(base64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return new File([bytes], filename, { type: mime });
}

function uniqueColourBuckets(canvas: HTMLCanvasElement): number {
  const ctx = canvas.getContext("2d")!;
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  const buckets = new Set<number>();
  for (let i = 0; i < data.length; i += 4) {
    buckets.add(((data[i] >> 4) << 8) | ((data[i + 1] >> 4) << 4) | (data[i + 2] >> 4));
  }
  return buckets.size;
}

describe("video", () => {
  it("Blob input → decodes a real poster frame", async () => {
    const file = await readFixture("clip.webm", "video/webm");
    const canvas = await thumbnail(file, { width: 128, format: "canvas" });

    expect(canvas.width).toBe(128);
    expect(canvas.height).toBeGreaterThan(0);
    // ffmpeg testsrc is colourful — a decoded frame has many colours
    expect(uniqueColourBuckets(canvas)).toBeGreaterThan(10);
  });

  it("URL input → streams via range requests, canvas stays readable", async () => {
    await commands.clearRequestLog();
    const canvas = await thumbnail(`${base}/fixtures/clip.webm`, {
      width: 128,
      format: "canvas",
    });

    expect(canvas.width).toBe(128);
    expect(uniqueColourBuckets(canvas)).toBeGreaterThan(10);
    // crossOrigin=anonymous + CORS headers → not tainted
    expect(() =>
      canvas.getContext("2d")!.getImageData(0, 0, 1, 1),
    ).not.toThrow();

    // the head sniff (and possibly the media element) used Range requests
    const log = await commands.getRequestLog();
    expect(
      log.some((l) => l.includes("/fixtures/clip.webm") && l.includes("range=")),
    ).toBe(true);
  });
});

describe("pdf", () => {
  it("URL input → pdf.js streams the document itself", async () => {
    await commands.clearRequestLog();
    const canvas = await thumbnail(`${base}/fixtures/document.pdf`, {
      width: 256,
      format: "canvas",
    });

    expect(canvas.width).toBe(256);
    expect(canvas.height).toBeGreaterThan(canvas.width); // portrait page
    expect(uniqueColourBuckets(canvas)).toBeGreaterThan(10);

    // thumbnail() itself must not have downloaded the file — only the head
    // sniff; every other document.pdf request comes from pdf.js's transport.
    const log = await commands.getRequestLog();
    const headSniffs = log.filter(
      (l) => l.startsWith("GET /fixtures/document.pdf") && l.includes("range=bytes=0-4095"),
    );
    expect(headSniffs.length).toBe(1);
  });
});

describe("image", () => {
  it("URL input → head sniff + exactly one full fetch", async () => {
    await commands.clearRequestLog();
    const canvas = await thumbnail(`${base}/fixtures/photo.jpg`, {
      width: 64,
      format: "canvas",
    });

    expect(canvas.width).toBe(64);
    expect(uniqueColourBuckets(canvas)).toBeGreaterThan(10);

    const gets = (await commands.getRequestLog()).filter(
      (l) => l.startsWith("GET ") && l.includes("/fixtures/photo.jpg"),
    );
    expect(gets.length).toBe(2);
    expect(gets[0]).toContain("range=");
    expect(gets[1]).not.toContain("range=");
  });
});

describe("unknown types", () => {
  it("URL input → fallback icon from the head alone (no download)", async () => {
    await commands.clearRequestLog();
    const blob = await thumbnail(`${base}/fixtures/mystery.xyz`, { width: 64 });

    expect(blob.type).toBe("image/png");
    expect(blob.size).toBeGreaterThan(0);

    const gets = (await commands.getRequestLog()).filter(
      (l) => l.startsWith("GET ") && l.includes("mystery.xyz"),
    );
    expect(gets.length).toBe(1);
    expect(gets[0]).toContain("range=");
  });
});

describe("servers without Range support", () => {
  it("object URL (Range ignored or 206) still renders", async () => {
    const file = await readFixture("photo.jpg", "image/jpeg");
    const url = URL.createObjectURL(file);
    try {
      const canvas = await thumbnail(url, { width: 64, format: "canvas" });
      expect(canvas.width).toBe(64);
      expect(uniqueColourBuckets(canvas)).toBeGreaterThan(10);
    } finally {
      URL.revokeObjectURL(url);
    }
  });
});
