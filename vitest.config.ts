import { defineConfig } from "vitest/config";
import path from "path";

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
      providerOptions: {
        capabilities: {
          browserName: "chrome",
          "goog:chromeOptions": {
            binary: "/usr/bin/chromium",
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
