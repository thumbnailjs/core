// ---------------------------------------------------------------------------
// thumbnailjs – shared type definitions
// ---------------------------------------------------------------------------

/** Output format returned by `thumbnail()`. */
export type ThumbnailFormat = 'blob' | 'dataurl' | 'canvas';

/** How the source is fitted into the target rectangle. */
export type ThumbnailFit = 'contain' | 'cover';

/**
 * Options accepted by the public `thumbnail()` function.
 *
 * Every field is optional – sensible defaults are applied internally.
 */
export interface ThumbnailOptions {
  /** Target width in CSS pixels. Defaults to `256`. */
  width?: number;
  /**
   * Target height in CSS pixels.
   * When omitted the height is derived from the source aspect ratio
   * (i.e. "auto").
   */
  height?: number;
  /** Desired output format. Defaults to `'blob'`. */
  format?: ThumbnailFormat;
  /** Fit strategy. Defaults to `'contain'`. */
  fit?: ThumbnailFit;
  /**
   * CSS colour string used to fill the background of the thumbnail canvas.
   * Defaults to `'transparent'`.
   */
  background?: string;
  /**
   * Encoding MIME type used for `'blob'` and `'dataurl'` outputs.
   * Defaults to `'image/png'`.
   *
   * Note: when the engine cannot encode the requested type, browsers
   * silently fall back to PNG (per spec) — check the returned Blob's
   * `type`, or probe support upfront with `canEncode()`.
   * JPEG has no alpha channel; pair it with an opaque `background`.
   */
  type?: 'image/png' | 'image/jpeg' | 'image/webp' | (string & {});
  /**
   * Encoder quality (0–1) for lossy types (JPEG, WebP).
   * Ignored for PNG.
   */
  quality?: number;
  /** An optional `AbortSignal` for cancellation support. */
  signal?: AbortSignal;
}

/**
 * Resolved options passed to every renderer.
 *
 * `width` is always a positive number.
 * `height` may be `undefined` which signals "preserve aspect ratio".
 */
export interface RenderOptions {
  width: number;
  /**
   * When `undefined` the renderer should preserve the source aspect ratio
   * (i.e. compute the height from the width and the source dimensions).
   */
  height: number | undefined;
  fit: ThumbnailFit;
  background: string;
  signal?: AbortSignal;
}

/**
 * A pluggable renderer that knows how to turn a specific file type
 * into a thumbnail canvas.
 */
export interface Renderer {
  /** Human-readable name, useful for debugging. */
  name: string;
  /**
   * Return `true` if this renderer can handle the given blob.
   * May be async (e.g. when magic-byte sniffing is required).
   *
   * When the input to `thumbnail()` is a URL string, `test` may receive
   * only the file's head (the first ~4 KB, fetched with a Range request)
   * rather than the full file — keep tests to MIME checks and magic-byte
   * sniffing near the start of the blob.
   */
  test: (file: Blob) => boolean | Promise<boolean>;
  /**
   * Produce an `HTMLCanvasElement` (or compatible) with the thumbnail
   * drawn at the requested dimensions.
   *
   * Return `null` to *decline* after matching — e.g. an ODF document with no
   * embedded thumbnail, an encrypted PDF, or a video with no decodable frame.
   * The pipeline then continues to the next renderer, ultimately falling back
   * to the type icon. Reserve `null` for a clean "nothing to render"; `throw`
   * for an unexpected failure so real bugs stay visible.
   *
   * Renderers should honor `opts.signal` and reject with the signal's
   * reason (an `AbortError` DOMException by default) as early as possible.
   */
  render: (file: Blob, opts: RenderOptions) => Promise<HTMLCanvasElement | null>;
  /**
   * Optional streaming path: render directly from a URL without the
   * library pre-downloading the whole file. When `thumbnail()` receives a
   * URL string it sniffs the file's head with a Range request, matches a
   * renderer via `test()`, and — when this method exists — hands over the
   * URL so the underlying engine (`<video>`, pdf.js) can stream only the
   * bytes it needs.
   *
   * The response must be CORS-readable (or same-origin), otherwise the
   * canvas taints and `'blob'`/`'dataurl'` outputs throw a SecurityError.
   *
   * Like `render`, may return `null` to decline and fall through.
   */
  renderFromURL?: (url: string, opts: RenderOptions) => Promise<HTMLCanvasElement | null>;
}

/** Accepted input types for `thumbnail()`. */
export type ThumbnailInput = File | Blob | ArrayBuffer | string;

/**
 * The return type of `thumbnail()`, parameterised by the chosen format.
 *
 * - `'blob'`    → `Blob`
 * - `'dataurl'` → `string`
 * - `'canvas'`  → `HTMLCanvasElement`
 */
export type ThumbnailResult<F extends ThumbnailFormat = 'blob'> =
  F extends 'blob' ? Blob :
  F extends 'dataurl' ? string :
  F extends 'canvas' ? HTMLCanvasElement :
  never;
