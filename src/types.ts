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
   */
  test: (file: Blob) => boolean | Promise<boolean>;
  /**
   * Produce an `HTMLCanvasElement` (or compatible) with the thumbnail
   * drawn at the requested dimensions.
   */
  render: (file: Blob, opts: RenderOptions) => Promise<HTMLCanvasElement>;
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
