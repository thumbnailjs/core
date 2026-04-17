// thumbnailjs/src/canvas.ts
// Canvas resize, fit, and encode helpers for thumbnail generation.

import type { RenderOptions, ThumbnailFit } from './types';

// ---------------------------------------------------------------------------
// Dimension / fit calculation
// ---------------------------------------------------------------------------

export interface FitResult {
  /** Final canvas width */
  width: number;
  /** Final canvas height */
  height: number;
  /** X offset to start drawing the source image */
  offsetX: number;
  /** Y offset to start drawing the source image */
  offsetY: number;
  /** Width the source should be drawn at */
  drawWidth: number;
  /** Height the source should be drawn at */
  drawHeight: number;
}

/**
 * Compute drawing dimensions for fitting a source rectangle into a target
 * rectangle using either "contain" or "cover" logic.
 *
 * - **contain**: the entire source is visible; letterboxed if aspect ratios
 *   differ.
 * - **cover**: the target is fully filled; the source is cropped (centered)
 *   if aspect ratios differ.
 */
export function fitDimensions(
  srcW: number,
  srcH: number,
  targetW: number,
  targetH: number,
  fit: ThumbnailFit,
): FitResult {
  if (srcW <= 0 || srcH <= 0) {
    return { width: targetW, height: targetH, offsetX: 0, offsetY: 0, drawWidth: targetW, drawHeight: targetH };
  }

  const srcAspect = srcW / srcH;
  const tgtAspect = targetW / targetH;

  let drawWidth: number;
  let drawHeight: number;

  if (fit === 'contain') {
    // Scale source to fit entirely within the target bounds.
    if (srcAspect > tgtAspect) {
      // Source is wider → constrained by width
      drawWidth = targetW;
      drawHeight = targetW / srcAspect;
    } else {
      // Source is taller → constrained by height
      drawHeight = targetH;
      drawWidth = targetH * srcAspect;
    }
  } else {
    // cover: scale source to fill the entire target (some clipping may occur).
    if (srcAspect > tgtAspect) {
      // Source is wider → constrained by height (overflows width)
      drawHeight = targetH;
      drawWidth = targetH * srcAspect;
    } else {
      // Source is taller → constrained by width (overflows height)
      drawWidth = targetW;
      drawHeight = targetW / srcAspect;
    }
  }

  // Center the drawn region within the target canvas.
  const offsetX = (targetW - drawWidth) / 2;
  const offsetY = (targetH - drawHeight) / 2;

  return {
    width: targetW,
    height: targetH,
    offsetX: Math.round(offsetX),
    offsetY: Math.round(offsetY),
    drawWidth: Math.round(drawWidth),
    drawHeight: Math.round(drawHeight),
  };
}

// ---------------------------------------------------------------------------
// Canvas creation helper
// ---------------------------------------------------------------------------

/**
 * Create an HTMLCanvasElement with the given dimensions.
 *
 * Wrapped in a helper so the allocation strategy can be swapped later
 * (e.g. OffscreenCanvas, node-canvas, etc.) without touching call-sites.
 */
export function createCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

// ---------------------------------------------------------------------------
// Render source → canvas
// ---------------------------------------------------------------------------

/**
 * Draw a `CanvasImageSource` (ImageBitmap, HTMLVideoElement, HTMLCanvasElement,
 * HTMLImageElement …) onto a new canvas according to the provided render
 * options and the intrinsic source dimensions.
 *
 * If `opts.height` is `undefined`, the target height is derived from the
 * source aspect ratio so that proportions are preserved.
 */
export function renderToCanvas(
  source: CanvasImageSource,
  opts: RenderOptions,
  sourceWidth: number,
  sourceHeight: number,
): HTMLCanvasElement {
  const { width: targetW, fit, background } = opts;

  // Resolve target height: if unset, derive from source aspect ratio.
  let targetH: number;
  if (opts.height != null && opts.height > 0) {
    targetH = opts.height;
  } else if (sourceWidth > 0 && sourceHeight > 0) {
    targetH = Math.round(targetW * (sourceHeight / sourceWidth));
  } else {
    targetH = targetW; // square fallback
  }

  const canvas = createCanvas(targetW, targetH);
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('thumbnailjs: failed to obtain 2D canvas context');
  }

  // Fill background first (supports "transparent", colour strings, etc.).
  if (background && background !== 'transparent') {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, targetW, targetH);
  }

  // Compute draw layout.
  const layout = fitDimensions(sourceWidth, sourceHeight, targetW, targetH, fit);

  ctx.drawImage(
    source,
    layout.offsetX,
    layout.offsetY,
    layout.drawWidth,
    layout.drawHeight,
  );

  return canvas;
}

// ---------------------------------------------------------------------------
// Encode helpers
// ---------------------------------------------------------------------------

/**
 * Convert an HTMLCanvasElement to a PNG Blob.
 * Wraps `canvas.toBlob` in a Promise for ergonomic async usage.
 */
export function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error('thumbnailjs: canvas.toBlob returned null'));
      }
    }, 'image/png');
  });
}

/**
 * Convert an HTMLCanvasElement to a PNG data-URL string.
 */
export function canvasToDataURL(canvas: HTMLCanvasElement): string {
  return canvas.toDataURL('image/png');
}
