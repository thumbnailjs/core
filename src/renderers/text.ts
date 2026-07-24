// ---------------------------------------------------------------------------
// Text renderer — draws a real preview of the file's first lines
// ---------------------------------------------------------------------------
// Unlike the fallback icon, this shows actual content: the opening lines of a
// txt/markdown/csv/json/log/source file, monospaced on a paper background.
// Dependency-free. Registered late in the chain (after the binary renderers)
// and gated on a positive text signal so it never hijacks a binary file.
// ---------------------------------------------------------------------------

import type { Renderer, RenderOptions } from "../types";
import { createCanvas } from "../canvas";
import { throwIfAborted } from "../abort";

// Read at most this many bytes — plenty for a first-lines preview without
// pulling a whole multi-megabyte log into memory.
const MAX_BYTES = 64 * 1024;

const TEXT_APP_MIMES = new Set([
  "application/json",
  "application/ld+json",
  "application/xml",
  "application/javascript",
  "application/ecmascript",
  "application/x-ndjson",
  "application/x-yaml",
  "application/yaml",
  "application/x-sh",
  "application/x-httpd-php",
  "application/toml",
  "application/x-tex",
  "application/x-latex",
  "application/csv",
]);

const TEXT_EXTS = new Set([
  "txt", "text", "log", "md", "markdown", "mdx", "rst", "csv", "tsv",
  "json", "jsonl", "ndjson", "xml", "yaml", "yml", "toml", "ini", "cfg",
  "conf", "env", "properties", "js", "mjs", "cjs", "ts", "tsx", "jsx",
  "css", "scss", "less", "html", "htm", "vue", "svelte", "py", "rb", "go",
  "rs", "c", "h", "cc", "cpp", "hpp", "java", "kt", "swift", "php", "pl",
  "lua", "sh", "bash", "zsh", "fish", "sql", "r", "tex", "diff", "patch",
]);

// Extensionless files whose bare name identifies them as text.
const TEXT_BASENAMES = new Set([
  "makefile", "dockerfile", "license", "readme", "changelog", "authors",
  ".gitignore", ".gitattributes", ".env", ".editorconfig", ".npmrc",
]);

/** Lowercased extension of a path, or '' (dotfiles have no extension here). */
function extOf(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  const i = base.lastIndexOf(".");
  return i > 0 ? base.slice(i + 1).toLowerCase() : "";
}

function nameOf(file: Blob): string {
  return "name" in file && typeof (file as File).name === "string"
    ? (file as File).name
    : "";
}

/** True when MIME or filename positively marks the blob as text. */
function hasTextSignal(file: Blob): boolean {
  const type = (file.type || "").toLowerCase().split(";")[0].trim();
  if (type.startsWith("text/")) return true;
  if (TEXT_APP_MIMES.has(type)) return true;

  const name = nameOf(file);
  const ext = extOf(name);
  if (ext && TEXT_EXTS.has(ext)) return true;

  const base = (name.split(/[\\/]/).pop() ?? "").toLowerCase();
  return TEXT_BASENAMES.has(base);
}

/**
 * Decode bytes to a string. Honours a UTF-8/UTF-16 BOM, otherwise validates
 * UTF-8 (ignoring the last 3 bytes, which may be a truncated multi-byte char
 * from reading only the head) and falls back to Windows-1252 for legacy
 * single-byte encodings.
 */
function decodeText(bytes: Uint8Array): string {
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder("utf-8").decode(bytes.subarray(3));
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder("utf-16le").decode(bytes.subarray(2));
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder("utf-16be").decode(bytes.subarray(2));
  }
  const probe = bytes.subarray(0, Math.max(0, bytes.length - 3));
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(probe);
    return new TextDecoder("utf-8").decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

/** Parse a hex or rgb() colour to [r,g,b]; assume light paper otherwise. */
function paperRgb(color: string): [number, number, number] {
  if (color.startsWith("#")) {
    const n = parseInt(color.slice(1), 16);
    if (color.length >= 7) return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
  }
  const m = color.match(/\d+/g);
  if (m && m.length >= 3) return [Number(m[0]), Number(m[1]), Number(m[2])];
  return [255, 255, 255];
}

function drawText(text: string, opts: RenderOptions): HTMLCanvasElement {
  const width = opts.width;
  // No source aspect ratio for text — default to a portrait "page" shape.
  const height =
    opts.height != null && opts.height > 0
      ? opts.height
      : Math.round(width * 1.294); // US-letter portrait

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("thumbnailjs: failed to obtain 2D canvas context for text");

  const paper =
    !opts.background || opts.background === "transparent" ? "#ffffff" : opts.background;
  ctx.fillStyle = paper;
  ctx.fillRect(0, 0, width, height);

  const [r, g, b] = paperRgb(paper);
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  ctx.fillStyle = luminance < 140 ? "rgba(248, 250, 252, 0.92)" : "rgba(30, 41, 59, 0.92)";

  const pad = Math.max(6, Math.round(width * 0.06));
  const fontSize = Math.min(16, Math.max(7, Math.round(width / 34)));
  const lineHeight = Math.round(fontSize * 1.45);
  ctx.font = `${fontSize}px ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace`;
  ctx.textBaseline = "top";
  ctx.textAlign = "left";

  const maxWidth = width - pad * 2;
  const maxLines = Math.max(1, Math.floor((height - pad * 2) / lineHeight));
  const lines = text.replace(/\r\n?/g, "\n").split("\n");

  let y = pad;
  for (let i = 0; i < Math.min(lines.length, maxLines); i++) {
    // Expand tabs, drop stray control chars, and cap length before measuring
    // (a minified single line could otherwise be hundreds of KB).
    let line = lines[i]
      .replace(/\t/g, "    ")
      .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, " ")
      .slice(0, 500);

    if (ctx.measureText(line).width > maxWidth) {
      while (line.length > 0 && ctx.measureText(line + "…").width > maxWidth) {
        line = line.slice(0, -1);
      }
      line += "…";
    }
    if (line.length > 0) ctx.fillText(line, pad, y);
    y += lineHeight;
  }

  return canvas;
}

const text: Renderer = {
  name: "text",

  async test(file: Blob): Promise<boolean> {
    if (!hasTextSignal(file)) return false;
    const head = new Uint8Array(await file.slice(0, 4096).arrayBuffer());
    if (head.length === 0) return false;
    // UTF-16 text is full of NUL bytes by design — trust the BOM and skip the
    // binary guard for it.
    if (head[0] === 0xff && head[1] === 0xfe) return true;
    if (head[0] === 0xfe && head[1] === 0xff) return true;
    // Otherwise a NUL byte in the head is a reliable "this is not text" signal.
    return !head.includes(0x00);
  },

  async render(file: Blob, opts: RenderOptions): Promise<HTMLCanvasElement> {
    throwIfAborted(opts.signal);
    const bytes = new Uint8Array(await file.slice(0, MAX_BYTES).arrayBuffer());
    throwIfAborted(opts.signal);
    return drawText(decodeText(bytes), opts);
  },

  // Text only needs the head, so range-fetch it instead of the whole file.
  async renderFromURL(url: string, opts: RenderOptions): Promise<HTMLCanvasElement> {
    throwIfAborted(opts.signal);
    const res = await fetch(url, {
      signal: opts.signal,
      headers: { Range: `bytes=0-${MAX_BYTES - 1}` },
    });
    if (!res.ok && res.status !== 206) {
      throw new Error(`thumbnailjs: text fetch failed for "${url}": ${res.status}`);
    }
    const head = (await res.blob()).slice(0, MAX_BYTES);
    const bytes = new Uint8Array(await head.arrayBuffer());
    throwIfAborted(opts.signal);
    return drawText(decodeText(bytes), opts);
  },
};

export default text;
