import type { Renderer, RenderOptions } from "../types";
import { renderToCanvas } from "../canvas";

const image: Renderer = {
  name: "image",

  test(file: Blob): boolean {
    return file.type.startsWith("image/") && file.type !== "image/svg+xml";
  },

  async render(file: Blob, opts: RenderOptions): Promise<HTMLCanvasElement> {
    const bitmap = await createImageBitmap(file);
    try {
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
