import type { Renderer, RenderOptions } from "../types";
import { renderToCanvas } from "../canvas";

const svg: Renderer = {
  name: "svg",

  async test(file: Blob): Promise<boolean> {
    if (file.type === "image/svg+xml") return true;
    const text = await file.slice(0, 256).text();
    const t = text.trimStart().toLowerCase();
    return t.startsWith("<svg") || (t.startsWith("<?xml") && t.includes("<svg"));
  },

  async render(file: Blob, opts: RenderOptions): Promise<HTMLCanvasElement> {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("SVG load failed"));
        img.src = url;
      });

      const srcW = img.naturalWidth || opts.width;
      const srcH = img.naturalHeight || opts.width;
      const targetH = opts.height ?? Math.round(srcH * (opts.width / srcW));
      return renderToCanvas(img, { ...opts, height: targetH }, srcW, srcH);
    } finally {
      URL.revokeObjectURL(url);
    }
  },
};

export default svg;
