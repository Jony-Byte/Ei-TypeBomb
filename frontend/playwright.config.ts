import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./test/browser",
  testMatch: "*.spec.ts",
  fullyParallel: false,
  use: { baseURL: "http://127.0.0.1:3101" },
  webServer: [{
    command: "node test/browser/selection-server.mjs",
    url: "http://127.0.0.1:3101",
  }, {
    command: "next dev test/browser/room-app --port 3102",
    url: "http://127.0.0.1:3102/room-0",
    timeout: 120_000,
    env: { NEXT_TELEMETRY_DISABLED: "1", NEXT_PUBLIC_JOIN_LINK: "http://127.0.0.1:3102" },
  }],
  projects: [
    { name: "chromium", use: { browserName: "chromium" } },
    { name: "webkit", use: { browserName: "webkit" } },
  ],
});
