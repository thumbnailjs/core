import type { Renderer, RenderOptions } from "../types";
import { renderToCanvas } from "../canvas";
import { detect } from "../detect";

const video: Renderer = {
  name: "video",

  async test(file: Blob): Promise<boolean> {
    const sig = await detect(file);
    return sig.family === "video";
  },

  async render(file: Blob, opts: RenderOptions): Promise<HTMLCanvasElement> {
    const url = URL.createObjectURL(file);
    try {
      const video = document.createElement("video");
      video.muted = true;
      video.playsInline = true;
      video.preload = "auto";
      video.src = url;

      await new Promise<void>((resolve, reject) => {
        video.onloadeddata = () => resolve();
        video.onerror = () =>
          reject(new Error(`Video load failed: ${video.error?.message ?? "unknown"}`));
        const timer = setTimeout(() => reject(new Error("Video load timed out")), 15_000);
        video.addEventListener("loadeddata", () => clearTimeout(timer), { once: true });
      });

      const seekTime = Math.min(1, video.duration || 0);
      if (seekTime > 0) {
        video.currentTime = seekTime;
        await new Promise<void>((resolve) => {
          video.onseeked = () => resolve();
          const timer = setTimeout(() => resolve(), 5_000);
          video.addEventListener("seeked", () => clearTimeout(timer), { once: true });
        });
      }

      const srcW = video.videoWidth;
      const srcH = video.videoHeight;
      const targetH = opts.height ?? Math.round(srcH * (opts.width / srcW));
      return renderToCanvas(video, { ...opts, height: targetH }, srcW, srcH);
    } finally {
      URL.revokeObjectURL(url);
    }
  },
};

export default video;
