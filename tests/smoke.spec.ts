import { test, expect } from "@playwright/test";

// Starter suite — proves the harness works end to end. The generator agent
// adds real feature specs alongside this file; keep one assertion style:
// role/label-based locators, no CSS-class selectors (they change constantly).

test("check-in board renders with KPI strip", async ({ page }) => {
  await page.goto("/reservations");
  await expect(page.getByRole("heading", { name: "Check-in Board" })).toBeVisible();
  await expect(page.getByText("Checked In")).toBeVisible();
  await expect(page.getByText("Service mix")).toBeVisible();
});

test("animals list loads and search filters", async ({ page }) => {
  await page.goto("/animals");
  await expect(page.getByRole("heading", { name: "Animals" })).toBeVisible();
  const search = page.getByPlaceholder(/Search by animal/i);
  await search.fill("Ruby");
  await expect(page.getByRole("link", { name: /Ruby/ }).first()).toBeVisible();
});

test("animal detail shows QA seed data", async ({ page }) => {
  await page.goto("/animals");
  await page.getByPlaceholder(/Search by animal/i).fill("Ruby");
  await page.getByRole("link", { name: /Ruby/ }).first().click();
  await expect(page.getByRole("heading", { name: "Ruby" })).toBeVisible();
  // Labelled tag chip (not just a bare emoji) added for exactly this reason.
  await expect(page.getByText("QA Test Data").first()).toBeVisible();
});

test("run card preview renders without printing", async ({ page }) => {
  // The seeded checked-in QA reservation for Ruby.
  await page.goto("/reservations");
  await page.getByRole("link", { name: /Ruby/ }).first().click();
  await page.getByRole("link", { name: /Preview Run Card/ }).click();
  await expect(page.getByText(/Run Card/)).toBeVisible();
  await expect(page.getByText(/Feeding:/)).toBeVisible();
});

test("parents list has clickable phone links", async ({ page }) => {
  await page.goto("/parents");
  const tel = page.locator('a[href^="tel:"]').first();
  await expect(tel).toBeVisible();
});
