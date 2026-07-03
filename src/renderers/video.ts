import type { Renderer, RenderOptions } from "../types";
import { renderToCanvas } from "../canvas";
import { detect } from "../detect";
import { abortError, throwIfAborted } from "../abort";

const LOAD_TIMEOUT_MS = 15_000;
const SEEK_TIMEOUT_MS = 5_000;

/**
 * Draw a poster frame from a video source URL. Shared by the blob path
 * (object URL) and the streaming path (remote/asset URL). On the streaming
 * path the element range-requests only the bytes it needs, so `crossOrigin`
 * is set to keep the canvas readable — the server must send CORS headers.
 */
async function renderVideoFromSrc(
  src: string,
  opts: RenderOptions,
  crossOrigin: boolean,
): Promise<HTMLCanvasElement> {
  throwIfAborted(opts.signal);
  const { signal } = opts;

  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  if (crossOrigin) video.crossOrigin = "anonymous";

  // Detach the source and force a load() so the element stops buffering and
  // decoding — used on abort, and on settle so no decoder lingers.
  const stop = () => {
    video.removeAttribute("src");
    video.load();
  };

  try {
    video.src = src;

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("Video load timed out")),
        LOAD_TIMEOUT_MS,
      );
      const cleanup = () => {
        clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
      };
      const onAbort = () => {
        cleanup();
        reject(abortError(signal));
      };
      video.onloadeddata = () => {
        cleanup();
        resolve();
      };
      video.onerror = () => {
        cleanup();
        reject(
          new Error(`Video load failed: ${video.error?.message ?? "unknown"}`),
        );
      };
      signal?.addEventListener("abort", onAbort, { once: true });
    });

    // Seek away from the (often black) first frame — best-effort.
    const seekTime = Math.min(1, video.duration || 0);
    if (seekTime > 0) {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => resolve(), SEEK_TIMEOUT_MS);
        const cleanup = () => {
          clearTimeout(timer);
          signal?.removeEventListener("abort", onAbort);
        };
        const onAbort = () => {
          cleanup();
          reject(abortError(signal));
        };
        video.onseeked = () => {
          cleanup();
          resolve();
        };
        signal?.addEventListener("abort", onAbort, { once: true });
        video.currentTime = seekTime;
      });
    }

    throwIfAborted(signal);
    const srcW = video.videoWidth;
    const srcH = video.videoHeight;
    const targetH = opts.height ?? Math.round(srcH * (opts.width / srcW));
    return renderToCanvas(video, { ...opts, height: targetH }, srcW, srcH);
  } finally {
    stop();
  }
}

const video: Renderer = {
  name: "video",

  async test(file: Blob): Promise<boolean> {
    const sig = await detect(file);
    return sig.family === "video";
  },

  async render(file: Blob, opts: RenderOptions): Promise<HTMLCanvasElement> {
    const url = URL.createObjectURL(file);
    try {
      return await renderVideoFromSrc(url, opts, false);
    } finally {
      URL.revokeObjectURL(url);
    }
  },

  // Streaming path: the element range-requests just the moov/first-frames
  // bytes instead of the library downloading the entire file.
  async renderFromURL(url: string, opts: RenderOptions): Promise<HTMLCanvasElement> {
    return renderVideoFromSrc(url, opts, true);
  },
};

export default video;
