import type { Renderer, RenderOptions } from "../types";
import { renderToCanvas } from "../canvas";
import { throwIfAborted } from "../abort";

const image: Renderer = {
  name: "image",

  test(file: Blob): boolean {
    return file.type.startsWith("image/") && file.type !== "image/svg+xml";
  },

  async render(file: Blob, opts: RenderOptions): Promise<HTMLCanvasElement> {
    throwIfAborted(opts.signal);
    // The decode itself cannot be cancelled, but checking again afterwards
    // skips the draw + downstream encode when the caller has moved on.
    const bitmap = await createImageBitmap(file);
    try {
      throwIfAborted(opts.signal);
      const srcW = bitmap.width;
      const srcH = bitmap.height;
      const targetH = opts.height ?? Math.round(srcH * (opts.width / srcW));
      return renderToCanvas(bitmap, { ...opts, height: targetH }, srcW, srcH);
    } finally {
      bitmap.close();
    }
  },
};

export default image;
