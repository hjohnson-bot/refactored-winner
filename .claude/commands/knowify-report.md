---
allowed-tools: Bash(node:*), Bash(npx:*), Bash(mv:*), Bash(ls:*), Bash(mkdir:*), Bash(date:*), Bash(cd:*)
description: Export the Advanced Jobs report from Knowify and save it to the AJR Reports folder
---

# Knowify Report Export

Export the **Advanced Jobs Report (AJR)** from Knowify via browser automation and save it, dated, to the AJR Reports folder in OneDrive. This runs unattended on a daily schedule (`schedule.json`, 23:35), so it must be deterministic and fail loudly.

## What this produces

One Excel file per run, named `Advanced Job Report MM.DD.YYYY.xlsx`, saved to:

```
~/Library/CloudStorage/OneDrive-MidwestDesignGroup/Finance/Knowify Reports/AJR Reports/
```

The report covers a deliberately wide date range (1/1/22 → 12/31/28) so it captures all jobs regardless of start/end dates. This is Midwest Design Group LLC's Knowify tenant.

## Prerequisites

Both env vars must be set, or **stop immediately and tell the user to set them** — do not prompt for a password inline, do not hardcode credentials:

- `KNOWIFY_USERNAME` — Knowify login email
- `KNOWIFY_PASSWORD` — Knowify login password

Also assumes: macOS with the OneDrive path above synced, and Playwright available (the Playwright skill, or `npx playwright`).

## Process

### Step 1 — Verify prerequisites
1. Confirm `KNOWIFY_USERNAME` and `KNOWIFY_PASSWORD` are both set. If either is missing, stop and report which one.
2. Confirm Playwright is available (skill installed, or `npx playwright` usable).
3. Compute today's date as `MM.DD.YYYY` for the filename.

### Step 2 — Write the automation script
Write this Playwright script to `/tmp/knowify-export.js`:

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

    // 5. Set date range using triple-click + type (NOT fill/form_input)
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

    // 7. Move to destination, dated MM.DD.YYYY
    const today = new Date();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const yyyy = today.getFullYear();
    const destFilename = `Advanced Job Report ${mm}.${dd}.${yyyy}.xlsx`;
    let destPath = path.join(DEST_DIR, destFilename);

    // If a file for today already exists, keep both by appending HHMM
    if (fs.existsSync(destPath)) {
      const timestamp = `${today.getHours()}${String(today.getMinutes()).padStart(2, '0')}`;
      const suffixedName = `Advanced Job Report ${mm}.${dd}.${yyyy}_${timestamp}.xlsx`;
      destPath = path.join(DEST_DIR, suffixedName);
      console.log('File already exists, saving as:', suffixedName);
    }

    fs.mkdirSync(DEST_DIR, { recursive: true });
    fs.renameSync(downloadPath, destPath);
    console.log('Moved to:', destPath);

  } catch (error) {
    console.error('Error:', error.message);
    await page.screenshot({ path: '/tmp/knowify-error.png', fullPage: true });
    console.error('Error screenshot saved to /tmp/knowify-error.png');
    throw error;
  } finally {
    await browser.close();
    console.log('Browser closed');
  }
})();
```

### Step 3 — Execute the script
Prefer the Playwright skill runner:
```bash
cd $SKILL_DIR && KNOWIFY_USERNAME="$KNOWIFY_USERNAME" KNOWIFY_PASSWORD="$KNOWIFY_PASSWORD" node run.js /tmp/knowify-export.js
```
If the Playwright skill is not installed, fall back:
```bash
KNOWIFY_USERNAME="$KNOWIFY_USERNAME" KNOWIFY_PASSWORD="$KNOWIFY_PASSWORD" npx playwright install chromium && node /tmp/knowify-export.js
```

### Step 4 — Verify and report
1. Confirm the file exists in the AJR Reports folder (`ls -la` the destination).
2. Report using the output format below.
3. On any failure, surface the error message and reference the screenshot at `/tmp/knowify-error.png`.

## Output Format

On success:
```
Knowify AJR Export ✅
──────────────────────────────────
Saved:  Advanced Job Report MM.DD.YYYY.xlsx
Path:   ~/…/AJR Reports/Advanced Job Report MM.DD.YYYY.xlsx
Range:  01/01/22 – 12/31/28
Size:   <N> KB
──────────────────────────────────
```

On failure:
```
Knowify AJR Export ❌
Failed at: <step — e.g. "login" / "select Advanced Jobs" / "export">
Error:     <error message>
Screenshot: /tmp/knowify-error.png
```

## Examples

**Example — scheduled run succeeds:**
> Env vars present. Wrote `/tmp/knowify-export.js`, ran via the Playwright skill.
> ```
> Knowify AJR Export ✅
> ──────────────────────────────────
> Saved:  Advanced Job Report 07.13.2026.xlsx
> Path:   ~/…/AJR Reports/Advanced Job Report 07.13.2026.xlsx
> Range:  01/01/22 – 12/31/28
> Size:   184 KB
> ──────────────────────────────────
> ```
> A file for today already existed, so this one was saved as `…07.13.2026_1435.xlsx` to keep both.

## Important Notes

- **Date fields**: triple-click + `type`, never `fill`/`form_input` — that guarantees the existing value is selected and replaced.
- **Sidebar navigation**: the sidebar may be collapsed — hover to expand before clicking "Reports".
- **Download handling**: use Playwright's `download` event, not filesystem watching.
- **Duplicate files**: if today's file already exists, append an `HHMM` suffix and keep both (never overwrite).

## Never Do

- **Never hardcode the Knowify username or password** in the script, in `/tmp`, or in the report. Read them only from env; if missing, stop.
- **Never print the password** (or the full credential env values) to logs or to the user.
- **Never overwrite an existing report** — always suffix and keep both.
- **Never change the date range** (1/1/22–12/31/28) or the destination folder without the user asking — downstream Finance workflows expect exactly this file name, range, and location.
- **Never report success unless the file is actually present** at the destination — verify with `ls` first.
