// ---------------------------------------------------------------------------
// Library-wide configuration, set via `thumbnail.configure()`
// ---------------------------------------------------------------------------

export interface ThumbnailConfig {
  /**
   * URL of the pdf.js worker script (`pdf.worker.min.mjs`).
   *
   * Resolution order when the PDF renderer loads pdf.js:
   *   1. this value, when set — it wins even over a `workerSrc` the host app
   *      assigned directly on `GlobalWorkerOptions`;
   *   2. a `GlobalWorkerOptions.workerSrc` already set by the host app;
   *   3. the jsDelivr CDN (zero-config default for online apps).
   *
   * Offline or self-hosted apps should point this at a bundled copy, e.g.
   * with Vite: `import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url"`.
   */
  pdfWorkerSrc?: string;
}

export const config: ThumbnailConfig = {};

/** Merge a partial configuration into the library config. */
export function configure(patch: ThumbnailConfig): void {
  Object.assign(config, patch);
}
