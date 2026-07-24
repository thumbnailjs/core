// ---------------------------------------------------------------------------
// ODF renderer — draws the thumbnail embedded in the document package
// ---------------------------------------------------------------------------
// OpenDocument files (odt/ods/odp) carry a preview at Thumbnails/thumbnail.png
// (LibreOffice writes it by default); Office Open XML files (docx/pptx/xlsx)
// sometimes carry one at docProps/thumbnail.*. We extract and draw it rather
// than rendering the document — no layout engine, works offline. When no
// embedded thumbnail is present, `render` returns null so the pipeline falls
// through to the correctly-coloured type icon.
// ---------------------------------------------------------------------------

import type { Renderer, RenderOptions } from "../types";
import { renderToCanvas } from "../canvas";
import { detect } from "../detect";
import { unzipEntry } from "../unzip";
import { throwIfAborted } from "../abort";

const ODF_EXTS = new Set(["odt", "ods", "odp"]);
const OOXML_EXTS = new Set(["docx", "pptx", "xlsx"]);

// Where the embedded preview lives, by package family.
const ODF_THUMB = ["Thumbnails/thumbnail.png"];
const OOXML_THUMB = [
  "docProps/thumbnail.jpeg",
  "docProps/thumbnail.jpg",
  "docProps/thumbnail.png",
  "docProps/thumbnail.emf",
];

const odf: Renderer = {
  name: "odf",

  async test(file: Blob): Promise<boolean> {
    const sig = await detect(file);
    return ODF_EXTS.has(sig.ext) || OOXML_EXTS.has(sig.ext);
  },

  async render(file: Blob, opts: RenderOptions): Promise<HTMLCanvasElement | null> {
    throwIfAborted(opts.signal);
    const sig = await detect(file);
    const candidates = ODF_EXTS.has(sig.ext) ? ODF_THUMB : OOXML_THUMB;

    let bytes: Uint8Array<ArrayBuffer> | null = null;
    for (const name of candidates) {
      bytes = await unzipEntry(file, name);
      if (bytes) break;
    }
    // No embedded thumbnail — decline so the type icon is used instead.
    if (!bytes) return null;

    throwIfAborted(opts.signal);
    // Some producers store an EMF/WMF preview the browser can't decode; treat a
    // decode failure as "no usable thumbnail" and fall through.
    let bitmap: ImageBitmap;
    try {
      bitmap = await createImageBitmap(new Blob([bytes]));
    } catch {
      return null;
    }
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

export default odf;
