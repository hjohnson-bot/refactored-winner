---
allowed-tools: Bash(node:*), Bash(npx:*), Bash(mv:*), Bash(ls:*), Bash(mkdir:*), Bash(date:*), Bash(cd:*)
description: Export the Advanced Jobs report from Knowify and save it to the AJR Reports folder
---

# Knowify Report Export

Export the Advanced Jobs report from Knowify via browser automation and save it to the AJR Reports folder.

## Instructions

Use the Playwright skill to automate the full workflow in Chrome. Write the automation script to `/tmp/knowify-export.js` and execute it.

### Step 0: Environment guard (run BEFORE anything else)

This command's destination is a **macOS OneDrive folder**. Check, in order:

1. `KNOWIFY_USERNAME` and `KNOWIFY_PASSWORD` env vars set? If either is missing, STOP with exactly:
   > Missing KNOWIFY_USERNAME / KNOWIFY_PASSWORD. Set them in your shell (never in a file) and rerun `/knowify-report`.
2. `uname -s` = Darwin AND the destination directory's parent (`~/Library/CloudStorage/OneDrive-MidwestDesignGroup/Finance/Knowify Reports`) exists?
   - If NOT (e.g., Linux/cloud session): do NOT fail silently. Instead, run the export but save to `./knowify-exports/Advanced Job Report MM.DD.YYYY.xlsx` in the current repo (gitignored-safe temp location), and clearly tell the user the file needs to be moved to OneDrive manually because this session cannot reach it.
3. Playwright available (`npx playwright --version` or the Playwright skill)? If not, install Chromium per Step 3's fallback.

### Step 1: Verify Prerequisites

1. Both env vars confirmed by Step 0
2. Playwright confirmed by Step 0
3. Determine today's date formatted as `MM.DD.YYYY` for the output filename

### Step 2: Write the Automation Script

Write a Playwright script to `/tmp/knowify-export.js` that does the following:

```javascript
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const KNOWIFY_USERNAME = process.env.KNOWIFY_USERNAME;
const KNOWIFY_PASSWORD = process.env.KNOWIFY_PASSWORD;

const DEST_DIR = path.join(
  process.env.HOME,
  'Library/CloudStorage/OneDrive-MidwestDesignGroup/Finance/Knowify Reports/AJR Reports'
);

(async () => {
  const browser = await chromium.launch({ headless: false, slowMo: 150 });
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();

  try {
    // 1. Navigate to Knowify login
    console.log('Navigating to Knowify login...');
    await page.goto('https://secure.knowify.com/#/login', { waitUntil: 'networkidle' });

    // 2. Log in
    console.log('Logging in...');
    await page.fill('input[type="email"], input[name="email"], input[placeholder*="mail"]', KNOWIFY_USERNAME);
    await page.fill('input[type="password"], input[name="password"]', KNOWIFY_PASSWORD);
    await page.click('button[type="submit"], button:has-text("Log In"), button:has-text("Sign In")');
    await page.waitForLoadState('networkidle');
    console.log('Logged in successfully');

    // 3. Navigate to Reports via left sidebar (hover to expand, then click)
    console.log('Navigating to Reports...');
    await page.hover('text=Reports');
    await page.waitForTimeout(500);
    await page.click('text=Reports');
    await page.waitForLoadState('networkidle');
    console.log('On Reports page');

    // 4. Select "Advanced Jobs" from the report dropdown
    console.log('Selecting Advanced Jobs report...');
    await page.click('select, [role="listbox"], .report-selector');
    await page.selectOption('select', { label: 'Advanced Jobs' });
    await page.waitForLoadState('networkidle');

    // 5. Set date range using triple-click + type (NOT form_input)
    console.log('Setting date range...');
    const startDateInput = page.locator('input[placeholder*="start"], input[name*="start"], input[name*="from"]').first();
    await startDateInput.click({ clickCount: 3 });
    await startDateInput.type('1/1/22');

    const endDateInput = page.locator('input[placeholder*="end"], input[name*="end"], input[name*="to"]').first();
    await endDateInput.click({ clickCount: 3 });
    await endDateInput.type('12/31/28');

    await page.waitForTimeout(1000);

    // 6. Click "Export full report" and handle download
    console.log('Exporting report...');
    const downloadPromise = page.waitForEvent('download');
    await page.click('text=Export full report');
    const download = await downloadPromise;

    // Save to Downloads first
    const downloadsDir = path.join(process.env.HOME, 'Downloads');
    const downloadPath = path.join(downloadsDir, download.suggestedFilename());
    await download.saveAs(downloadPath);
    console.log('Downloaded to:', downloadPath);

    // 7. Move to destination
    const today = new Date();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const yyyy = today.getFullYear();
    const destFilename = `Advanced Job Report ${mm}.${dd}.${yyyy}.xlsx`;
    let destPath = path.join(DEST_DIR, destFilename);

    // If file exists, add timestamp suffix
    if (fs.existsSync(destPath)) {
      const timestamp = `${today.getHours()}${String(today.getMinutes()).padStart(2, '0')}`;
      const suffixedName = `Advanced Job Report ${mm}.${dd}.${yyyy}_${timestamp}.xlsx`;
      destPath = path.join(DEST_DIR, suffixedName);
      console.log('File already exists, saving as:', suffixedName);
    }

    // Ensure destination directory exists
    fs.mkdirSync(DEST_DIR, { recursive: true });
    fs.renameSync(downloadPath, destPath);
    console.log('Moved to:', destPath);

  } catch (error) {
    console.error('Error:', error.message);
    await page.screenshot({ path: '/tmp/knowify-error.png', fullPage: true });
    console.error('Error screenshot saved to /tmp/knowify-error.png');
    throw error;
  } finally {
    // 8. Close browser
    await browser.close();
    console.log('Browser closed');
  }
})();
```

### Step 3: Execute the Script

Run the script using the Playwright skill runner:

```bash
cd $SKILL_DIR && KNOWIFY_USERNAME="$KNOWIFY_USERNAME" KNOWIFY_PASSWORD="$KNOWIFY_PASSWORD" node run.js /tmp/knowify-export.js
```

If the Playwright skill is not installed, fall back to running directly:

```bash
KNOWIFY_USERNAME="$KNOWIFY_USERNAME" KNOWIFY_PASSWORD="$KNOWIFY_PASSWORD" npx playwright install chromium && node /tmp/knowify-export.js
```

### Step 4: Verify and Report

1. Confirm the file was saved to the AJR Reports folder
2. Report the filename and destination path
3. If any errors occurred, show the error and reference the screenshot at `/tmp/knowify-error.png`

### Output Format (always end with this)

```
Knowify Export — <date>
──────────────────────────────────────────
Status:      ✅ Success | ❌ Failed at <step>
File:        Advanced Job Report MM.DD.YYYY.xlsx
Saved to:    <full destination path>
Size:        <file size>
Environment: macOS + OneDrive | Linux fallback (manual move needed)
──────────────────────────────────────────
```

On failure, add the error message and note the screenshot at `/tmp/knowify-error.png`.

### Retry rules

- One retry on login failure or timeout (Knowify's SPA is slow to hydrate). Two consecutive failures → stop and report; do not loop.
- If the "Advanced Jobs" option isn't found in the dropdown, screenshot and stop — the report name may have changed in Knowify; never guess a different report.

### Important Notes

- **Date fields**: Use triple-click + type to set dates, NOT form_input or fill. This ensures the existing value is fully selected and replaced.
- **Sidebar navigation**: The Knowify sidebar may be collapsed — hover first to expand it before clicking "Reports".
- **Download handling**: Use Playwright's download event API to capture the file, don't rely on filesystem watching.
- **Duplicate files**: If a file with today's date already exists in the destination, keep both by appending a timestamp suffix (HHMM).

### Do NOT

- Do NOT write credentials into `/tmp/knowify-export.js` or any file — pass them only via environment variables at execution time (the script template already reads `process.env`).
- Do NOT commit the exported .xlsx or the temp script to git.
- Do NOT export any report other than "Advanced Jobs" without being asked.
- Do NOT change the date range (1/1/22 → 12/31/28) unless the user specifies a different one.
- Do NOT leave the browser open after failure — the `finally` block must always run.
