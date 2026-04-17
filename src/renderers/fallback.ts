import type { RenderOptions } from "../types";
import { createCanvas } from "../canvas";
import { detect, familyColors } from "../detect";

export async function renderFallback(
  file: Blob,
  opts: RenderOptions,
): Promise<HTMLCanvasElement> {
  const sig = await detect(file);
  const w = opts.width;
  const h = opts.height ?? opts.width;
  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext("2d")!;

  const color = familyColors[sig.family] ?? familyColors.unknown;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, w, h);

  const label = sig.ext ? sig.ext.toUpperCase() : "?";
  const fontSize = Math.max(10, Math.round(w * 0.18));
  ctx.font = `bold ${fontSize}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#FFFFFF";
  ctx.fillText(label, w / 2, h / 2);

  return canvas;
}

export default renderFallback;
