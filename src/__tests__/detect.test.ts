// ---------------------------------------------------------------------------
// detect.test.ts — Magic-byte detection tests
//
// Pure logic: only uses Blob, File, Uint8Array — no DOM mocks needed.
// Runs identically in Node and in Vitest Browser Mode.
// ---------------------------------------------------------------------------

import { describe, it, expect } from "vitest";
import { detect, familyColors } from "../detect";
import type { FileSignature } from "../detect";

// ---- helpers --------------------------------------------------------------

/** Build a Blob from raw bytes. */
function blob(bytes: number[], type = ""): Blob {
  return new Blob([new Uint8Array(bytes)], { type });
}

/** Build a File from raw bytes with a given name and optional MIME. */
function file(bytes: number[], name: string, type = ""): File {
  return new File([new Uint8Array(bytes)], name, { type });
}

/** ASCII string → byte array. */
function ascii(s: string): number[] {
  return Array.from(s, (c) => c.charCodeAt(0));
}

/** Build a text Blob (for SVG tests). */
function textBlob(text: string, type = ""): Blob {
  return new Blob([text], { type });
}

// ---- image formats --------------------------------------------------------

describe("detect()", () => {
  describe("images", () => {
    it("detects PNG from magic bytes", async () => {
      const sig = await detect(
        blob([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      );
      expect(sig.mime).toBe("image/png");
      expect(sig.ext).toBe("png");
      expect(sig.family).toBe("image");
    });

    it("detects JPEG from magic bytes", async () => {
      const sig = await detect(blob([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]));
      expect(sig.mime).toBe("image/jpeg");
      expect(sig.ext).toBe("jpg");
      expect(sig.family).toBe("image");
    });

    it("detects JPEG with EXIF marker", async () => {
      const sig = await detect(blob([0xff, 0xd8, 0xff, 0xe1]));
      expect(sig.mime).toBe("image/jpeg");
      expect(sig.family).toBe("image");
    });

    it("detects GIF from magic bytes", async () => {
      const sig = await detect(blob([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]));
      expect(sig.mime).toBe("image/gif");
      expect(sig.ext).toBe("gif");
      expect(sig.family).toBe("image");
    });

    it("detects WebP (RIFF....WEBP)", async () => {
      //                  R     I     F     F    (size)          W     E     B     P
      const bytes = [
        0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
      ];
      const sig = await detect(blob(bytes));
      expect(sig.mime).toBe("image/webp");
      expect(sig.ext).toBe("webp");
      expect(sig.family).toBe("image");
    });

    it("detects BMP from magic bytes", async () => {
      const sig = await detect(blob([0x42, 0x4d, 0x00, 0x00, 0x00, 0x00]));
      expect(sig.mime).toBe("image/bmp");
      expect(sig.ext).toBe("bmp");
      expect(sig.family).toBe("image");
    });

    it("detects TIFF little-endian", async () => {
      const sig = await detect(blob([0x49, 0x49, 0x2a, 0x00]));
      expect(sig.mime).toBe("image/tiff");
      expect(sig.ext).toBe("tiff");
      expect(sig.family).toBe("image");
    });

    it("detects TIFF big-endian", async () => {
      const sig = await detect(blob([0x4d, 0x4d, 0x00, 0x2a]));
      expect(sig.mime).toBe("image/tiff");
      expect(sig.ext).toBe("tiff");
      expect(sig.family).toBe("image");
    });

    it("detects AVIF (ftyp + avif brand)", async () => {
      // Box size (32) + 'ftyp' + 'avif'
      const bytes = [
        0x00,
        0x00,
        0x00,
        0x20,
        ...ascii("ftyp"),
        ...ascii("avif"),
      ];
      const sig = await detect(blob(bytes));
      expect(sig.mime).toBe("image/avif");
      expect(sig.ext).toBe("avif");
      expect(sig.family).toBe("image");
    });

    it("detects AVIF with avis brand", async () => {
      const bytes = [
        0x00,
        0x00,
        0x00,
        0x20,
        ...ascii("ftyp"),
        ...ascii("avis"),
      ];
      const sig = await detect(blob(bytes));
      expect(sig.mime).toBe("image/avif");
      expect(sig.ext).toBe("avif");
      expect(sig.family).toBe("image");
    });

    it("detects SVG starting with <svg", async () => {
      const sig = await detect(
        textBlob(
          '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"></svg>',
        ),
      );
      expect(sig.mime).toBe("image/svg+xml");
      expect(sig.ext).toBe("svg");
      expect(sig.family).toBe("image");
    });

    it("detects SVG starting with <?xml then <svg", async () => {
      const sig = await detect(
        textBlob(
          '<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"></svg>',
        ),
      );
      expect(sig.mime).toBe("image/svg+xml");
      expect(sig.ext).toBe("svg");
      expect(sig.family).toBe("image");
    });

    it("detects SVG with leading whitespace", async () => {
      const sig = await detect(textBlob("  \n  <svg></svg>"));
      expect(sig.mime).toBe("image/svg+xml");
      expect(sig.ext).toBe("svg");
      expect(sig.family).toBe("image");
    });
  });

  // ---- video formats ------------------------------------------------------

  describe("video", () => {
    it("detects MP4 (ftyp + isom brand)", async () => {
      const bytes = [
        0x00,
        0x00,
        0x00,
        0x20,
        ...ascii("ftyp"),
        ...ascii("isom"),
      ];
      const sig = await detect(blob(bytes));
      expect(sig.mime).toBe("video/mp4");
      expect(sig.ext).toBe("mp4");
      expect(sig.family).toBe("video");
    });

    it("detects MP4 with mp41 brand", async () => {
      const bytes = [
        0x00,
        0x00,
        0x00,
        0x20,
        ...ascii("ftyp"),
        ...ascii("mp41"),
      ];
      const sig = await detect(blob(bytes));
      expect(sig.mime).toBe("video/mp4");
      expect(sig.family).toBe("video");
    });

    it("detects MP4 with M4V brand", async () => {
      const bytes = [
        0x00,
        0x00,
        0x00,
        0x20,
        ...ascii("ftyp"),
        ...ascii("M4V "),
      ];
      const sig = await detect(blob(bytes));
      expect(sig.mime).toBe("video/mp4");
      expect(sig.family).toBe("video");
    });

    it("detects MOV (ftyp + qt brand)", async () => {
      const bytes = [
        0x00,
        0x00,
        0x00,
        0x20,
        ...ascii("ftyp"),
        ...ascii("qt  "),
      ];
      const sig = await detect(blob(bytes));
      expect(sig.mime).toBe("video/quicktime");
      expect(sig.ext).toBe("mov");
      expect(sig.family).toBe("video");
    });

    it("detects MOV via moov atom", async () => {
      // 4 bytes size + 'moov'
      const bytes = [0x00, 0x00, 0x00, 0x08, ...ascii("moov")];
      const sig = await detect(blob(bytes));
      expect(sig.mime).toBe("video/quicktime");
      expect(sig.ext).toBe("mov");
      expect(sig.family).toBe("video");
    });

    it("detects MOV via mdat atom", async () => {
      const bytes = [0x00, 0x00, 0x00, 0x08, ...ascii("mdat")];
      const sig = await detect(blob(bytes));
      expect(sig.mime).toBe("video/quicktime");
      expect(sig.ext).toBe("mov");
      expect(sig.family).toBe("video");
    });

    it("detects WebM from magic bytes", async () => {
      const sig = await detect(blob([0x1a, 0x45, 0xdf, 0xa3]));
      expect(sig.mime).toBe("video/webm");
      expect(sig.ext).toBe("webm");
      expect(sig.family).toBe("video");
    });

    it("detects AVI (RIFF....AVI )", async () => {
      const bytes = [
        0x52,
        0x49,
        0x46,
        0x46, // RIFF
        0x00,
        0x00,
        0x00,
        0x00, // file size (don't care)
        0x41,
        0x56,
        0x49,
        0x20, // AVI<space>
      ];
      const sig = await detect(blob(bytes));
      expect(sig.mime).toBe("video/x-msvideo");
      expect(sig.ext).toBe("avi");
      expect(sig.family).toBe("video");
    });
  });

  // ---- document / office formats ------------------------------------------

  describe("documents", () => {
    it("detects PDF from magic bytes", async () => {
      const sig = await detect(
        blob([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]),
      );
      expect(sig.mime).toBe("application/pdf");
      expect(sig.ext).toBe("pdf");
      expect(sig.family).toBe("document");
    });

    it("detects PDF with only %PDF prefix", async () => {
      const sig = await detect(blob([0x25, 0x50, 0x44, 0x46]));
      expect(sig.mime).toBe("application/pdf");
      expect(sig.family).toBe("document");
    });

    it("classifies ZIP + .docx name as document", async () => {
      const f = file([0x50, 0x4b, 0x03, 0x04, 0x00], "report.docx");
      const sig = await detect(f);
      expect(sig.ext).toBe("docx");
      expect(sig.family).toBe("document");
    });

    it("classifies ZIP + .xlsx name as spreadsheet", async () => {
      const f = file([0x50, 0x4b, 0x03, 0x04, 0x00], "budget.xlsx");
      const sig = await detect(f);
      expect(sig.ext).toBe("xlsx");
      expect(sig.family).toBe("spreadsheet");
    });

    it("classifies ZIP + .pptx name as presentation", async () => {
      const f = file([0x50, 0x4b, 0x03, 0x04, 0x00], "slides.pptx");
      const sig = await detect(f);
      expect(sig.ext).toBe("pptx");
      expect(sig.family).toBe("presentation");
    });

    it("classifies ZIP + word MIME type as document", async () => {
      const b = blob(
        [0x50, 0x4b, 0x03, 0x04, 0x00],
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      );
      const sig = await detect(b);
      expect(sig.family).toBe("document");
    });

    it("classifies ZIP + spreadsheet MIME type", async () => {
      const b = blob(
        [0x50, 0x4b, 0x03, 0x04, 0x00],
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      const sig = await detect(b);
      expect(sig.family).toBe("spreadsheet");
    });

    it("classifies ZIP + presentation MIME type", async () => {
      const b = blob(
        [0x50, 0x4b, 0x03, 0x04, 0x00],
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      );
      const sig = await detect(b);
      expect(sig.family).toBe("presentation");
    });

    it("classifies bare ZIP header without office hints as unknown", async () => {
      const sig = await detect(blob([0x50, 0x4b, 0x03, 0x04, 0x00]));
      expect(sig.mime).toBe("application/zip");
      expect(sig.ext).toBe("zip");
      expect(sig.family).toBe("unknown");
    });
  });

  // ---- fallback chain -----------------------------------------------------

  describe("fallback chain", () => {
    it("falls back to blob.type when magic bytes are unrecognised", async () => {
      const b = blob([0x00, 0x00, 0x00, 0x00], "image/png");
      const sig = await detect(b);
      expect(sig.mime).toBe("image/png");
      expect(sig.family).toBe("image");
    });

    it("falls back to File.name extension when blob.type is empty", async () => {
      const f = file([0x00, 0x00, 0x00, 0x00], "photo.jpg", "");
      const sig = await detect(f);
      expect(sig.mime).toBe("image/jpeg");
      expect(sig.ext).toBe("jpg");
      expect(sig.family).toBe("image");
    });

    it("falls back to File.name for video extension", async () => {
      const f = file([0x00, 0x00, 0x00, 0x00], "clip.mp4", "");
      const sig = await detect(f);
      expect(sig.mime).toBe("video/mp4");
      expect(sig.ext).toBe("mp4");
      expect(sig.family).toBe("video");
    });

    it("falls back to File.name for pdf extension", async () => {
      const f = file([0x00, 0x00, 0x00, 0x00], "doc.pdf", "");
      const sig = await detect(f);
      expect(sig.mime).toBe("application/pdf");
      expect(sig.ext).toBe("pdf");
      expect(sig.family).toBe("document");
    });

    it("uses unknown MIME type with inferred family for image/*", async () => {
      const b = blob([0x00, 0x00, 0x00, 0x00], "image/x-custom");
      const sig = await detect(b);
      expect(sig.mime).toBe("image/x-custom");
      expect(sig.family).toBe("image");
    });

    it("uses unknown MIME type with inferred family for video/*", async () => {
      const b = blob([0x00, 0x00, 0x00, 0x00], "video/x-custom");
      const sig = await detect(b);
      expect(sig.mime).toBe("video/x-custom");
      expect(sig.family).toBe("video");
    });

    it("unknown File.name extension returns family unknown", async () => {
      const f = file([0x00, 0x00, 0x00, 0x00], "mystery.zzz", "");
      const sig = await detect(f);
      expect(sig.ext).toBe("zzz");
      expect(sig.family).toBe("unknown");
    });

    it("ignores application/octet-stream MIME and tries extension", async () => {
      const f = file(
        [0x00, 0x00, 0x00, 0x00],
        "photo.png",
        "application/octet-stream",
      );
      const sig = await detect(f);
      expect(sig.mime).toBe("image/png");
      expect(sig.ext).toBe("png");
      expect(sig.family).toBe("image");
    });

    it("completely unidentifiable blob returns unknown", async () => {
      const sig = await detect(blob([0x00, 0x00, 0x00, 0x00]));
      expect(sig.mime).toBe("application/octet-stream");
      expect(sig.ext).toBe("");
      expect(sig.family).toBe("unknown");
    });
  });

  // ---- edge cases ---------------------------------------------------------

  describe("edge cases", () => {
    it("handles empty blob", async () => {
      const sig = await detect(new Blob([]));
      expect(sig.family).toBe("unknown");
    });

    it("handles 1-byte blob", async () => {
      const sig = await detect(blob([0xff]));
      expect(sig.family).toBe("unknown");
    });

    it("handles 3-byte blob matching partial JPEG", async () => {
      // FF D8 FF is valid JPEG start
      const sig = await detect(blob([0xff, 0xd8, 0xff]));
      expect(sig.mime).toBe("image/jpeg");
      expect(sig.family).toBe("image");
    });

    it("RIFF header without known fourCC falls through", async () => {
      // RIFF....XXXX — not WEBP, not AVI
      const bytes = [
        0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x58, 0x58, 0x58, 0x58,
      ];
      const sig = await detect(blob(bytes));
      // Should not match WebP or AVI — falls through to later checks
      expect(sig.mime).not.toBe("image/webp");
      expect(sig.mime).not.toBe("video/x-msvideo");
    });

    it("magic bytes take priority over misleading blob.type", async () => {
      // PNG magic bytes but blob says it's a PDF
      const b = blob(
        [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
        "application/pdf",
      );
      const sig = await detect(b);
      expect(sig.mime).toBe("image/png");
      expect(sig.family).toBe("image");
    });

    it("magic bytes take priority over misleading File.name", async () => {
      // JPEG magic but named .pdf
      const f = file([0xff, 0xd8, 0xff, 0xe0], "not-a.pdf", "");
      const sig = await detect(f);
      expect(sig.mime).toBe("image/jpeg");
      expect(sig.family).toBe("image");
    });

    it("File with no extension and no MIME returns unknown", async () => {
      const f = file([0x00, 0x00, 0x00, 0x00], "noext", "");
      const sig = await detect(f);
      expect(sig.family).toBe("unknown");
    });
  });

  // ---- familyColors -------------------------------------------------------

  describe("familyColors", () => {
    it("has a colour for every family", () => {
      const families: FileSignature["family"][] = [
        "image",
        "video",
        "document",
        "spreadsheet",
        "presentation",
        "unknown",
      ];
      for (const fam of families) {
        expect(familyColors[fam]).toBeDefined();
        expect(typeof familyColors[fam]).toBe("string");
        expect(familyColors[fam].length).toBeGreaterThan(0);
      }
    });

    it("all colours are distinct", () => {
      const values = Object.values(familyColors);
      const unique = new Set(values);
      expect(unique.size).toBe(values.length);
    });

    it("colours look like CSS colour values", () => {
      for (const colour of Object.values(familyColors)) {
        // Should start with # (hex colour)
        expect(colour).toMatch(/^#[0-9A-Fa-f]{3,8}$/);
      }
    });
  });
});
