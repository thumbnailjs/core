import type {
  ThumbnailFormat,
  ThumbnailOptions,
  RenderOptions,
  Renderer,
  ThumbnailInput,
  ThumbnailResult,
} from "./types";
import { canvasToBlob, canvasToDataURL } from "./canvas";
import { throwIfAborted, raceWithAbort } from "./abort";
import { configure, type ThumbnailConfig } from "./config";
import pdfRenderer from "./renderers/pdf";
import imageRenderer from "./renderers/image";
import svgRenderer from "./renderers/svg";
import videoRenderer from "./renderers/video";
import { renderFallback } from "./renderers/fallback";

export type {
  ThumbnailFormat,
  ThumbnailOptions,
  RenderOptions,
  Renderer,
  ThumbnailInput,
  ThumbnailResult,
  ThumbnailFit,
} from "./types";
export { detect, familyColors } from "./detect";
export type { FileSignature } from "./detect";
export { canEncode } from "./canvas";
export type { ThumbnailConfig } from "./config";

const defaults: Renderer[] = [
  pdfRenderer,
  svgRenderer,
  imageRenderer,
  videoRenderer,
];
const renderers: Renderer[] = [...defaults];

// Bytes fetched to identify a URL input: enough for every magic-byte
// signature and the SVG text sniff (256 B), with slack for XML preambles.
const HEAD_BYTES = 4096;

/**
 * What `thumbnail()` works from after normalising its input.
 *
 * - `probe`: bytes for renderer `test()` — the full file, or just its head
 *   when the input is a URL (so identification never downloads the file).
 * - `blob`: the full file, when we already have it.
 * - `url`: set for URL inputs that can stream; renderers with
 *   `renderFromURL` consume it directly, others trigger one full fetch.
 */
interface ResolvedSource {
  probe: Blob;
  blob?: Blob;
  url?: string;
}

/** Basename of a URL's path, for the extension fallback in `detect()`. */
function filenameFromURL(url: string): string {
  try {
    const base = typeof location !== "undefined" ? location.href : undefined;
    const pathname = new URL(url, base).pathname;
    return decodeURIComponent(pathname.split("/").pop() ?? "");
  } catch {
    return "";
  }
}

/** MIME essence of a Content-Type header ('' when absent or unhelpful). */
function mimeFromContentType(contentType: string | null): string {
  if (!contentType) return "";
  const mime = contentType.split(";")[0].trim().toLowerCase();
  return mime === "application/octet-stream" ? "" : mime;
}

/** Total size from a Content-Range header ("bytes 0-4095/123456"). */
function totalFromContentRange(header: string | null): number | null {
  const match = header?.match(/\/(\d+)\s*$/);
  return match ? Number(match[1]) : null;
}

async function resolveSource(
  input: ThumbnailInput,
  signal?: AbortSignal,
): Promise<ResolvedSource> {
  if (input instanceof Blob) return { probe: input, blob: input };
  if (input instanceof ArrayBuffer) {
    const blob = new Blob([input]);
    return { probe: blob, blob };
  }
  if (typeof input === "string") {
    // Sniff the head with a Range request so identifying the file never
    // downloads it. Servers that ignore Range just send the whole body.
    let res: Response;
    try {
      res = await fetch(input, {
        signal,
        headers: { Range: `bytes=0-${HEAD_BYTES - 1}` },
      });
    } catch (err) {
      // A ranged request can fail where a plain one succeeds — e.g. a CORS
      // preflight that rejects the Range header. Retry unranged.
      throwIfAborted(signal);
      res = await fetch(input, { signal });
    }
    if (res.status === 416) {
      // Range Not Satisfiable (zero-byte files) — take the body as-is.
      res = await fetch(input, { signal });
    }
    if (!res.ok) {
      throw new Error(`Failed to fetch "${input}": ${res.status}`);
    }

    const name = filenameFromURL(input);

    if (res.status === 206) {
      const head = new Uint8Array(await res.arrayBuffer());
      const mime = mimeFromContentType(res.headers.get("content-type"));
      const probe = new File([head], name, { type: mime });
      // When the range covered the entire file, the head IS the file.
      const total = totalFromContentRange(res.headers.get("content-range"));
      if (total !== null && total <= head.byteLength) {
        return { probe, blob: probe };
      }
      return { probe, url: input };
    }

    // 200: the server ignored the Range header — the whole body is already
    // on the wire, so use it rather than fetching a second time.
    const body = await res.blob();
    const mime = mimeFromContentType(res.headers.get("content-type")) || body.type;
    const file = new File([body], name, { type: mime });
    return { probe: file, blob: file };
  }
  throw new TypeError(
    "thumbnail() input must be a File, Blob, ArrayBuffer, or URL string",
  );
}

async function fetchFull(url: string, signal?: AbortSignal): Promise<Blob> {
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Failed to fetch "${url}": ${res.status}`);
  return res.blob();
}

/**
 * Run the matched renderer against the source: full blob when we have it,
 * the streaming path when the renderer supports URLs, one full fetch
 * otherwise (e.g. images, which need every byte to decode anyway).
 */
async function renderSource(
  renderer: Renderer,
  source: ResolvedSource,
  opts: RenderOptions,
): Promise<HTMLCanvasElement> {
  if (source.blob) return renderer.render(source.blob, opts);
  if (renderer.renderFromURL) return renderer.renderFromURL(source.url!, opts);
  const blob = await fetchFull(source.url!, opts.signal);
  throwIfAborted(opts.signal);
  return renderer.render(blob, opts);
}

async function thumbnailImpl<F extends ThumbnailFormat = "blob">(
  input: ThumbnailInput,
  options?: ThumbnailOptions & { format?: F },
): Promise<ThumbnailResult<F>> {
  const opts = options ?? {};
  const signal = opts.signal;
  throwIfAborted(signal);
  const source = await resolveSource(input, signal);
  throwIfAborted(signal);
  const renderOpts: RenderOptions = {
    width: opts.width ?? 256,
    height: opts.height,
    fit: opts.fit ?? "contain",
    background: opts.background ?? "transparent",
    signal,
  };

  // raceWithAbort guarantees thumbnail() rejects promptly on abort even
  // where the underlying work can't be cancelled (decode, encode, or a
  // custom renderer that ignores opts.signal).
  let canvas: HTMLCanvasElement | undefined;
  for (const renderer of renderers) {
    throwIfAborted(signal);
    if (await renderer.test(source.probe)) {
      canvas = await raceWithAbort(
        renderSource(renderer, source, renderOpts),
        signal,
      );
      break;
    }
  }
  // The fallback icon needs only the detected type — for URL inputs that's
  // the head bytes, so unknown files are never downloaded at all.
  if (!canvas) {
    canvas = await raceWithAbort(renderFallback(source.probe, renderOpts), signal);
  }
  throwIfAborted(signal);

  const format = (opts.format ?? "blob") as F;
  if (format === ("canvas" as F)) return canvas as ThumbnailResult<F>;
  if (format === ("dataurl" as F))
    return canvasToDataURL(canvas, opts.type, opts.quality) as ThumbnailResult<F>;
  return (await canvasToBlob(canvas, opts.type, opts.quality)) as ThumbnailResult<F>;
}

type ThumbnailFn = {
  <F extends ThumbnailFormat = "blob">(
    input: ThumbnailInput,
    options?: ThumbnailOptions & { format?: F },
  ): Promise<ThumbnailResult<F>>;
  use(renderer: Renderer): void;
  reset(): void;
  configure(patch: ThumbnailConfig): void;
};

const thumbnail = thumbnailImpl as ThumbnailFn;

thumbnail.use = (renderer: Renderer): void => {
  renderers.push(renderer);
};

thumbnail.reset = (): void => {
  renderers.length = 0;
  renderers.push(...defaults);
};

thumbnail.configure = configure;

export { thumbnail };
