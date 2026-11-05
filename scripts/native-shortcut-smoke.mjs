/* global URL, document, chrome, console, setTimeout */
import { chromium } from '@playwright/test';
import { mkdtemp, rm, writeFile, mkdir, access } from 'node:fs/promises';
import { resolve, dirname, basename } from 'node:path';
import { tmpdir } from 'node:os';
await mkdir('playwright-report', { recursive: true });
const profile = await mkdtemp(resolve(tmpdir(), 'sidekick-native-'));
if (
  dirname(resolve(profile)).toLowerCase() !== resolve(tmpdir()).toLowerCase() ||
  !basename(profile).startsWith('sidekick-native-')
)
  throw Error('Unexpected profile');

const extension = resolve('.output/chrome-mv3');
const context = await chromium.launchPersistentContext(profile, {
  channel: 'chromium',
  headless: false,
  viewport: null,
  args: [
    '--window-size=1280,900',
    `--disable-extensions-except=${extension}`,
    `--load-extension=${extension}`,
  ],
});
try {
  const worker =
    context.serviceWorkers()[0] ??
    (await context.waitForEvent('serviceworker'));
  const page = await context.newPage();
  await page.goto(new URL('dashboard.html', worker.url()).href);
  await page.evaluate(() => (document.title = 'Sidekick Native Shortcut QA'));
  await page.bringToFront();
  console.log(
    'READY: Sidekick Native Shortcut QA',
    JSON.stringify(await worker.evaluate(() => chrome.commands.getAll())),
  );
  await page
    .getByRole('dialog', { name: 'Command Palette' })
    .waitFor({ timeout: 180000 });
  await page.screenshot({ path: 'playwright-report/native-shortcut.png' });
  console.log(
    'PASS: native Chrome-managed palette shortcut. Waiting for native Escape.',
  );
  await page
    .getByRole('dialog', { name: 'Command Palette' })
    .waitFor({ state: 'hidden', timeout: 180000 });
  await writeFile(
    'playwright-report/native-shortcut-result.json',
    JSON.stringify(
      {
        shortcut: 'Alt+Shift+K',
        chromeDispatch: true,
        escapeCloses: true,
        syntheticCdpDispatch: false,
      },
      null,
      2,
    ),
  );
  console.log('PASS: Escape closes. Waiting for QA completion marker.');
  const deadline = Date.now() + 120000;
  while (Date.now() < deadline) {
    try {
      await access('playwright-report/native-qa-complete');
      break;
    } catch {
      /* The native test has not been marked complete yet. */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
} finally {
  await context.close();
  await rm(profile, { recursive: true, force: true });
}
