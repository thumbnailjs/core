// ---------------------------------------------------------------------------
// PDF renderer — lazy-loads pdfjs-dist on first use
// ---------------------------------------------------------------------------

import type { Renderer, RenderOptions } from "../types";

/** %PDF- magic bytes */
const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2d] as const;

// Singleton promise so pdfjs-dist is loaded and configured exactly once.
let pdfjsPromise: Promise<typeof import("pdfjs-dist")> | null = null;

function loadPdfjs(): Promise<typeof import("pdfjs-dist")> {
  if (!pdfjsPromise) {
    pdfjsPromise = import("pdfjs-dist")
      .then((pdfjs) => {
        if (
          typeof pdfjs.GlobalWorkerOptions !== "undefined" &&
          !pdfjs.GlobalWorkerOptions.workerSrc
        ) {
          pdfjs.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
        }
        return pdfjs;
      })
      .catch((err) => {
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
    const pdfjsLib = await loadPdfjs();

    const { width, height, fit, background, signal } = opts;

    // Abort early if already cancelled
    if (signal?.aborted) {
      throw signal.reason ?? new DOMException("Aborted", "AbortError");
    }

    // Load the PDF document
    const arrayBuffer = await file.arrayBuffer();

    if (signal?.aborted) {
      throw signal.reason ?? new DOMException("Aborted", "AbortError");
    }

    const loadingTask = pdfjsLib.getDocument({
      data: new Uint8Array(arrayBuffer),
      disableAutoFetch: true,
      disableFontFace: false,
    });

    // Wire up abort support
    if (signal) {
      const onAbort = () => {
        loadingTask.destroy();
      };
      signal.addEventListener("abort", onAbort, { once: true });
    }

    const pdfDoc = await loadingTask.promise;

    if (signal?.aborted) {
      await pdfDoc.destroy();
      throw signal.reason ?? new DOMException("Aborted", "AbortError");
    }

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
      const onAbort = () => {
        renderTask.cancel();
      };
      signal.addEventListener("abort", onAbort, { once: true });
      renderTask.promise.finally(() =>
        signal.removeEventListener("abort", onAbort),
      );
    }

    await renderTask.promise;

    // Clean up pdf.js resources
    await pdfDoc.destroy();

    return canvas;
  },
};

export default pdf;
