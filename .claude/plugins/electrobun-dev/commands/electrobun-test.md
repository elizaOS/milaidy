---
name: electrobun-test
description: Run Electrobun Kitchen Sink tests, write new test coverage, or generate the feature manifest. Works with both automated and interactive test suites.
---

Work with the Electrobun Kitchen Sink test suite.

## Steps

1. **Ask the user what they want to do:**
   - A) Run specific test(s) by name or category
   - B) Run all automated tests (headless)
   - C) Write a new test for a specific API or feature
   - D) Generate/validate the feature manifest
   - E) Understand what's already covered for a given API

2. **For option A — Run specific tests:**
   Read `kitchen/src/generated/feature-manifest.json` to find matching test IDs.
   ```bash
   # Single test
   AUTO_RUN_TEST_NAME="<test title>" electrobun dev

   # Or filter by category using AUTO_RUN_TEST_NAME with a category keyword
   ```
   Stream output. Report pass/fail with any error messages.

3. **For option B — Run all automated:**
   ```bash
   cd kitchen
   AUTO_RUN=1 electrobun dev
   ```
   Stream output. On completion: summarize total/passed/failed. Exit 0 = all pass.

4. **For option C — Write a new test:**
   - Ask: what API or feature to test?
   - Read the relevant existing test file from `kitchen/src/tests/` to understand patterns
   - Write a new `defineTest()` entry using:
     - Unique `id` (kebab-case)
     - Correct `category` matching existing categories
     - `interactive: false` for automated, `true` for human-required
     - `apiSurface` listing the Electrobun APIs exercised
   - Add the test to the suite array in the appropriate test file
   - Register in `kitchen/src/tests/index.ts` if it's a new file
   - Regenerate manifest: `npx tsx scripts/generate-manifest.ts`
   - Validate: `npx tsx scripts/validate-manifest.ts`
   - Run the new test to verify it passes

5. **For option D — Manifest operations:**
   ```bash
   cd kitchen
   npx tsx scripts/generate-manifest.ts   # regenerate
   npx tsx scripts/validate-manifest.ts   # check consistency
   ```
   Report: any validation errors or "All checks passed".

6. **For option E — Coverage analysis:**
   ```bash
   # Check what's covered for a specific API
   jq '[.[] | select(.apiSurface | contains(["BrowserWindow"]))]' \
     kitchen/src/generated/feature-manifest.json | jq 'length, .[].title'
   ```
   Report which methods are covered and which are missing based on the function inventory.
