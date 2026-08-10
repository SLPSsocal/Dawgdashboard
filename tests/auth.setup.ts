import { test as setup, expect } from "@playwright/test";

// Exchanges the QA token for the app's normal session cookie once, and saves
// the browser state for every other test. See /qa-login — it 404s if the env
// var isn't configured on the server, and 403s on a wrong token, both of
// which produce a clear failure here instead of every test dying cryptically.
setup("authenticate via /qa-login", async ({ page }) => {
  const token = process.env.QA_ACCESS_TOKEN;
  if (!token) {
    throw new Error(
      "QA_ACCESS_TOKEN is not set. Export it (or put it in .env.qa.local and use dotenv) before running tests."
    );
  }

  const res = await page.goto(`/qa-login?token=${token}`);
  if (res && res.status() === 404) {
    throw new Error(
      "/qa-login returned 404 — QA_ACCESS_TOKEN isn't configured on the SERVER (Vercel env var). Set it and redeploy."
    );
  }

  // A successful login redirects into the Check-in Board.
  await expect(page).toHaveURL(/\/reservations/);
  await expect(page.getByRole("heading", { name: "Check-in Board" })).toBeVisible();

  await page.context().storageState({ path: "test-results/.auth/qa.json" });
});
