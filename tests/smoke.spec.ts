import { test, expect } from "@playwright/test";

// Starter suite — proves the harness works end to end. The generator agent
// adds real feature specs alongside this file; keep one assertion style:
// role/label-based locators, no CSS-class selectors (they change constantly).

test("check-in board renders with KPI strip", async ({ page }) => {
  await page.goto("/reservations");
  await expect(page.getByRole("heading", { name: "Check-in Board" })).toBeVisible();
  // "Checked In" appears in both the KPI strip and the "Currently Checked In"
  // section heading after the dashboard redesign — assert the section, which
  // is unique.
  await expect(page.getByText("Currently Checked In")).toBeVisible();
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
  // Animal-name links go to the ANIMAL page; the run card lives on the
  // reservation. Route through the row's ⋮ menu -> View Reservation Details.
  await page.goto("/reservations");
  const row = page.getByRole("row", { name: /Ruby/ }).first();
  await row.getByRole("button", { name: "⋮" }).click();
  await page.getByRole("link", { name: /View Reservation Details/ }).click();
  await page.getByRole("link", { name: /Preview Run Card/ }).click();
  await expect(page.getByText(/Run Card/).first()).toBeVisible();
  await expect(page.getByText(/Feeding:/).first()).toBeVisible();
});

test("parents list has clickable phone links", async ({ page }) => {
  await page.goto("/parents");
  const tel = page.locator('a[href^="tel:"]').first();
  await expect(tel).toBeVisible();
});
