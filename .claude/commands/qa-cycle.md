---
description: Full automated QA cycle — plan, generate, run & heal, then summarize
---

Run one full QA cycle on Dawg Dashboard using the three QA subagents, in order:

1. Launch the **qa-planner** subagent to explore the app and update
   `tests/PLAN.md`. If the plan already exists, it should incorporate recent
   git changes rather than starting over.
2. Launch the **qa-generator** subagent to implement the highest-priority
   `planned` scenarios as Playwright specs (a handful per cycle, not all).
3. Launch the **qa-healer** subagent to run the suite, repair test-side
   failures, and file app bugs in `tests/HEAL-REPORT.md`.
4. Read `tests/HEAL-REPORT.md` and `tests/PLAN.md`, then give me a short
   summary: suite status, what coverage was added this cycle, and — most
   importantly — any real app bugs found, each with repro steps.

Preconditions to verify before step 1 (fail fast with a clear message):
- `QA_ACCESS_TOKEN` is set in the environment.
- `npx playwright --version` works; if browsers are missing, run
  `npx playwright install chromium`.

$ARGUMENTS
