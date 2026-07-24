// ---------------------------------------------------------------------------
// unzip.ts — extract a single entry from a ZIP, dependency-free
// ---------------------------------------------------------------------------
// Enough of the ZIP format to pull one known-path entry (e.g. an embedded
// thumbnail) out of an Office/ODF/EPUB package without a library: locate the
// End-of-Central-Directory record, read the central directory (the
// authoritative source for each entry's size, offset, and method), then slice
// and inflate just the target entry with the native DecompressionStream.
//
// Scope: STORED (0) and DEFLATE (8) entries. ZIP64 and encrypted entries are
// out of scope (thumbnails never need them) and yield `null`.
// ---------------------------------------------------------------------------

const SIG_LOCAL = 0x04034b50; // PK\x03\x04
const SIG_CENTRAL = 0x02014b50; // PK\x01\x02
const SIG_EOCD = 0x06054b50; // PK\x05\x06

const MAX_EOCD_SCAN = 22 + 0xffff; // record size + max comment length

async function bytesOf(
  blob: Blob,
  start: number,
  end: number,
): Promise<Uint8Array<ArrayBuffer>> {
  return new Uint8Array(await blob.slice(start, end).arrayBuffer());
}

function dataViewOf(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

/** Inflate raw DEFLATE bytes using the native DecompressionStream. */
async function inflateRaw(data: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  const stream = new Blob([data]).stream().pipeThrough(
    new DecompressionStream("deflate-raw"),
  );
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * Return the decompressed bytes of the entry named `name`, or `null` when the
 * archive is unreadable, the entry is absent, or its compression method is
 * unsupported.
 */
export async function unzipEntry(
  blob: Blob,
  name: string,
): Promise<Uint8Array<ArrayBuffer> | null> {
  const size = blob.size;
  if (size < 22) return null;

  // ---- End of Central Directory (scan the tail for its signature) --------
  const tailLen = Math.min(size, MAX_EOCD_SCAN);
  const tail = await bytesOf(blob, size - tailLen, size);
  const tdv = dataViewOf(tail);
  let eocd = -1;
  for (let i = tail.length - 22; i >= 0; i--) {
    if (tdv.getUint32(i, true) === SIG_EOCD) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return null;

  const cdSize = tdv.getUint32(eocd + 12, true);
  const cdOffset = tdv.getUint32(eocd + 16, true);
  if (cdOffset + cdSize > size) return null; // ZIP64 or corrupt → decline

  // ---- Central directory: find the entry ---------------------------------
  const cd = await bytesOf(blob, cdOffset, cdOffset + cdSize);
  const cdv = dataViewOf(cd);
  let p = 0;
  while (p + 46 <= cd.length && cdv.getUint32(p, true) === SIG_CENTRAL) {
    const method = cdv.getUint16(p + 10, true);
    const compSize = cdv.getUint32(p + 20, true);
    const fnLen = cdv.getUint16(p + 28, true);
    const extraLen = cdv.getUint16(p + 30, true);
    const commentLen = cdv.getUint16(p + 32, true);
    const localOffset = cdv.getUint32(p + 42, true);
    const fname = new TextDecoder().decode(cd.subarray(p + 46, p + 46 + fnLen));

    if (fname === name) {
      // Local header lengths can differ from the central ones, so read them.
      const lh = await bytesOf(blob, localOffset, localOffset + 30);
      const ldv = dataViewOf(lh);
      if (lh.length < 30 || ldv.getUint32(0, true) !== SIG_LOCAL) return null;
      const dataStart =
        localOffset + 30 + ldv.getUint16(26, true) + ldv.getUint16(28, true);
      const comp = await bytesOf(blob, dataStart, dataStart + compSize);
      if (method === 0) return comp;
      if (method === 8) return await inflateRaw(comp);
      return null; // unsupported compression method
    }

    p += 46 + fnLen + extraLen + commentLen;
  }

  return null; // entry not found
}
