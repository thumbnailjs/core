// ---------------------------------------------------------------------------
// thumbnail.configure() — pdf.js worker from a self-hosted URL (offline story)
// ---------------------------------------------------------------------------
// Runs in its own file: vitest browser isolation gives it a fresh module
// registry, so pdf.js loads here with the configured workerSrc instead of
// the CDN default other suites may have initialised.
import { describe, it, expect } from "vitest";
import { commands } from "@vitest/browser/context";
import { thumbnail } from "../src/index";

async function readFixture(filename: string, mime: string): Promise<File> {
  const base64 = await commands.readFile(`./fixtures/${filename}`, "base64");
  const raw = atob(base64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return new File([bytes], filename, { type: mime });
}

describe("thumbnail.configure()", () => {
  it("renders PDFs with a locally served pdf.js worker (no CDN)", async () => {
    const base = await commands.startFixtureServer();
    thumbnail.reset();
    thumbnail.configure({ pdfWorkerSrc: `${base}/pdf.worker.min.mjs` });

    const file = await readFixture("document.pdf", "application/pdf");
    const canvas = await thumbnail(file, { width: 128, format: "canvas" });

    expect(canvas.width).toBe(128);
    expect(canvas.height).toBeGreaterThan(canvas.width);
  });
});
