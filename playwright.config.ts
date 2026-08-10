import { defineConfig, devices } from "@playwright/test";

// Target is controlled by env so the same suite runs against production QA
// mode or a local dev server:
//   QA_BASE_URL   e.g. https://dawgdashboard.vercel.app  (default)
//   QA_ACCESS_TOKEN  the /qa-login token — NEVER commit this. The repo is
//                    public; the token lives only in env / .env.qa.local.
export default defineConfig({
  testDir: "./tests",
  timeout: 30_000,
  retries: 1,
  workers: 2,
  reporter: [["list"], ["html", { open: "never" }], ["json", { outputFile: "test-results/results.json" }]],
  use: {
    baseURL: process.env.QA_BASE_URL || "https://dawgdashboard.vercel.app",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    // setup signs in once via /qa-login and saves the session cookie;
    // every other test reuses it instead of logging in per-test.
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], storageState: "test-results/.auth/qa.json" },
      dependencies: ["setup"],
    },
  ],
});
