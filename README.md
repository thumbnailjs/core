# thumbnailjs

> Tiny browser-only library that turns any file into a thumbnail.

## Install

```
npm install @thumbnailjs/core
```

## Quick start

```ts
import { thumbnail } from '@thumbnailjs/core';

const blob = await thumbnail(file);
img.src = URL.createObjectURL(blob);
```

Works out of the box for images, video, SVG, PDF, text, and Office/ODF
documents. Three lines.

## Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `width` | `number` | `256` | Target width in pixels |
| `height` | `number` | auto | Target height (preserves aspect ratio if omitted) |
| `format` | `'blob' \| 'dataurl' \| 'canvas'` | `'blob'` | Output format |
| `type` | `string` | `'image/png'` | Encoding MIME type for `blob`/`dataurl` outputs (`image/png`, `image/jpeg`, `image/webp`) |
| `quality` | `number` | — | Encoder quality (0–1) for lossy types (JPEG, WebP) |
| `fit` | `'contain' \| 'cover'` | `'contain'` | How to fit the image |
| `background` | `string` | `'transparent'` | Canvas fill color |
| `signal` | `AbortSignal` | — | Cancellation signal |

## Output encoding

PNG is lossless and universal, but large and slow to encode — for photographic
thumbnails, WebP or JPEG is typically ~10× smaller and much faster:

```ts
const blob = await thumbnail(file, { width: 512, type: 'image/webp', quality: 0.8 });
```

Two caveats:

- Engines that can't encode a type **silently fall back to PNG** (that's the
  spec). WebP encoding is supported by Chromium-based engines but not by all
  WebKit builds. Check the returned `blob.type`, or probe upfront:

  ```ts
  import { canEncode } from '@thumbnailjs/core';

  const type = canEncode('image/webp') ? 'image/webp' : 'image/jpeg';
  ```

- JPEG has no alpha channel — pair it with an opaque `background`:

  ```ts
  await thumbnail(file, { type: 'image/jpeg', quality: 0.8, background: '#fff' });
  ```

## Cancellation

Pass an `AbortSignal` and `thumbnail()` rejects with the signal's reason
(`AbortError` by default) as soon as it fires — including mid-decode,
mid-render, and before the encode step. Built-in renderers tear down their
work (video elements stop buffering, pdf.js transports are destroyed); the
promise rejects promptly even if a custom renderer ignores the signal.

```ts
const controller = new AbortController();
const promise = thumbnail(file, { signal: controller.signal });
controller.abort(); // promise rejects with AbortError
```

## URL inputs stream

When the input is a URL string, `thumbnail()` identifies the file from its
first 4 KB (a `Range` request) and then lets the underlying engine stream:

- **Video** → the URL goes straight to a `<video>` element, which
  range-requests only the bytes it needs for the poster frame — a multi-GB
  file is never downloaded.
- **PDF** → the URL goes straight to pdf.js, which fetches only the chunks
  the first page needs.
- **Images / SVG** → fetched in full (decoding needs every byte anyway).
- **Unknown types** → the fallback icon is drawn from the sniffed head
  alone; the file is never downloaded.

Requirements: the server should support `Range` requests (otherwise the
whole body is used, as before) and responses must be CORS-readable — the
streaming paths set `crossOrigin="anonymous"`, and a non-CORS response would
taint the canvas. Servers that reject the ranged request entirely are
retried with a plain fetch.

## PDF: offline / self-hosted worker

pdf.js renders in a worker. By default thumbnailjs loads that worker from
the jsDelivr CDN — fine for online web apps, wrong for offline or packaged
apps (Electron, Tauri). Point it at a bundled copy instead:

```ts
import { thumbnail } from '@thumbnailjs/core';
// Vite:
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

thumbnail.configure({ pdfWorkerSrc: workerUrl });
```

Precedence: `configure()` > a `GlobalWorkerOptions.workerSrc` your app set
directly > the CDN default. pdf.js itself is always lazy-loaded on the first
PDF, never from a CDN.

## Custom renderer

```ts
import { thumbnail } from '@thumbnailjs/core';
import type { Renderer } from '@thumbnailjs/core';

const heic: Renderer = {
  name: 'heic',
  test: file => file.type === 'image/heic',
  render: async (file, opts) => { /* ... return canvas */ },
};

thumbnail.use(heic);
```

Renderers should honor `opts.signal`. Two URL-input details: `test()` may
receive only the file's head (first ~4 KB) rather than the full file, and a
renderer can opt into streaming by implementing
`renderFromURL(url, opts)` — it will be preferred over `render()` for URL
inputs.

## API

### `thumbnail(input, options?)`

Generate a thumbnail. `input` can be a `File`, `Blob`, `ArrayBuffer`, or URL string.

### `thumbnail.use(renderer)`

Add a custom renderer to the registry. Renderers are tested in registration order; the first match wins.

### `thumbnail.reset()`

Reset the renderer registry to the built-in defaults. Intended for tests.

### `thumbnail.configure(config)`

Library-wide settings. Currently: `pdfWorkerSrc` (see above).

### `canEncode(type)`

Whether this engine's canvas encoder supports a MIME type (memoized probe).

## Built-in renderers

| Format | Detection |
|--------|-----------|
| PDF | `application/pdf` MIME type or `%PDF-` magic bytes. pdf.js is lazy-loaded on first use. |
| SVG | `image/svg+xml` MIME type or `<svg` / `<?xml` content sniffing |
| Images | Any `image/*` MIME type (PNG, JPEG, GIF, WebP, BMP, etc.) |
| Video | Magic-byte detection for MP4, WebM, AVI, MOV, etc. |
| Text | `text/*` MIME or a text extension (txt, md, csv, json, log, source code, …). Renders the file's first lines as a monospaced page, decoding UTF-8/UTF-16/Windows-1252. Gated on a positive text signal, so binary files are never mis-rendered. For URL inputs only the head is range-fetched. |
| Office / ODF | OpenDocument (odt/ods/odp) and Office Open XML (docx/pptx/xlsx). Extracts the preview embedded in the package — ODF's `Thumbnails/thumbnail.png`, or `docProps/thumbnail.*` — with a dependency-free native unzip. A document with no embedded thumbnail falls through to the type icon. |
| Unknown | Fallback icon with file-type label and colour-coded background |

## License

MIT
