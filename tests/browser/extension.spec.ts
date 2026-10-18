import {
  test,
  expect,
  chromium,
  selectors,
  type BrowserContext,
  type Page,
  type Worker,
} from '@playwright/test';
import { resolve } from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { createServer, type Server } from 'node:http';

let context: BrowserContext;
let worker: Worker;
let server: Server;
let origin: string;
let profile: string;
let extensionId: string;
// DevTools can inspect closed roots. Only the isolated test page receives this
// handle; production content scripts never expose it to the host website.
async function inspectOverlay(page: Page) {
  await expect(page.locator('sidekick-sidebar')).toBeAttached();
  expect(
    await page.locator('sidekick-sidebar').evaluate((host) => host.shadowRoot),
  ).toBeNull();
  const cdp = await context.newCDPSession(page);
  const { root } = await cdp.send('DOM.getDocument', {
    depth: -1,
    pierce: true,
  });
  interface Node {
    nodeName: string;
    nodeId: number;
    children?: Node[];
    shadowRoots?: Node[];
  }
  const find = (node: Node): Node | undefined =>
    node.nodeName === 'SIDEKICK-SIDEBAR'
      ? node
      : [...(node.children ?? []), ...(node.shadowRoots ?? [])]
          .map(find)
          .find(Boolean);
  const shadowId = find(root)?.shadowRoots?.[0]?.nodeId;
  if (!shadowId) throw new Error('No closed Sidekick shadow root');
  const { object } = await cdp.send('DOM.resolveNode', { nodeId: shadowId });
  await cdp.send('Runtime.callFunctionOn', {
    objectId: object.objectId,
    functionDeclaration: 'function() { window.__sidekickTestShadow = this; }',
  });
  await cdp.detach();
}
test.beforeAll(async () => {
  await selectors.register('sidekick', () => ({
    query(_root: Node, selector: string) {
      return (
        (
          window as Window & { __sidekickTestShadow?: ShadowRoot }
        ).__sidekickTestShadow?.querySelector(selector) ?? null
      );
    },
    queryAll(_root: Node, selector: string) {
      return Array.from(
        (
          window as Window & { __sidekickTestShadow?: ShadowRoot }
        ).__sidekickTestShadow?.querySelectorAll(selector) ?? [],
      );
    },
  }));
  server = createServer((req, res) => {
    res.setHeader('Content-Type', 'text/html');
    if (req.url === '/slow') {
      res.write('<!doctype html><title>Slow garden</title>');
      setTimeout(() => res.end('<body>Finished loading</body>'), 1500);
      return;
    }
    res.end(
      `<!doctype html><html style="font-size:30px"><head><title>${req.url === '/second' ? 'Second page' : 'Test garden'}</title></head><body style="margin:0"><main style="padding:100px">A local page for Sidekick tests</main><a href="/second">Navigate</a></body></html>`,
    );
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('No test server');
  origin = `http://127.0.0.1:${address.port}`;
  profile = await mkdtemp(resolve(tmpdir(), 'sidekick-test-'));
  const extension = resolve('.output/chrome-mv3');
  context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium',
    headless: true,
    viewport: { width: 1100, height: 850 },
    args: [
      `--disable-extensions-except=${extension}`,
      `--load-extension=${extension}`,
    ],
  });
  worker =
    context.serviceWorkers()[0] ??
    (await context.waitForEvent('serviceworker'));
  extensionId = new URL(worker.url()).host;
});
test.afterAll(async () => {
  await context?.close();
  await new Promise<void>((done) => server?.close(() => done()));
  if (profile) await rm(profile, { recursive: true, force: true });
});
test('tracks title changes, tab movement, window boundaries and workspace selection', async () => {
  const first = await context.newPage();
  await first.goto(`${origin}/events`);
  await first.evaluate(() => {
    document.title = 'Event stream';
  });
  const second = await context.newPage();
  await second.goto(`${origin}/events2`);
  await second.evaluate(() => {
    document.title = 'Move me';
  });
  const native = await context.newPage();
  await native.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  await expect(
    native.getByRole('button', { name: 'Event stream', exact: true }),
  ).toBeVisible();
  await expect(
    native.getByRole('button', { name: 'Move me', exact: true }),
  ).toBeVisible();
  const loading = second.goto(`${origin}/slow`);
  const slowRow = native.locator('.tab-row').filter({ hasText: 'Slow garden' });
  await expect(slowRow.locator('.spinner')).toBeVisible();
  await loading;
  await expect(slowRow.locator('.spinner')).toHaveCount(0);
  await second.goto(`${origin}/events2`);
  await second.evaluate(() => {
    document.title = 'Move me';
  });
  const secondId = await worker.evaluate(
    async (url) => (await chrome.tabs.query({ url }))[0]!.id!,
    `${origin}/events2`,
  );
  await worker.evaluate(async (id) => {
    await chrome.tabs.move(id, { index: 0 });
  }, secondId);
  await expect(native.locator('.tab-row').first()).toContainText('Move me');
  await worker.evaluate(async (id) => {
    await chrome.tabs.update(id, { active: true });
  }, secondId);
  await expect(
    native.getByRole('button', { name: 'Move me', exact: true }),
  ).toHaveAttribute('aria-current', 'page');
  const windowId = await worker.evaluate(
    async (id) =>
      (await chrome.windows.create({ tabId: id, focused: false }))!.id!,
    secondId,
  );
  await expect(
    native.getByRole('button', { name: 'Move me', exact: true }),
  ).toHaveCount(0);
  await expect(
    native.getByRole('button', { name: 'Event stream', exact: true }),
  ).toBeVisible();
  // A stale action cannot close a tab that was moved into another window.
  const stale = (await native.evaluate(async (tabId) => {
    const windowId = (await chrome.windows.getCurrent()).id;
    return await chrome.runtime.sendMessage({
      channel: 'sidekick',
      windowId,
      command: { type: 'tab.close', tabId },
    });
  }, secondId)) as { ok: boolean };
  expect(stale.ok).toBe(false);
  expect(
    await worker.evaluate(
      async (id) => (await chrome.tabs.get(id)).windowId,
      secondId,
    ),
  ).toBe(windowId);
  const data = await worker.evaluate(async () => {
    const key = 'sidekick.metadata.v1';
    const stored = await chrome.storage.local.get(key);
    const metadata = stored[key] as {
      workspaces: {
        id: string;
        name: string;
        color: string;
        createdAt: string;
      }[];
    };
    const id = crypto.randomUUID();
    metadata.workspaces.push({
      id,
      name: 'Research',
      color: '#92c8b0',
      createdAt: new Date().toISOString(),
    });
    await chrome.storage.local.set({ [key]: metadata });
    return id;
  });
  await expect(native.getByRole('option', { name: 'Research' })).toBeAttached();
  await native.getByLabel('Workspace', { exact: true }).selectOption(data);
  await native.reload();
  await expect(native.getByLabel('Workspace', { exact: true })).toHaveValue(
    data,
  );
  // Selection only changes metadata in this milestone.
  await expect(
    native.getByRole('button', { name: 'Event stream', exact: true }),
  ).toBeVisible();
  await worker.evaluate(async (id) => {
    await chrome.windows.remove(id);
  }, windowId);
  await first.close();
  await native.close();
});
test('loads MV3; hover, tabs, navigation, persistence, native fallback and worker recovery', async () => {
  expect(
    await worker.evaluate(() => chrome.runtime.getManifest().manifest_version),
  ).toBe(3);
  const page = await context.newPage();
  await page.goto(origin);
  await inspectOverlay(page);
  const ui = page.locator('sidekick=.sidekick-root');
  const sidebar = ui.getByRole('complementary', {
    name: 'Sidekick sidebar',
    includeHidden: true,
  });
  const strip = ui.getByRole('button', { name: 'Open Sidekick' });
  await expect(strip).toBeVisible();
  await expect(sidebar).toBeHidden();
  const hostBefore = await page.locator('main').boundingBox();
  await strip.hover();
  await expect(sidebar).toBeVisible();
  await page.mouse.move(150, 250);
  await expect(sidebar).toBeVisible();
  expect(await page.locator('main').boundingBox()).toEqual(hostBefore);
  await expect(
    page.locator('style[wxt-shadow-root-document-styles]'),
  ).toHaveCount(0);
  expect(await sidebar.evaluate((e) => getComputedStyle(e).fontSize)).toBe(
    '13px',
  );
  await page.mouse.move(800, 500);
  await expect(sidebar).toBeHidden();
  await strip.click();
  await ui.getByRole('button', { name: 'Open settings' }).click();
  await ui.getByLabel('Display mode').selectOption('pinned');
  await ui.getByRole('slider', { name: 'Width', exact: true }).fill('340');
  await expect(sidebar).toHaveCSS('width', '340px');
  await page.reload();
  await inspectOverlay(page);
  await expect(sidebar).toBeVisible();
  await expect(sidebar).toHaveCSS('width', '340px');
  const addedPromise = context.waitForEvent('page');
  await ui.getByRole('button', { name: 'New tab', exact: true }).click();
  const added = await addedPromise;
  await added.goto(`${origin}/second`);
  await expect(
    ui.getByRole('button', { name: 'Close Second page', exact: true }),
  ).toBeAttached();
  await ui.getByRole('button', { name: 'Second page', exact: true }).click();
  await expect
    .poll(async () =>
      worker.evaluate(
        async () =>
          (
            await chrome.tabs.query({ active: true, lastFocusedWindow: true })
          )[0]?.title,
      ),
    )
    .toBe('Second page');
  await ui
    .getByRole('button', { name: 'Close Second page', exact: true })
    .click();
  await expect.poll(() => added.isClosed()).toBe(true);
  await expect(
    ui.getByRole('button', { name: 'Close Second page', exact: true }),
  ).toHaveCount(0);
  await page.goto(`${origin}/second`);
  await inspectOverlay(page);
  await expect(sidebar).toBeVisible();
  await expect(
    ui.getByRole('button', { name: 'Second page', exact: true }),
  ).toHaveAttribute('aria-current', 'page');
  await page.evaluate(() => {
    history.pushState({}, '', '/spa');
    document.title = 'SPA page';
  });
  await expect(
    ui.getByRole('button', { name: 'SPA page', exact: true }),
  ).toBeVisible();
  await page.evaluate(() => {
    const replacement = document.createElement('body');
    replacement.innerHTML =
      '<main style="padding:100px">A replaced page body</main>';
    document.body.replaceWith(replacement);
  });
  await inspectOverlay(page);
  await expect(sidebar).toBeVisible();
  await expect(page.locator('sidekick-sidebar')).toHaveCount(1);
  await ui.getByRole('textbox', { name: 'Search tabs' }).fill('no-match-ever');
  await expect(ui.getByText('No tabs found', { exact: true })).toBeVisible();
  await ui.getByRole('button', { name: 'Clear search' }).click();
  // Open the real extension page to exercise the same native-panel entrypoint.
  const native = await context.newPage();
  await native.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  await expect(native.getByRole('complementary')).toBeVisible();
  await native.getByRole('button', { name: 'Open settings' }).click();
  await native.getByLabel('Display mode').selectOption('hidden');
  await expect(sidebar).toBeHidden();
  await expect(ui.getByRole('button', { name: 'Open Sidekick' })).toHaveCount(
    0,
  );
  await native.getByLabel('Display mode').selectOption('pinned');
  await expect(sidebar).toBeVisible();
  const restricted = await context.newPage();
  await restricted.goto('chrome://version');
  await expect(restricted.locator('sidekick-sidebar')).toHaveCount(0);
  expect(
    await worker.evaluate(
      async () => (await chrome.sidePanel.getOptions({})).path,
    ),
  ).toBe('sidepanel.html');
  expect(
    await worker.evaluate(
      async () =>
        (await chrome.sidePanel.getPanelBehavior()).openPanelOnActionClick,
    ),
  ).toBe(true);
  // Stop the worker through CDP, then wait for client reconnect and fresh data.
  const cdp = await context.browser()!.newBrowserCDPSession();
  const { targetInfos } = await cdp.send('Target.getTargets');
  const target = targetInfos.find(
    (info) => info.type === 'service_worker' && info.url.includes(extensionId),
  );
  if (!target) throw new Error('No extension service worker target');
  const beforeContext = await native.evaluate(
    async () =>
      (
        await chrome.runtime.getContexts({
          contextTypes: ['BACKGROUND' as chrome.runtime.ContextType],
        })
      )[0]?.contextId,
  );
  expect(beforeContext).toBeTruthy();
  await cdp.send('Target.closeTarget', { targetId: target.targetId });
  // Playwright preserves its Worker wrapper across restarts. Prove a new Chrome
  // execution context exists instead of waiting for another serviceworker event.
  await expect
    .poll(
      async () =>
        native.evaluate(async (previous) => {
          const current = (
            await chrome.runtime.getContexts({
              contextTypes: ['BACKGROUND' as chrome.runtime.ContextType],
            })
          )[0]?.contextId;
          return !!current && current !== previous;
        }, beforeContext),
      { timeout: 20000 },
    )
    .toBe(true);
  await cdp.detach();
  await expect(
    ui.getByText('All tabs · this window', { exact: true }),
  ).toBeVisible({ timeout: 20000 });
  await ui.getByRole('button', { name: 'Open settings' }).click();
  await expect(ui.getByLabel('Display mode')).toHaveValue('pinned');
  await expect(
    ui.getByRole('slider', { name: 'Width', exact: true }),
  ).toHaveValue('340');
  await context.setOffline(true);
  await ui.getByRole('slider', { name: 'Width', exact: true }).fill('350');
  await expect(sidebar).toHaveCSS('width', '350px');
  await ui.getByRole('slider', { name: 'Width', exact: true }).fill('340');
  await expect(sidebar).toHaveCSS('width', '340px');
  await context.setOffline(false);
  await ui.getByRole('button', { name: 'Back to tabs' }).click();
  await page.screenshot({ path: 'test-results/sidebar.png' });
});
