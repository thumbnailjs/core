// ---------------------------------------------------------------------------
// Tier 2: native unzip, ODF/EPUB detection, embedded-thumbnail extraction,
// and the null-pass (renderer-declines) contract.
//
// All ZIP/ODF fixtures are built in-memory here — no committed binaries, so
// nothing carries stray metadata.
// ---------------------------------------------------------------------------
import { describe, it, expect, beforeEach } from "vitest";
import { thumbnail } from "../src/index";
import { unzipEntry } from "../src/unzip";
import { detect } from "../src/detect";

// ---- minimal ZIP builder (STORED + DEFLATE) -------------------------------

const u16 = (n: number) => [n & 0xff, (n >>> 8) & 0xff];
const u32 = (n: number) => [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff];

interface Entry {
  name: string;
  data: Uint8Array;
  method?: 0 | 8;
  comp?: Uint8Array; // required for method 8 (raw-deflate bytes)
}

function buildZip(entries: Entry[]): Uint8Array {
  const local: number[] = [];
  const central: number[] = [];
  for (const e of entries) {
    const method = e.method ?? 0;
    const comp = method === 0 ? e.data : e.comp!;
    const name = Array.from(new TextEncoder().encode(e.name));
    const offset = local.length;
    local.push(
      ...u32(0x04034b50), ...u16(20), ...u16(0), ...u16(method),
      ...u16(0), ...u16(0), ...u32(0),
      ...u32(comp.length), ...u32(e.data.length),
      ...u16(name.length), ...u16(0),
      ...name, ...comp,
    );
    central.push(
      ...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0), ...u16(method),
      ...u16(0), ...u16(0), ...u32(0),
      ...u32(comp.length), ...u32(e.data.length),
      ...u16(name.length), ...u16(0), ...u16(0),
      ...u16(0), ...u16(0), ...u32(0),
      ...u32(offset),
      ...name,
    );
  }
  const cdOffset = local.length;
  const eocd = [
    ...u32(0x06054b50), ...u16(0), ...u16(0),
    ...u16(entries.length), ...u16(entries.length),
    ...u32(central.length), ...u32(cdOffset),
    ...u16(0),
  ];
  return new Uint8Array([...local, ...central, ...eocd]);
}

async function deflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const s = new Blob([data]).stream().pipeThrough(new CompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(s).arrayBuffer());
}

async function makePng(w: number, h: number): Promise<Uint8Array> {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  for (let x = 0; x < w; x++) {
    ctx.fillStyle = `hsl(${Math.round((x / w) * 360)}, 70%, 50%)`;
    ctx.fillRect(x, 0, 1, h);
  }
  const blob = await new Promise<Blob>((res) => c.toBlob((b) => res(b!), "image/png"));
  return new Uint8Array(await blob.arrayBuffer());
}

function uniqueColourBuckets(canvas: HTMLCanvasElement): number {
  const d = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data;
  const s = new Set<number>();
  for (let i = 0; i < d.length; i += 4) {
    s.add(((d[i] >> 4) << 8) | ((d[i + 1] >> 4) << 4) | (d[i + 2] >> 4));
  }
  return s.size;
}

const enc = (s: string) => new TextEncoder().encode(s);
const ODT_MIME = "application/vnd.oasis.opendocument.text";

beforeEach(() => thumbnail.reset());

// ---------------------------------------------------------------------------

describe("unzip", () => {
  it("extracts a STORED entry byte-for-byte", async () => {
    const payload = enc("stored entry contents");
    const zip = buildZip([{ name: "a.txt", data: payload }]);
    const out = await unzipEntry(new Blob([zip]), "a.txt");
    expect(out).not.toBeNull();
    expect(Array.from(out!)).toEqual(Array.from(payload));
  });

  it("inflates a DEFLATE entry", async () => {
    const payload = enc("deflate me ".repeat(50));
    const comp = await deflateRaw(payload);
    const zip = buildZip([{ name: "b.txt", data: payload, method: 8, comp }]);
    const out = await unzipEntry(new Blob([zip]), "b.txt");
    expect(out).not.toBeNull();
    expect(new TextDecoder().decode(out!)).toBe(new TextDecoder().decode(payload));
  });

  it("returns null for a missing entry", async () => {
    const zip = buildZip([{ name: "a.txt", data: enc("x") }]);
    expect(await unzipEntry(new Blob([zip]), "nope.txt")).toBeNull();
  });

  it("returns null for a non-ZIP blob", async () => {
    expect(await unzipEntry(new Blob([enc("not a zip")]), "a")).toBeNull();
  });
});

describe("ODF detection (mimetype magic)", () => {
  const cases: [string, string, string][] = [
    [ODT_MIME, "odt", "document"],
    ["application/vnd.oasis.opendocument.spreadsheet", "ods", "spreadsheet"],
    ["application/vnd.oasis.opendocument.presentation", "odp", "presentation"],
    ["application/epub+zip", "epub", "document"],
  ];
  for (const [mime, ext, family] of cases) {
    it(`detects ${ext} from the mimetype entry (no name/MIME hint)`, async () => {
      // Plain Blob: no filename, no MIME — detection must come from the entry.
      const zip = buildZip([{ name: "mimetype", data: enc(mime) }]);
      const sig = await detect(new Blob([zip]));
      expect(sig.ext).toBe(ext);
      expect(sig.family).toBe(family);
    });
  }
});

describe("ODF thumbnail extraction", () => {
  it("draws the embedded Thumbnails/thumbnail.png from an odt", async () => {
    const png = await makePng(80, 100); // portrait, colourful
    const zip = buildZip([
      { name: "mimetype", data: enc(ODT_MIME) },
      { name: "Thumbnails/thumbnail.png", data: png },
    ]);
    const canvas = await thumbnail(new Blob([zip]), { width: 160, format: "canvas" });
    expect(canvas.width).toBe(160);
    expect(canvas.height).toBeGreaterThan(canvas.width); // portrait thumbnail, not a square icon
    expect(uniqueColourBuckets(canvas)).toBeGreaterThan(10); // real image content
  });

  it("extracts a DEFLATE-compressed thumbnail too", async () => {
    const png = await makePng(100, 60);
    const comp = await deflateRaw(png);
    const zip = buildZip([
      { name: "mimetype", data: enc(ODT_MIME) },
      { name: "Thumbnails/thumbnail.png", data: png, method: 8, comp },
    ]);
    const canvas = await thumbnail(new Blob([zip]), { width: 120, format: "canvas" });
    expect(uniqueColourBuckets(canvas)).toBeGreaterThan(10);
  });

  it("extracts docProps/thumbnail from an OOXML docx", async () => {
    const png = await makePng(90, 90);
    const zip = buildZip([
      { name: "[Content_Types].xml", data: enc("<Types/>") },
      { name: "docProps/thumbnail.png", data: png },
    ]);
    // No mimetype entry → classified as docx via the filename.
    const file = new File([zip], "report.docx", {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
    const canvas = await thumbnail(file, { width: 128, format: "canvas" });
    expect(uniqueColourBuckets(canvas)).toBeGreaterThan(10);
  });
});

describe("null-pass contract", () => {
  it("an ODF with no embedded thumbnail falls through to the type icon", async () => {
    const zip = buildZip([
      { name: "mimetype", data: enc(ODT_MIME) },
      { name: "content.xml", data: enc("<document/>") },
    ]);
    const canvas = await thumbnail(new Blob([zip]), { width: 128, format: "canvas" });
    // Fallback icon is square (auto height); a real thumbnail would not be.
    expect(canvas.width).toBe(128);
    expect(canvas.height).toBe(128);
  });

  it("a custom renderer returning null falls through to the fallback", async () => {
    let called = false;
    thumbnail.use({
      name: "decliner",
      test: () => true,
      render: async () => {
        called = true;
        return null;
      },
    });
    const canvas = await thumbnail(new Blob([enc("plain unmatched bytes")]), {
      width: 64,
      format: "canvas",
    });
    expect(called).toBe(true);
    expect(canvas.width).toBe(64);
    expect(canvas.height).toBe(64); // square fallback icon
  });
});
