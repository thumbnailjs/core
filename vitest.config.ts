import { defineConfig } from "vitest/config";
import path from "path";
import { createServer, type Server } from "node:http";
import { promises as fs } from "node:fs";

// ---------------------------------------------------------------------------
// Fixture HTTP server (exposed to tests as custom browser commands)
// ---------------------------------------------------------------------------
// Serves test/fixtures (plus the local pdf.js worker) over real HTTP with
// Range and CORS support, so the URL-streaming pipeline can be exercised
// end-to-end: head sniffing (206 + Content-Range), media range requests,
// and the pdf.js range transport. Object URLs can't express any of that.

const MIME: Record<string, string> = {
  ".pdf": "application/pdf",
  ".webm": "video/webm",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".bmp": "image/bmp",
  ".svg": "image/svg+xml",
  ".mjs": "text/javascript",
};

let server: Server | null = null;
let serverUrl: Promise<string> | null = null;
const requestLog: string[] = [];

function startFixtureServer(): Promise<string> {
  if (serverUrl) return serverUrl;
  serverUrl = new Promise((resolve, reject) => {
    server = createServer(async (req, res) => {
      const cors: Record<string, string> = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
        "Access-Control-Allow-Headers": "Range",
        "Access-Control-Expose-Headers":
          "Content-Range, Accept-Ranges, Content-Length",
      };
      try {
        const url = new URL(req.url ?? "/", "http://localhost");
        requestLog.push(
          `${req.method} ${url.pathname}` +
            (req.headers.range ? ` range=${req.headers.range}` : ""),
        );

        if (req.method === "OPTIONS") {
          res.writeHead(204, { ...cors, "Access-Control-Max-Age": "86400" });
          res.end();
          return;
        }

        let filePath: string;
        if (url.pathname === "/pdf.worker.min.mjs") {
          filePath = path.resolve(
            __dirname,
            "node_modules/pdfjs-dist/build/pdf.worker.min.mjs",
          );
        } else if (url.pathname.startsWith("/fixtures/")) {
          // basename() forbids path traversal
          filePath = path.resolve(
            __dirname,
            "test/fixtures",
            path.basename(url.pathname),
          );
        } else {
          res.writeHead(404, cors);
          res.end();
          return;
        }

        const data = await fs.readFile(filePath);
        const headers: Record<string, string> = {
          ...cors,
          "Content-Type":
            MIME[path.extname(filePath).toLowerCase()] ??
            "application/octet-stream",
          "Accept-Ranges": "bytes",
        };

        const m = req.headers.range?.match(/^bytes=(\d+)-(\d*)$/);
        if (m) {
          const start = Number(m[1]);
          const end = m[2] ? Math.min(Number(m[2]), data.length - 1) : data.length - 1;
          res.writeHead(206, {
            ...headers,
            "Content-Range": `bytes ${start}-${end}/${data.length}`,
            "Content-Length": String(end - start + 1),
          });
          res.end(data.subarray(start, end + 1));
        } else {
          res.writeHead(200, {
            ...headers,
            "Content-Length": String(data.length),
          });
          res.end(data);
        }
      } catch {
        res.writeHead(404, cors);
        res.end();
      }
    });
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const addr = server!.address();
      if (addr && typeof addr === "object") {
        resolve(`http://127.0.0.1:${addr.port}`);
      } else {
        reject(new Error("fixture server: no address"));
      }
    });
  });
  return serverUrl;
}

export default defineConfig({
  resolve: {
    alias: {
      thumbnailjs: path.resolve(__dirname, "src/index.ts"),
    },
  },
  test: {
    browser: {
      enabled: true,
      provider: "webdriverio",
      name: "chrome",
      headless: true,
      commands: {
        startFixtureServer: () => startFixtureServer(),
        getRequestLog: () => Promise.resolve([...requestLog]),
        clearRequestLog: () => {
          requestLog.length = 0;
          return Promise.resolve();
        },
      },
      providerOptions: {
        capabilities: {
          browserName: "chrome",
          // Browser and driver binaries are overridable via env vars so the
          // suite runs on other machines and in CI, not just this box. When
          // CHROMEDRIVER_BIN is unset, webdriverio manages a matching driver.
          ...(process.env.CHROMEDRIVER_BIN
            ? { "wdio:chromedriverOptions": { binary: process.env.CHROMEDRIVER_BIN } }
            : {}),
          "goog:chromeOptions": {
            binary: process.env.CHROME_BIN || "/usr/bin/chromium",
            args: [
              "--headless=new",
              "--no-sandbox",
              "--disable-gpu",
              "--disable-dev-shm-usage",
              "--disable-software-rasterizer",
            ],
          },
        },
      },
    },
    include: ["src/__tests__/**/*.test.ts", "test/**/*.test.ts"],
    fileParallelism: false,
  },
});
