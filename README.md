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

Works out of the box for images, video, SVG, and PDF. Three lines.

## Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `width` | `number` | `256` | Target width in pixels |
| `height` | `number` | auto | Target height (preserves aspect ratio if omitted) |
| `format` | `'blob' \| 'dataurl' \| 'canvas'` | `'blob'` | Output format |
| `fit` | `'contain' \| 'cover'` | `'contain'` | How to fit the image |
| `background` | `string` | `'transparent'` | Canvas fill color |
| `signal` | `AbortSignal` | — | Cancellation signal |

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

## API

### `thumbnail(input, options?)`

Generate a thumbnail. `input` can be a `File`, `Blob`, `ArrayBuffer`, or URL string.

### `thumbnail.use(renderer)`

Add a custom renderer to the registry. Renderers are tested in registration order; the first match wins.

### `thumbnail.reset()`

Reset the renderer registry to the built-in defaults. Intended for tests.

## Built-in renderers

| Format | Detection |
|--------|-----------|
| PDF | `application/pdf` MIME type or `%PDF-` magic bytes. pdf.js is lazy-loaded on first use. |
| SVG | `image/svg+xml` MIME type or `<svg` / `<?xml` content sniffing |
| Images | Any `image/*` MIME type (PNG, JPEG, GIF, WebP, BMP, etc.) |
| Video | Magic-byte detection for MP4, WebM, AVI, MOV, etc. |
| Unknown | Fallback icon with file-type label and colour-coded background |

## License

MIT
