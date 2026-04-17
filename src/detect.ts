// ---------------------------------------------------------------------------
// detect.ts — Magic-byte file-type detection
// ---------------------------------------------------------------------------
// Reads the first bytes of a Blob and matches against known binary signatures.
// Falls back to the blob's `.type` property, then to the extension extracted
// from `File.name` when magic bytes are inconclusive.
// ---------------------------------------------------------------------------

/** Describes a detected file type. */
export interface FileSignature {
  /** MIME type, e.g. "image/png" */
  mime: string;
  /** Canonical file extension without the dot, e.g. "png" */
  ext: string;
  /** Broad category used for fallback-icon colouring */
  family: 'image' | 'video' | 'document' | 'spreadsheet' | 'presentation' | 'unknown';
}

/** Colours associated with each family — consumed by the fallback icon renderer. */
export const familyColors: Record<string, string> = {
  image: '#4A90D9',
  video: '#D94A4A',
  document: '#4A7FD9',
  spreadsheet: '#4AAF5A',
  presentation: '#E8913A',
  unknown: '#888888',
};

// ---- internal helpers -----------------------------------------------------

/** Read the first `n` bytes of a blob into a Uint8Array. */
async function readBytes(blob: Blob, n: number): Promise<Uint8Array> {
  const slice = blob.slice(0, n);
  const buf = await slice.arrayBuffer();
  return new Uint8Array(buf);
}

/** Check whether `bytes` starts with the given `signature` at `offset`. */
function matchesAt(bytes: Uint8Array, signature: number[], offset = 0): boolean {
  if (bytes.length < offset + signature.length) return false;
  for (let i = 0; i < signature.length; i++) {
    if (bytes[offset + i] !== signature[i]) return false;
  }
  return true;
}

/** Decode a region of bytes as an ASCII string. */
function asciiSlice(bytes: Uint8Array, start: number, end: number): string {
  let s = '';
  const limit = Math.min(end, bytes.length);
  for (let i = start; i < limit; i++) {
    s += String.fromCharCode(bytes[i]);
  }
  return s;
}

/** Extract the lowercased extension from a File name (without the dot). */
function extFromName(name: string): string {
  const idx = name.lastIndexOf('.');
  if (idx === -1 || idx === name.length - 1) return '';
  return name.substring(idx + 1).toLowerCase();
}

// ---- MIME → family mapping ------------------------------------------------

const MIME_FAMILY: Record<string, FileSignature['family']> = {
  'image/png': 'image',
  'image/jpeg': 'image',
  'image/gif': 'image',
  'image/webp': 'image',
  'image/bmp': 'image',
  'image/tiff': 'image',
  'image/svg+xml': 'image',
  'image/avif': 'image',
  'video/mp4': 'video',
  'video/webm': 'video',
  'video/x-msvideo': 'video',
  'video/quicktime': 'video',
  'application/pdf': 'document',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'spreadsheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'presentation',
};

function familyForMime(mime: string): FileSignature['family'] {
  if (MIME_FAMILY[mime]) return MIME_FAMILY[mime];
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  return 'unknown';
}

// ---- Extension → signature table (used as final fallback) -----------------

const EXT_MAP: Record<string, Omit<FileSignature, 'family'> & { family: FileSignature['family'] }> = {
  png:  { mime: 'image/png',       ext: 'png',  family: 'image' },
  jpg:  { mime: 'image/jpeg',      ext: 'jpg',  family: 'image' },
  jpeg: { mime: 'image/jpeg',      ext: 'jpeg', family: 'image' },
  gif:  { mime: 'image/gif',       ext: 'gif',  family: 'image' },
  webp: { mime: 'image/webp',      ext: 'webp', family: 'image' },
  bmp:  { mime: 'image/bmp',       ext: 'bmp',  family: 'image' },
  tif:  { mime: 'image/tiff',      ext: 'tif',  family: 'image' },
  tiff: { mime: 'image/tiff',      ext: 'tiff', family: 'image' },
  svg:  { mime: 'image/svg+xml',   ext: 'svg',  family: 'image' },
  avif: { mime: 'image/avif',      ext: 'avif', family: 'image' },
  pdf:  { mime: 'application/pdf', ext: 'pdf',  family: 'document' },
  mp4:  { mime: 'video/mp4',       ext: 'mp4',  family: 'video' },
  webm: { mime: 'video/webm',      ext: 'webm', family: 'video' },
  avi:  { mime: 'video/x-msvideo', ext: 'avi',  family: 'video' },
  mov:  { mime: 'video/quicktime',  ext: 'mov',  family: 'video' },
  docx: {
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ext: 'docx',
    family: 'document',
  },
  xlsx: {
    mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ext: 'xlsx',
    family: 'spreadsheet',
  },
  pptx: {
    mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    ext: 'pptx',
    family: 'presentation',
  },
};

// ---- MIME string → signature (used when magic bytes fail) -----------------

const MIME_MAP: Record<string, FileSignature> = {};
for (const sig of Object.values(EXT_MAP)) {
  if (!MIME_MAP[sig.mime]) {
    MIME_MAP[sig.mime] = { mime: sig.mime, ext: sig.ext, family: sig.family };
  }
}

// ---- Office ZIP sub-detection ---------------------------------------------

/**
 * When we detect a ZIP (PK\x03\x04) header we try to further classify it
 * as docx / xlsx / pptx using the blob's MIME type or File name.
 */
function classifyZip(blob: Blob): FileSignature {
  // Try MIME type first
  const blobType = blob.type?.toLowerCase() ?? '';
  if (blobType && MIME_MAP[blobType]) {
    return { ...MIME_MAP[blobType] };
  }

  // Try extension from File.name
  if ('name' in blob && typeof (blob as File).name === 'string') {
    const ext = extFromName((blob as File).name);
    if (ext === 'docx') return { ...EXT_MAP.docx };
    if (ext === 'xlsx') return { ...EXT_MAP.xlsx };
    if (ext === 'pptx') return { ...EXT_MAP.pptx };
  }

  // Generic ZIP
  return { mime: 'application/zip', ext: 'zip', family: 'unknown' };
}

// ---- SVG detection (text-based) -------------------------------------------

async function checkSvg(blob: Blob): Promise<FileSignature | null> {
  // Read up to 256 bytes as text and look for <svg
  const slice = blob.slice(0, 256);
  try {
    const text = await slice.text();
    const trimmed = text.trimStart().toLowerCase();
    if (trimmed.startsWith('<svg') || (trimmed.startsWith('<?xml') && trimmed.includes('<svg'))) {
      return { mime: 'image/svg+xml', ext: 'svg', family: 'image' };
    }
  } catch {
    // Not text — ignore
  }
  return null;
}

// ---- ftyp brand helpers ---------------------------------------------------

/** ISO base media (MP4-family) files have 'ftyp' at offset 4. Return the 4-char brand. */
function ftypBrand(bytes: Uint8Array): string | null {
  if (bytes.length < 12) return null;
  const ftyp = asciiSlice(bytes, 4, 8);
  if (ftyp !== 'ftyp') return null;
  return asciiSlice(bytes, 8, 12);
}

// ---- main detect ----------------------------------------------------------

const UNKNOWN_SIGNATURE: FileSignature = { mime: 'application/octet-stream', ext: '', family: 'unknown' };

/**
 * Detect the type of a file by reading its magic bytes.
 *
 * Falls back to the blob's `.type` property, then to the extension
 * from `File.name` if the blob is actually a `File`.
 */
export async function detect(file: Blob): Promise<FileSignature> {
  // We read 16 bytes for most signatures.  SVG needs more (handled separately).
  const bytes = await readBytes(file, 16);

  // ---- PNG: 89 50 4E 47 ------------------------------------------------
  if (matchesAt(bytes, [0x89, 0x50, 0x4E, 0x47])) {
    return { mime: 'image/png', ext: 'png', family: 'image' };
  }

  // ---- JPEG: FF D8 FF ---------------------------------------------------
  if (matchesAt(bytes, [0xFF, 0xD8, 0xFF])) {
    return { mime: 'image/jpeg', ext: 'jpg', family: 'image' };
  }

  // ---- GIF: 47 49 46 ("GIF") -------------------------------------------
  if (matchesAt(bytes, [0x47, 0x49, 0x46])) {
    return { mime: 'image/gif', ext: 'gif', family: 'image' };
  }

  // ---- RIFF-based: WebP and AVI -----------------------------------------
  if (matchesAt(bytes, [0x52, 0x49, 0x46, 0x46])) {
    // RIFF....WEBP
    const fourcc = asciiSlice(bytes, 8, 12);
    if (fourcc === 'WEBP') {
      return { mime: 'image/webp', ext: 'webp', family: 'image' };
    }
    // RIFF....AVI
    if (fourcc === 'AVI ') {
      return { mime: 'video/x-msvideo', ext: 'avi', family: 'video' };
    }
  }

  // ---- BMP: 42 4D -------------------------------------------------------
  if (matchesAt(bytes, [0x42, 0x4D])) {
    return { mime: 'image/bmp', ext: 'bmp', family: 'image' };
  }

  // ---- TIFF (little-endian): 49 49 2A 00 --------------------------------
  if (matchesAt(bytes, [0x49, 0x49, 0x2A, 0x00])) {
    return { mime: 'image/tiff', ext: 'tiff', family: 'image' };
  }

  // ---- TIFF (big-endian): 4D 4D 00 2A -----------------------------------
  if (matchesAt(bytes, [0x4D, 0x4D, 0x00, 0x2A])) {
    return { mime: 'image/tiff', ext: 'tiff', family: 'image' };
  }

  // ---- PDF: 25 50 44 46 (%PDF) ------------------------------------------
  if (matchesAt(bytes, [0x25, 0x50, 0x44, 0x46])) {
    return { mime: 'application/pdf', ext: 'pdf', family: 'document' };
  }

  // ---- ZIP (and Office Open XML): 50 4B 03 04 ---------------------------
  if (matchesAt(bytes, [0x50, 0x4B, 0x03, 0x04])) {
    return classifyZip(file);
  }

  // ---- ISO base media / ftyp family (MP4, MOV, AVIF) --------------------
  const brand = ftypBrand(bytes);
  if (brand !== null) {
    // AVIF
    if (brand === 'avif' || brand === 'avis') {
      return { mime: 'image/avif', ext: 'avif', family: 'image' };
    }
    // QuickTime / MOV
    if (brand === 'qt  ') {
      return { mime: 'video/quicktime', ext: 'mov', family: 'video' };
    }
    // Everything else with ftyp is assumed MP4-family
    return { mime: 'video/mp4', ext: 'mp4', family: 'video' };
  }

  // ---- MOV without standard ftyp: 'moov' or 'mdat' at offset 4 ----------
  {
    const tag = asciiSlice(bytes, 4, 8);
    if (tag === 'moov' || tag === 'mdat') {
      return { mime: 'video/quicktime', ext: 'mov', family: 'video' };
    }
  }

  // ---- WebM / Matroska: 1A 45 DF A3 -------------------------------------
  if (matchesAt(bytes, [0x1A, 0x45, 0xDF, 0xA3])) {
    return { mime: 'video/webm', ext: 'webm', family: 'video' };
  }

  // ---- SVG (text-based, needs more bytes) --------------------------------
  const svg = await checkSvg(file);
  if (svg) return svg;

  // ---- Fallback 1: trust the blob's MIME type ----------------------------
  const blobType = file.type?.toLowerCase() ?? '';
  if (blobType && blobType !== 'application/octet-stream') {
    const mapped = MIME_MAP[blobType];
    if (mapped) return { ...mapped };
    // Unknown MIME — still better than nothing
    const ext = blobType.split('/').pop() ?? '';
    return { mime: blobType, ext, family: familyForMime(blobType) };
  }

  // ---- Fallback 2: derive from File.name extension ----------------------
  if ('name' in file && typeof (file as File).name === 'string') {
    const ext = extFromName((file as File).name);
    if (ext && EXT_MAP[ext]) {
      return { ...EXT_MAP[ext] };
    }
    if (ext) {
      return { mime: 'application/octet-stream', ext, family: 'unknown' };
    }
  }

  // ---- Give up -----------------------------------------------------------
  return { ...UNKNOWN_SIGNATURE };
}
