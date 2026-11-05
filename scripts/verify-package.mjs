/* global console, process */
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { resolve, dirname, basename, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { URL } from 'node:url';
import { chromium, expect } from '@playwright/test';
const extension = resolve(process.argv[2] ?? '');
assert(
  extension.startsWith(resolve('playwright-report') + sep),
  'Extract the archive inside playwright-report first.',
);
const manifest = JSON.parse(
  await readFile(resolve(extension, 'manifest.json'), 'utf8'),
);
assert.equal(manifest.version, '0.3.0');
assert.equal(manifest.manifest_version, 3);
assert.equal(manifest.chrome_url_overrides, undefined);
assert.deepEqual(
  [...manifest.permissions].sort(),
  ['alarms', 'bookmarks', 'sidePanel', 'storage', 'tabGroups', 'tabs'].sort(),
);
assert.deepEqual(manifest.host_permissions, ['https://ai-gateway.vercel.sh/*']);
for (const file of [
  manifest.background.service_worker,
  manifest.side_panel.default_path,
  manifest.options_ui.page,
  ...Object.values(manifest.icons),
])
  await readFile(resolve(extension, file));
const profile = await mkdtemp(resolve(tmpdir(), 'sidekick-package-'));
assert.equal(dirname(profile).toLowerCase(), resolve(tmpdir()).toLowerCase());
assert(basename(profile).startsWith('sidekick-package-'));
const context = await chromium.launchPersistentContext(profile, {
  channel: 'chromium',
  headless: true,
  viewport: { width: 1280, height: 800 },
  args: [
    `--disable-extensions-except=${extension}`,
    `--load-extension=${extension}`,
  ],
});
try {
  const worker =
    context.serviceWorkers()[0] ??
    (await context.waitForEvent('serviceworker'));
  const id = new URL(worker.url()).host;
  const page = await context.newPage(),
    errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`chrome-extension://${id}/dashboard.html`);
  const ui = page.locator('.embedded');
  await expect(ui.getByLabel('Workspace', { exact: true })).not.toHaveValue('');
  await ui
    .getByRole('button', { name: 'Create workspace', exact: true })
    .click();
  await ui
    .getByLabel('Workspace name', { exact: true })
    .fill('Package verification');
  await ui.getByRole('button', { name: 'Save workspace', exact: true }).click();
  await expect(
    ui.getByRole('option', { name: 'Package verification' }),
  ).toBeAttached();
  await ui
    .getByRole('button', { name: 'Open command palette (Alt+Shift+K)' })
    .click();
  await expect(
    page.getByRole('combobox', { name: 'Command palette search' }),
  ).toBeFocused();
  await page.keyboard.press('Escape');
  await page.goto('chrome://newtab/');
  await expect(page.locator('sidekick-sidebar')).toHaveCount(0);
  await expect(page.locator('.sidekick-root')).toHaveCount(0);
  assert.deepEqual(errors, []);
  const report = {
    version: manifest.version,
    chromeVersion: context.browser().version(),
    manifestVersion: manifest.manifest_version,
    permissions: manifest.permissions,
    loadedFromExtractedZip: true,
    workspaceCreate: true,
    palette: true,
    originalNewTab: true,
    unhandledPageErrors: errors,
  };
  await writeFile(
    '.output/sidekick-package-verification.json',
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report));
} finally {
  await context.close();
  await rm(profile, { recursive: true, force: true });
}
