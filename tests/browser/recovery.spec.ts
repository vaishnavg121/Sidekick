import { test, expect, chromium, type BrowserContext } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { resolve, dirname, basename } from 'node:path';
import { tmpdir } from 'node:os';

test('Immersive extension reload and full browser restart retain a usable exit', async ({
  browserName,
}, info) => {
  expect(browserName).toBe('chromium');
  test.skip(
    info.project.use.headless !== false,
    'Requires real Chrome windows.',
  );
  test.setTimeout(60000);
  const profile = await mkdtemp(resolve(tmpdir(), 'sidekick-recovery-'));
  const extension = resolve('.output/chrome-mv3');
  const launch = () =>
    chromium.launchPersistentContext(profile, {
      channel: 'chromium',
      headless: false,
      viewport: null,
      args: [
        '--window-size=1280,900',
        `--disable-extensions-except=${extension}`,
        `--load-extension=${extension}`,
      ],
    });
  let context: BrowserContext | undefined;
  try {
    context = await launch();
    const worker =
      context.serviceWorkers()[0] ??
      (await context.waitForEvent('serviceworker'));
    const extensionId = new URL(worker.url()).host;
    // Reloading an unpacked extension requires Developer mode, just as the
    // documented install steps do. Set it through Chrome in this test profile.
    const extensions = await context.newPage();
    await extensions.goto('chrome://extensions');
    const developerMode = extensions.locator('#devMode');
    if ((await developerMode.getAttribute('checked')) === null)
      await developerMode.click();
    await expect(developerMode).toHaveAttribute('checked', '');
    await extensions.close();
    let page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/newtab.html`);
    await expect(
      page
        .locator('.dashboard')
        .getByRole('button', { name: 'Enter Immersive', exact: true }),
    ).toBeVisible();
    await page
      .locator('.dashboard')
      .getByRole('button', { name: 'Add shortcut' })
      .click();
    await page
      .locator('.dashboard')
      .getByLabel('Shortcut name')
      .fill('Survives restart');
    await page
      .locator('.dashboard')
      .getByLabel('Web address')
      .fill('https://example.com/');
    await page
      .locator('.dashboard')
      .getByRole('button', { name: 'Save shortcut' })
      .click();
    await expect(
      page
        .locator('.dashboard')
        .getByRole('button', { name: 'Survives restart', exact: true }),
    ).toBeVisible();
    await page
      .locator('.dashboard')
      .getByRole('button', { name: 'Enter Immersive', exact: true })
      .click();
    await expect(
      page
        .locator('.dashboard')
        .getByRole('button', { name: 'Exit Immersive', exact: true }),
    ).toBeVisible();
    await page
      .locator('.dashboard')
      .getByRole('button', { name: 'Add pinned URL', exact: true })
      .click();
    await page
      .locator('.dashboard')
      .getByLabel('Pinned name')
      .fill('Pinned survives restart');
    await page
      .locator('.dashboard')
      .getByLabel('Web address')
      .fill('https://example.org/');
    await page
      .locator('.dashboard')
      .getByRole('button', { name: 'Save pinned entry', exact: true })
      .click();
    await page
      .locator('.dashboard')
      .getByRole('button', { name: 'Create pinned folder', exact: true })
      .click();
    await page
      .locator('.dashboard')
      .getByLabel('Folder name')
      .fill('Persistent folder');
    await page
      .locator('.dashboard')
      .getByRole('button', { name: 'Save folder', exact: true })
      .click();
    await page
      .locator('.dashboard')
      .getByRole('button', {
        name: 'Actions for pinned Pinned survives restart',
        exact: true,
      })
      .click();
    await page
      .locator('.dashboard')
      .getByLabel('Move pinned Pinned survives restart to folder', {
        exact: true,
      })
      .selectOption({ label: 'Persistent folder' });
    await page.evaluate(async () => {
      const window = (await chrome.windows.getCurrent()).id;
      await chrome.runtime.sendMessage({
        channel: 'sidekick',
        windowId: window,
        command: { type: 'sidebar.mode', mode: 'docked' },
      });
    });
    await context.route('https://example.com/m13-docked', (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><title>Reload layout fixture</title><body><main>Content must return to its original layout</main></body>',
      }),
    );
    const dockedPage = await context.newPage();
    await dockedPage.goto('https://example.com/m13-docked');
    await expect
      .poll(() =>
        dockedPage.evaluate(
          () => document.documentElement.getBoundingClientRect().left,
        ),
      )
      .toBe(320);
    await page.bringToFront();
    await page.evaluate(() => {
      setTimeout(() => chrome.runtime.reload(), 0);
    });
    // A reloaded extension invalidates the old document. Reopen its own page;
    // production tells users to refresh old website content scripts as well.
    await expect
      .poll(async () => {
        try {
          return await page.evaluate(() => !!chrome.runtime.id);
        } catch {
          return false;
        }
      })
      .toBe(false);
    await expect
      .poll(() =>
        dockedPage.evaluate(
          () => document.documentElement.getBoundingClientRect().left,
        ),
      )
      .toBe(0);
    await expect(dockedPage.locator('sidekick-sidebar')).toHaveCount(0);
    page = await context.newPage();
    await expect
      .poll(
        async () => {
          try {
            await page.goto(`chrome-extension://${extensionId}/newtab.html`);
            return true;
          } catch {
            return false;
          }
        },
        { timeout: 15000 },
      )
      .toBe(true);
    await expect(
      page
        .locator('.dashboard')
        .getByRole('button', { name: 'Exit Immersive', exact: true }),
    ).toBeVisible();
    await expect(
      page
        .locator('.dashboard')
        .getByRole('button', { name: 'Survives restart', exact: true }),
    ).toBeVisible();
    await page
      .locator('.dashboard')
      .getByRole('button', { name: 'Exit Immersive', exact: true })
      .click();
    await expect
      .poll(() =>
        page.evaluate(async () => (await chrome.windows.getCurrent()).state),
      )
      .toBe('normal');
    await page
      .locator('.dashboard')
      .getByRole('button', { name: 'Enter Immersive', exact: true })
      .click();
    await expect(
      page
        .locator('.dashboard')
        .getByRole('button', { name: 'Exit Immersive', exact: true }),
    ).toBeVisible();
    await context.close();
    context = await launch();
    page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/newtab.html`);
    await expect(
      page
        .locator('.dashboard')
        .getByRole('button', { name: 'Survives restart', exact: true }),
    ).toBeVisible();
    const state = await page.evaluate(
      async () => (await chrome.windows.getCurrent()).state,
    );
    console.log(`Chrome window after full restart: ${state}`);
    await expect(
      page.locator('.dashboard .pinned-folder').getByRole('button', {
        name: 'Open pinned Pinned survives restart',
        exact: true,
      }),
    ).toBeVisible();
    const immersive = state === 'fullscreen';
    await expect(
      page.locator('.dashboard').getByRole('button', {
        name: immersive ? 'Exit Immersive' : 'Enter Immersive',
        exact: true,
      }),
    ).toBeVisible();
    if (immersive)
      await page
        .locator('.dashboard')
        .getByRole('button', { name: 'Exit Immersive', exact: true })
        .click();
    await expect
      .poll(() =>
        page.evaluate(async () => (await chrome.windows.getCurrent()).state),
      )
      .not.toBe('fullscreen');
    expect(
      await page.evaluate(async () => {
        const values = await chrome.storage.session.get(
          'sidekick.window-ui.v1',
        );
        return Object.values(
          (values['sidekick.window-ui.v1'] as Record<
            string,
            { restoreState?: string }
          >) ?? {},
        ).some((value) => value.restoreState !== undefined);
      }),
    ).toBe(false);
  } finally {
    await context?.close();
    await removeProfile(profile);
  }
});
async function removeProfile(profile: string) {
  if (
    dirname(resolve(profile)).toLowerCase() !==
      resolve(tmpdir()).toLowerCase() ||
    !basename(profile).startsWith('sidekick-recovery-')
  )
    throw new Error('Unexpected recovery profile path');
  await rm(profile, { recursive: true, force: true });
}
