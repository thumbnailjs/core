// ---------------------------------------------------------------------------
// PDF renderer — lazy-loads pdfjs-dist on first use
// ---------------------------------------------------------------------------

import type { Renderer, RenderOptions } from "../types";
import { abortError, throwIfAborted } from "../abort";
import { config } from "../config";

/** %PDF- magic bytes */
const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2d] as const;

// Singleton promise so pdfjs-dist is loaded exactly once.
let pdfjsPromise: Promise<typeof import("pdfjs-dist")> | null = null;

function loadPdfjs(): Promise<typeof import("pdfjs-dist")> {
  if (!pdfjsPromise) {
    pdfjsPromise = import("pdfjs-dist").catch((err) => {
      pdfjsPromise = null;
      const error = new Error(
        "thumbnailjs: pdfjs-dist is required for PDF thumbnails but failed to load. " +
          "Install it with: npm install pdfjs-dist",
      );
      (error as any).cause = err;
      throw error;
    });
  }
  return pdfjsPromise;
}

/**
 * Resolve the worker script before each document load (not once at module
 * load), so a late `thumbnail.configure({ pdfWorkerSrc })` still applies.
 *
 * Precedence: configure() > a workerSrc the host app set directly on
 * GlobalWorkerOptions > the jsDelivr CDN default. Offline apps should
 * configure a bundled copy — the CDN is unreachable there.
 */
function applyWorkerSrc(pdfjs: typeof import("pdfjs-dist")): void {
  if (typeof pdfjs.GlobalWorkerOptions === "undefined") return;
  if (config.pdfWorkerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = config.pdfWorkerSrc;
  } else if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
  }
}

/**
 * Render the first page from either in-memory data or a URL. With a URL,
 * pdf.js uses its range transport (when the server supports it) and, with
 * `disableAutoFetch`, downloads only the chunks the first page needs.
 */
async function renderPdf(
  source: { data: Uint8Array } | { url: string },
  opts: RenderOptions,
): Promise<HTMLCanvasElement> {
  const pdfjsLib = await loadPdfjs();
  applyWorkerSrc(pdfjsLib);

  const { width, height, fit, background, signal } = opts;
  throwIfAborted(signal);

  const loadingTask = pdfjsLib.getDocument({
    ...source,
    disableAutoFetch: true,
    disableFontFace: false,
  });

  // Abort during document load → tear the transport down. pdf.js then
  // rejects with its own error; the catch below maps it to the abort reason.
  const onLoadAbort = () => {
    loadingTask.destroy();
  };
  signal?.addEventListener("abort", onLoadAbort, { once: true });

  let pdfDoc: Awaited<typeof loadingTask.promise> | undefined;
  try {
    pdfDoc = await loadingTask.promise;
    throwIfAborted(signal);

    // Render the first page
    const page = await pdfDoc.getPage(1);
    const unscaledViewport = page.getViewport({ scale: 1 });

    const sourceW = unscaledViewport.width;
    const sourceH = unscaledViewport.height;

    const targetW = width;
    let targetH = height ?? Math.round(width * (sourceH / sourceW));

    let scale: number;
    if (fit === "cover") {
      scale = Math.max(targetW / sourceW, targetH / sourceH);
    } else {
      scale = Math.min(targetW / sourceW, targetH / sourceH);
    }

    const viewport = page.getViewport({ scale });

    // If height was left undefined we let the aspect ratio decide.
    if (height === undefined) {
      targetH = Math.round(viewport.height);
    }

    const canvas = document.createElement("canvas");
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext("2d");

    if (!ctx) {
      throw new Error("thumbnailjs: unable to get 2d canvas context for PDF");
    }

    // Fill background
    if (background && background !== "transparent") {
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, targetW, targetH);
    }

    // Center the rendered page on the canvas (for 'contain' with extra space)
    const offsetX = (targetW - viewport.width) / 2;
    const offsetY = (targetH - viewport.height) / 2;
    ctx.translate(offsetX, offsetY);

    const renderTask = page.render({
      canvasContext: ctx,
      viewport,
    } as any);

    if (signal) {
      const onRenderAbort = () => {
        renderTask.cancel();
      };
      signal.addEventListener("abort", onRenderAbort, { once: true });
      renderTask.promise.finally(() =>
        signal.removeEventListener("abort", onRenderAbort),
      );
    }

    await renderTask.promise;
    return canvas;
  } catch (err) {
    // pdf.js surfaces destroy()/cancel() as its own error types; report the
    // caller's abort reason instead when the signal is what stopped us.
    if (signal?.aborted) throw abortError(signal);
    throw err;
  } finally {
    signal?.removeEventListener("abort", onLoadAbort);
    // Free pdf.js resources without masking the outcome.
    void pdfDoc?.destroy().catch(() => {});
  }
}

const pdf: Renderer = {
  name: "pdf",

  async test(file: Blob): Promise<boolean> {
    // Fast-path: MIME type check
    if (file.type === "application/pdf") {
      return true;
    }

    // Magic-byte sniffing: first 5 bytes must be %PDF-
    try {
      const slice = file.slice(0, 5);
      const buf = new Uint8Array(await slice.arrayBuffer());
      if (buf.length >= 5) {
        return PDF_MAGIC.every((byte, i) => buf[i] === byte);
      }
    } catch {
      // arrayBuffer() may fail on an empty blob or in restrictive
      // environments – fall through to false.
    }

    return false;
  },

  async render(file: Blob, opts: RenderOptions): Promise<HTMLCanvasElement> {
    throwIfAborted(opts.signal);
    const arrayBuffer = await file.arrayBuffer();
    throwIfAborted(opts.signal);
    return renderPdf({ data: new Uint8Array(arrayBuffer) }, opts);
  },

  // Streaming path: hand pdf.js the URL so it range-requests only the xref +
  // first-page chunks instead of the library downloading the whole document.
  async renderFromURL(url: string, opts: RenderOptions): Promise<HTMLCanvasElement> {
    return renderPdf({ url }, opts);
  },
};

export default pdf;
