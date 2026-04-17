import type {
  ThumbnailFormat,
  ThumbnailOptions,
  RenderOptions,
  Renderer,
  ThumbnailInput,
  ThumbnailResult,
} from "./types";
import { canvasToBlob, canvasToDataURL } from "./canvas";
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

const defaults: Renderer[] = [
  pdfRenderer,
  svgRenderer,
  imageRenderer,
  videoRenderer,
];
const renderers: Renderer[] = [...defaults];

async function toBlob(
  input: ThumbnailInput,
  signal?: AbortSignal,
): Promise<Blob> {
  if (input instanceof Blob) return input;
  if (input instanceof ArrayBuffer) return new Blob([input]);
  if (typeof input === "string") {
    const res = await fetch(input, { signal });
    if (!res.ok) throw new Error(`Failed to fetch "${input}": ${res.status}`);
    return res.blob();
  }
  throw new TypeError(
    "thumbnail() input must be a File, Blob, ArrayBuffer, or URL string",
  );
}

async function thumbnailImpl<F extends ThumbnailFormat = "blob">(
  input: ThumbnailInput,
  options?: ThumbnailOptions & { format?: F },
): Promise<ThumbnailResult<F>> {
  const opts = options ?? {};
  if (opts.signal?.aborted) throw new DOMException("Aborted", "AbortError");
  const blob = await toBlob(input, opts.signal);
  const renderOpts: RenderOptions = {
    width: opts.width ?? 256,
    height: opts.height,
    fit: opts.fit ?? "contain",
    background: opts.background ?? "transparent",
    signal: opts.signal,
  };

  let canvas: HTMLCanvasElement | undefined;
  for (const renderer of renderers) {
    if (await renderer.test(blob)) {
      canvas = await renderer.render(blob, renderOpts);
      break;
    }
  }
  if (!canvas) canvas = await renderFallback(blob, renderOpts);

  const format = (opts.format ?? "blob") as F;
  if (format === ("canvas" as F)) return canvas as ThumbnailResult<F>;
  if (format === ("dataurl" as F))
    return canvasToDataURL(canvas) as ThumbnailResult<F>;
  return (await canvasToBlob(canvas)) as ThumbnailResult<F>;
}

type ThumbnailFn = {
  <F extends ThumbnailFormat = "blob">(
    input: ThumbnailInput,
    options?: ThumbnailOptions & { format?: F },
  ): Promise<ThumbnailResult<F>>;
  use(renderer: Renderer): void;
  reset(): void;
};

const thumbnail = thumbnailImpl as ThumbnailFn;

thumbnail.use = (renderer: Renderer): void => {
  renderers.push(renderer);
};

thumbnail.reset = (): void => {
  renderers.length = 0;
  renderers.push(...defaults);
};

export { thumbnail };
