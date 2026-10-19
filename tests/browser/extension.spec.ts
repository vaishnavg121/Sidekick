import {
  test,
  expect,
  chromium,
  selectors,
  type BrowserContext,
  type Page,
  type Worker,
} from '@playwright/test';
import { resolve, dirname, basename } from 'node:path';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { createServer, type Server } from 'node:http';
import { attachNativePanel } from './native-target';
import type { Metadata } from '../../lib/models';

let context: BrowserContext;
let worker: Worker;
let server: Server;
let origin: string;
let profile: string;
let extensionId: string;
let headless = true;
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
test.beforeAll(async ({ browserName }, testInfo) => {
  expect(browserName).toBe('chromium');
  headless = testInfo.project.use.headless !== false;
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
    if (req.url === '/very-slow') {
      res.write(
        '<!doctype html><title>Still loading</title><body>A slow response',
      );
      const timer = setTimeout(() => res.end('Done'), 30000);
      res.on('close', () => clearTimeout(timer));
      return;
    }
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
    headless,
    viewport: null,
    args: [
      '--window-size=1280,900',
      `--disable-extensions-except=${extension}`,
      `--load-extension=${extension}`,
    ],
  });
  worker =
    context.serviceWorkers()[0] ??
    (await context.waitForEvent('serviceworker'));
  extensionId = new URL(worker.url()).host;
});

test('New Tab replaces Chrome home and manages workspace shortcuts without changing bookmarks', async () => {
  const page = await context.newPage();
  await page.goto('chrome://newtab/');
  const dashboard = page.locator('.dashboard');
  await expect(
    dashboard.getByRole('heading', { name: 'Make room for what matters.' }),
  ).toBeVisible();
  expect(
    await worker.evaluate(
      () => chrome.runtime.getManifest().chrome_url_overrides?.newtab,
    ),
  ).toBe('newtab.html');
  await expect(page.locator('.embedded .sidebar')).toHaveCount(1);
  await expect(page.locator('sidekick-sidebar')).toHaveCount(0);
  const folder = await worker.evaluate(async () => {
    const [root] = await chrome.bookmarks.getTree();
    const folder = await chrome.bookmarks.create({
      parentId: root!.children!.find((n) => n.children)?.id,
      title: 'Sidekick fixture folder',
    });
    await chrome.bookmarks.create({
      parentId: folder.id,
      title: 'Garden bookmark',
      url: 'https://example.com/garden',
    });
    await chrome.bookmarks.create({
      parentId: folder.id,
      title: 'Unsafe bookmark',
      url: 'javascript:alert(1)',
    });
    return folder.id;
  });
  const before = await worker.evaluate(() => chrome.bookmarks.getTree());
  await dashboard
    .getByRole('button', { name: 'Browse Chrome bookmarks' })
    .click();
  await dashboard
    .getByRole('button', { name: /Bookmarks bar|Bookmarks toolbar/ })
    .click();
  await dashboard
    .getByRole('button', { name: /Sidekick fixture folder/ })
    .click();
  await expect(
    dashboard.getByRole('button', { name: 'Unsafe bookmark', exact: true }),
  ).toBeDisabled();
  await dashboard.getByLabel('Search bookmarks').fill('Garden bookmark');
  await dashboard
    .getByRole('button', {
      name: 'Favorite bookmark Garden bookmark',
      exact: true,
    })
    .click();
  await expect(dashboard.locator('.favorite-tile')).toHaveCount(1);
  expect(await worker.evaluate(() => chrome.bookmarks.getTree())).toEqual(
    before,
  );
  await dashboard.getByRole('button', { name: 'Hide bookmarks' }).click();
  await dashboard
    .getByRole('button', { name: 'Add shortcut', exact: true })
    .click();
  await dashboard.getByLabel('Shortcut name').fill('My garden');
  await dashboard.getByLabel('Web address').fill(origin + '/shortcut');
  await dashboard
    .getByRole('button', { name: 'Save shortcut', exact: true })
    .click();
  await dashboard
    .getByRole('button', { name: 'Actions for My garden', exact: true })
    .click();
  await dashboard
    .getByRole('menuitem', { name: 'Edit My garden', exact: true })
    .click();
  await dashboard.getByLabel('Shortcut name').fill('Updated garden');
  await dashboard
    .getByRole('button', { name: 'Save shortcut', exact: true })
    .click();
  await page.reload();
  await expect(
    dashboard.getByRole('button', { name: 'Updated garden', exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: 'test-results/newtab.png', fullPage: true });
  for (const title of ['Updated garden', 'Garden bookmark']) {
    await dashboard
      .getByRole('button', { name: 'Actions for ' + title, exact: true })
      .click();
    await dashboard
      .getByRole('menuitem', { name: 'Remove favorite ' + title, exact: true })
      .click();
  }
  await expect(dashboard.locator('.favorite-tile')).toHaveCount(0);
  await worker.evaluate(
    (folder) => chrome.bookmarks.removeTree(folder),
    folder,
  );
  await page.close();
});

test('address controls navigate, search, reject scripts, stop, reload and traverse history', async () => {
  const page = await context.newPage();
  await page.goto('chrome://newtab/');
  const address = page
    .locator('.dashboard')
    .getByLabel('Address or Google search', { exact: true });
  await address.fill('javascript:document.title="unsafe"');
  await address.press('Enter');
  await expect(page.locator('.dashboard').getByRole('alert')).toContainText(
    'scheme',
  );
  await address.fill(`${origin}/navigation`);
  await address.press('Enter');
  await expect(page).toHaveURL(`${origin}/navigation`);
  await inspectOverlay(page);
  let ui = page.locator('sidekick=.sidekick-root');
  await worker.evaluate(async () => {
    const [tab] = await chrome.tabs.query({
      active: true,
      lastFocusedWindow: true,
    });
    await chrome.tabs.sendMessage(tab!.id!, {
      channel: 'sidekick:page',
      action: 'focus-address',
    });
  });
  await expect(
    ui.getByRole('complementary', { includeHidden: true }),
  ).toBeVisible();
  await expect
    .poll(() =>
      ui
        .getByLabel('Address or Google search')
        .evaluate(
          (input) =>
            (input.getRootNode() as ShadowRoot).activeElement === input,
        ),
    )
    .toBe(true);
  await ui.getByLabel('Address or Google search').fill(`${origin}/second`);
  await ui.getByLabel('Address or Google search').press('Enter');
  await expect(page).toHaveURL(`${origin}/second`);
  await inspectOverlay(page);
  ui = page.locator('sidekick=.sidekick-root');
  await ui.getByRole('button', { name: 'Open Sidekick', exact: true }).click();
  await ui.getByRole('button', { name: 'Go back', exact: true }).click();
  await expect(page).toHaveURL(`${origin}/navigation`);
  await inspectOverlay(page);
  await ui.getByRole('button', { name: 'Open Sidekick', exact: true }).click();
  await ui.getByRole('button', { name: 'Go forward', exact: true }).click();
  await expect(page).toHaveURL(`${origin}/second`);
  await inspectOverlay(page);
  await ui.getByRole('button', { name: 'Open Sidekick', exact: true }).click();
  await ui.getByRole('button', { name: 'Reload page', exact: true }).click();
  await page.waitForLoadState();
  await expect(page).toHaveURL(`${origin}/second`);
  await page.goto(`${origin}/very-slow`, { waitUntil: 'commit' });
  await inspectOverlay(page);
  await ui.getByRole('button', { name: 'Open Sidekick', exact: true }).click();
  await ui.getByRole('button', { name: 'Stop loading', exact: true }).click();
  await expect(
    ui.getByRole('button', { name: 'Reload page', exact: true }),
  ).toBeVisible();
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], {
    origin,
  });
  await ui.getByLabel('Address or Google search').fill('an unfinished draft');
  await ui
    .getByRole('button', { name: 'Copy current URL', exact: true })
    .click();
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toBe(`${origin}/very-slow`);
  await context.clearPermissions();
  // Intercept the destination to validate the exact Google query without an
  // external network dependency or bypassing Google's anti-bot challenge.
  await context.route('https://www.google.com/search**', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<title>Search destination</title><body>Search query received</body>',
    }),
  );
  await ui.getByLabel('Address or Google search').fill('a quiet garden & tea');
  await ui.getByLabel('Address or Google search').press('Enter');
  await expect(page).toHaveURL(
    'https://www.google.com/search?q=a%20quiet%20garden%20%26%20tea',
  );
  await context.unroute('https://www.google.com/search**');
  await page.close();
});

test('Immersive restores fullscreen windows, keeps native/hover access, and survives worker restart', async () => {
  test.skip(
    headless,
    'Fullscreen browser chrome and OS recovery require headed Chrome.',
  );
  const page = await context.newPage();
  await page.goto(origin);
  const windowId = await worker.evaluate(
    async () => (await chrome.windows.getLastFocused()).id!,
  );
  await worker.evaluate(
    (id) => chrome.windows.update(id, { state: 'normal' }),
    windowId,
  );
  const control = await context.newPage();
  await control.goto(`chrome-extension://${extensionId}/newtab.html`);
  await page.bringToFront();
  await inspectOverlay(page);
  const ui = page.locator('sidekick=.sidekick-root');
  const sidebar = ui.getByRole('complementary', { includeHidden: true });
  await ui.getByRole('button', { name: 'Open Sidekick', exact: true }).click();
  await ui
    .getByRole('button', { name: 'Enter Immersive', exact: true })
    .click();
  await expect
    .poll(() =>
      worker.evaluate(
        (id) => chrome.windows.get(id).then((w) => w.state),
        windowId,
      ),
    )
    .toBe('fullscreen');
  await expect(
    ui.getByRole('button', { name: 'Exit Immersive', exact: true }),
  ).toBeVisible();
  await ui.getByRole('button', { name: 'Collapse sidebar' }).click();
  await page.mouse.move(800, 500);
  await expect(sidebar).toBeHidden();
  await page.mouse.move(3, 500);
  await expect(sidebar).toBeVisible();
  const fullWidth = await page.evaluate(() => innerWidth);
  const body = await page.evaluate(() => ({
    margin: getComputedStyle(document.body).margin,
    padding: getComputedStyle(document.body).padding,
  }));
  await ui
    .getByRole('button', { name: 'Open native fallback', exact: true })
    .click();
  await expect(sidebar).toBeHidden();
  await expect
    .poll(() => page.evaluate(() => innerWidth))
    .toBeLessThan(fullWidth);
  const native = await attachNativePanel(
    context,
    `chrome-extension://${extensionId}/sidepanel.html`,
  );
  await expect
    .poll(() =>
      native.evaluate(
        `!!Array.from(document.querySelectorAll('button')).find(b => b.textContent === 'Exit Immersive')`,
      ),
    )
    .toBe(true);
  expect(
    await page.evaluate(() => ({
      margin: getComputedStyle(document.body).margin,
      padding: getComputedStyle(document.body).padding,
    })),
  ).toEqual(body);
  const restricted = await context.newPage();
  await restricted.goto('chrome://version');
  await expect(restricted.locator('sidekick-sidebar')).toHaveCount(0);
  expect(
    await native.evaluate(
      `!!document.querySelector('input[aria-label="Address or Google search"]')`,
    ),
  ).toBe(true);
  await restricted.close();
  await page.bringToFront();
  await native.evaluate(`(() => {
    const input = document.querySelector('input[aria-label="Address or Google search"]');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(`${origin}/second`)});
    input.closest('form').requestSubmit();
  })()`);
  await expect(page).toHaveURL(`${origin}/second`);
  await expect
    .poll(() =>
      native.evaluate(`document.querySelector('.page-heading')?.textContent`),
    )
    .toBe('Second page');
  const capture = (await native.send('Page.captureScreenshot', {
    format: 'png',
  })) as { data: string };
  await writeFile(
    'test-results/immersive-native-panel.png',
    Buffer.from(capture.data, 'base64'),
  );
  await page.screenshot({ path: 'test-results/immersive-page.png' });
  const cdp = await context.browser()!.newBrowserCDPSession();
  const before = await control.evaluate(
    async () =>
      (
        await chrome.runtime.getContexts({
          contextTypes: ['BACKGROUND' as chrome.runtime.ContextType],
        })
      )[0]?.contextId,
  );
  const target = (await cdp.send('Target.getTargets')).targetInfos.find(
    (t) => t.type === 'service_worker' && t.url.includes(extensionId),
  )!;
  await cdp.send('Target.closeTarget', { targetId: target.targetId });
  await expect
    .poll(
      () =>
        control.evaluate(async (previous) => {
          const id = (
            await chrome.runtime.getContexts({
              contextTypes: ['BACKGROUND' as chrome.runtime.ContextType],
            })
          )[0]?.contextId;
          return !!id && id !== previous;
        }, before),
      { timeout: 20000 },
    )
    .toBe(true);
  await native.evaluate(
    `Array.from(document.querySelectorAll('button')).find(b => b.textContent === 'Exit Immersive').click()`,
  );
  await expect
    .poll(() =>
      worker.evaluate(
        (id) => chrome.windows.get(id).then((w) => w.state),
        windowId,
      ),
    )
    .toBe('normal');
  await native.evaluate(
    `document.querySelector('button[aria-label="Unpin to hover sidebar"]').click()`,
  );
  await expect
    .poll(() =>
      worker.evaluate(
        async () =>
          (
            await chrome.runtime.getContexts({
              contextTypes: ['SIDE_PANEL' as chrome.runtime.ContextType],
            })
          ).length,
      ),
    )
    .toBe(0);
  await native.dispose();
  // Restore maximized, then simulate an external/manual browser state change.
  await worker.evaluate(
    (id) => chrome.windows.update(id, { state: 'maximized' }),
    windowId,
  );
  await control.evaluate(async (id) => {
    await chrome.runtime.sendMessage({
      channel: 'sidekick',
      windowId: id,
      command: { type: 'immersive.enter' },
    });
  }, windowId);
  await control.evaluate(async (id) => {
    await chrome.runtime.sendMessage({
      channel: 'sidekick',
      windowId: id,
      command: { type: 'immersive.exit' },
    });
  }, windowId);
  await expect
    .poll(() =>
      worker.evaluate(
        (id) => chrome.windows.get(id).then((w) => w.state),
        windowId,
      ),
    )
    .toBe('maximized');
  await control.evaluate(async (id) => {
    await chrome.runtime.sendMessage({
      channel: 'sidekick',
      windowId: id,
      command: { type: 'immersive.enter' },
    });
  }, windowId);
  await page.keyboard.press('F11');
  // CDP key injection does not reliably trigger browser accelerators. Record
  // the physical-key limitation, then verify the same external state event.
  await page.waitForTimeout(500);
  const f11Worked = await worker.evaluate(
    (id) => chrome.windows.get(id).then((w) => w.state !== 'fullscreen'),
    windowId,
  );
  console.log(
    `F11 via Playwright browser accelerator: ${f11Worked ? 'worked' : 'not available; physical F11 remains a manual check'}`,
  );
  if (!f11Worked)
    await worker.evaluate(
      (id) => chrome.windows.update(id, { state: 'normal' }),
      windowId,
    );
  await expect(
    control
      .locator('.dashboard')
      .getByRole('button', { name: 'Enter Immersive', exact: true }),
  ).toBeVisible();
  const other = await worker.evaluate(
    async () =>
      (await chrome.windows.create({ url: 'about:blank', state: 'normal' }))!
        .id!,
  );
  await control.evaluate(async (id) => {
    await chrome.runtime.sendMessage({
      channel: 'sidekick',
      windowId: id,
      command: { type: 'immersive.enter' },
    });
  }, windowId);
  expect(
    await worker.evaluate(
      (id) => chrome.windows.get(id).then((w) => w.state),
      other,
    ),
  ).toBe('normal');
  await control.evaluate(async (id) => {
    await chrome.runtime.sendMessage({
      channel: 'sidekick',
      windowId: id,
      command: { type: 'immersive.exit' },
    });
  }, windowId);
  await worker.evaluate((id) => chrome.windows.remove(id), other);
  await worker.evaluate(
    (id) => chrome.windows.update(id, { state: 'normal' }),
    windowId,
  );
  await cdp.detach();
  await control.close();
  await page.close();
});
test.afterAll(async () => {
  await context?.close();
  await new Promise<void>((done) => server?.close(() => done()));
  if (profile) {
    if (
      dirname(resolve(profile)).toLowerCase() !==
        resolve(tmpdir()).toLowerCase() ||
      !basename(profile).startsWith('sidekick-test-')
    )
      throw new Error('Refusing to remove an unexpected test profile path');
    await rm(profile, { recursive: true, force: true });
  }
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
  if (!(await sidebar.isVisible())) await strip.click();
  await ui.getByRole('button', { name: 'Open settings' }).click();
  await ui.getByLabel('Display mode').selectOption('hover');
  await ui
    .getByRole('slider', { name: 'Sidebar width', exact: true })
    .fill('340');
  await expect(sidebar).toHaveCSS('width', '340px');
  await page.reload();
  await inspectOverlay(page);
  if (!(await sidebar.isVisible())) await strip.click();
  await expect(sidebar).toBeVisible();
  await expect(sidebar).toHaveCSS('width', '340px');
  const addedPromise = context.waitForEvent('page');
  await ui.getByRole('button', { name: 'New tab', exact: true }).click();
  const added = await addedPromise;
  await added.goto(`${origin}/second`);
  if (!(await sidebar.isVisible())) await strip.click();
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
  if (!(await sidebar.isVisible())) await strip.click();
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
    1,
  );
  await native.getByLabel('Display mode').selectOption('hover');
  if (!(await sidebar.isVisible())) await strip.click();
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
  if (!(await sidebar.isVisible())) await strip.click();
  await expect(
    ui.getByText('All tabs · this window', { exact: true }),
  ).toBeVisible({ timeout: 20000 });
  await ui.getByRole('button', { name: 'Open settings' }).click();
  await expect(ui.getByLabel('Display mode')).toHaveValue('hover');
  await expect(
    ui.getByRole('slider', { name: 'Sidebar width', exact: true }),
  ).toHaveValue('340');
  await context.setOffline(true);
  await ui
    .getByRole('slider', { name: 'Sidebar width', exact: true })
    .fill('350');
  await expect(sidebar).toHaveCSS('width', '350px');
  await ui
    .getByRole('slider', { name: 'Sidebar width', exact: true })
    .fill('340');
  await expect(sidebar).toHaveCSS('width', '340px');
  await context.setOffline(false);
  await ui.getByRole('button', { name: 'Back to tabs' }).click();
  await page.screenshot({ path: 'test-results/sidebar.png' });
  await native.close();
  await restricted.close();
  await page.close();
});

test('Pin opens the real native panel and suppresses the webpage overlay', async () => {
  const page = await context.newPage();
  await page.goto(origin);
  await inspectOverlay(page);
  const ui = page.locator('sidekick=.sidekick-root');
  const sidebar = ui.getByRole('complementary', {
    name: 'Sidekick sidebar',
    includeHidden: true,
  });
  await ui.getByRole('button', { name: 'Open Sidekick' }).click();
  await ui.getByRole('textbox', { name: 'Search tabs' }).fill('garden');
  const before = await page.evaluate(() => ({
    width: innerWidth,
    padding: getComputedStyle(document.body).padding,
    margin: getComputedStyle(document.body).margin,
  }));
  await ui
    .getByRole('button', { name: 'Open native fallback', exact: true })
    .click();
  await expect(sidebar).toBeHidden();
  await expect
    .poll(() =>
      worker.evaluate(
        async () =>
          (
            await chrome.runtime.getContexts({
              contextTypes: ['SIDE_PANEL' as chrome.runtime.ContextType],
            })
          ).length,
      ),
    )
    .toBe(1);
  if (!headless)
    await expect
      .poll(() => page.evaluate(() => innerWidth))
      .toBeLessThan(before.width);
  expect(
    await page.evaluate(() => ({
      padding: getComputedStyle(document.body).padding,
      margin: getComputedStyle(document.body).margin,
    })),
  ).toEqual({ padding: before.padding, margin: before.margin });
  await expect(ui.getByRole('button', { name: 'Open Sidekick' })).toHaveCount(
    0,
  );
  const native = await attachNativePanel(
    context,
    `chrome-extension://${extensionId}/sidepanel.html`,
  );
  await expect
    .poll(() =>
      native.evaluate(
        `document.querySelector('input[aria-label="Search tabs"]')?.value`,
      ),
    )
    .toBe('garden');
  if (!headless) {
    const capture = (await native.send('Page.captureScreenshot', {
      format: 'png',
    })) as { data: string };
    await writeFile(
      'test-results/native-panel.png',
      Buffer.from(capture.data, 'base64'),
    );
  }
  await native.evaluate(`(() => {
    const input = document.querySelector('input[aria-label="Search tabs"]');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'native shared search');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await expect(ui.locator('input[aria-label="Search tabs"]')).toHaveValue(
    'native shared search',
  );
  const other = await context.newPage();
  await other.goto('chrome://newtab/');
  await expect(other.locator('sidekick-sidebar')).toHaveCount(0);
  await expect
    .poll(() =>
      worker.evaluate(
        async () =>
          (
            await chrome.runtime.getContexts({
              contextTypes: ['SIDE_PANEL' as chrome.runtime.ContextType],
            })
          ).length,
      ),
    )
    .toBe(1);
  await other.goto('chrome://version');
  await expect(other.locator('sidekick-sidebar')).toHaveCount(0);
  await page.bringToFront();
  await expect(sidebar).toBeHidden();
  const beforeWorker = await native.evaluate<string>(
    `chrome.runtime.getContexts({contextTypes:['BACKGROUND']}).then(contexts => contexts[0].contextId)`,
  );
  const browserCdp = await context.browser()!.newBrowserCDPSession();
  const workerTarget = (
    await browserCdp.send('Target.getTargets')
  ).targetInfos.find(
    (target) =>
      target.type === 'service_worker' && target.url.includes(extensionId),
  )!;
  await browserCdp.send('Target.closeTarget', {
    targetId: workerTarget.targetId,
  });
  await expect
    .poll(async () => {
      const current = await native.evaluate<string | undefined>(
        `chrome.runtime.getContexts({contextTypes:['BACKGROUND']}).then(contexts => contexts[0]?.contextId)`,
      );
      return !!current && current !== beforeWorker;
    })
    .toBe(true);
  await expect
    .poll(() =>
      native.evaluate(
        `document.querySelector('footer')?.textContent.includes('All tabs')`,
      ),
    )
    .toBe(true);
  await expect(sidebar).toBeHidden();
  await expect(ui.locator('input[aria-label="Search tabs"]')).toHaveValue(
    'native shared search',
  );
  await browserCdp.detach();
  await native.evaluate(
    `document.querySelector('button[aria-label="Unpin to hover sidebar"]').click()`,
  );
  await expect
    .poll(() =>
      worker.evaluate(
        async () =>
          (
            await chrome.runtime.getContexts({
              contextTypes: ['SIDE_PANEL' as chrome.runtime.ContextType],
            })
          ).length,
      ),
    )
    .toBe(0);
  await native.dispose();
  if (!headless)
    await expect.poll(() => page.evaluate(() => innerWidth)).toBe(before.width);
  await expect(ui.getByRole('button', { name: 'Open Sidekick' })).toBeVisible();
  await ui.getByRole('button', { name: 'Open Sidekick' }).click();
  await expect(ui.getByRole('textbox', { name: 'Search tabs' })).toHaveValue(
    'native shared search',
  );
  await ui.getByRole('button', { name: 'Clear search' }).click();
  // A browser-originated closure follows the same Chrome event as its × button.
  await ui
    .getByRole('button', { name: 'Open native fallback', exact: true })
    .click();
  const windowId = await worker.evaluate(
    async () => (await chrome.windows.getLastFocused()).id!,
  );
  await worker.evaluate(async (id) => {
    await chrome.sidePanel.close({ windowId: id });
  }, windowId);
  await expect(ui.getByRole('button', { name: 'Open Sidekick' })).toBeVisible();
  await expect(sidebar).toBeHidden();
  await other.close();
  await page.close();
});

for (const url of [
  'https://www.google.com/search?q=sidekick',
  'https://mail.google.com/mail/u/0/',
  'https://drive.google.com/drive/u/0/my-drive',
  'https://www.youtube.com/',
  'https://github.com/',
  'https://example.com/',
]) {
  test(`initializes at ${new URL(url).hostname} with strict CSP and hostile body layout`, async () => {
    await context.route(url, (route) =>
      route.fulfill({
        contentType: 'text/html',
        headers: {
          'Content-Security-Policy':
            "default-src 'self'; script-src 'none'; style-src 'unsafe-inline'; require-trusted-types-for 'script'",
        },
        body: `<!doctype html><html><head><title>Compatibility fixture</title><style>
        html { font-size: 30px; } body { margin: 0; height: 200px; transform: translateZ(0); contain: paint; overflow: hidden; }
        sidekick-sidebar { display: none !important; position: absolute !important; width: 100% !important; z-index: -1 !important; }
        main { padding: 30px; } body::after { content: ''; position: fixed; inset: 0; z-index: 2147483647; background: white; }
      </style></head><body><main>Local fixture for the requested site URL</main></body></html>`,
      }),
    );
    const page = await context.newPage();
    await page.goto(url);
    await inspectOverlay(page);
    const ui = page.locator('sidekick=.sidekick-root');
    const sidebar = ui.getByRole('complementary', { includeHidden: true });
    expect(
      await page
        .locator('sidekick-sidebar')
        .evaluate((host) => host.parentElement?.tagName),
    ).toBe('HTML');
    await ui
      .getByRole('button', { name: 'Open Sidekick', exact: true })
      .hover();
    await expect(sidebar).toBeVisible();
    expect((await sidebar.boundingBox())!.height).toBeGreaterThan(200);
    await expect
      .poll(async () => Math.round((await sidebar.boundingBox())!.x))
      .toBe(0);
    await page.evaluate(() => {
      history.pushState({}, '', '/sidekick-spa');
      document.title = 'SPA compatibility';
    });
    await expect(
      ui.getByRole('button', { name: 'SPA compatibility', exact: true }),
    ).toBeAttached();
    await page.evaluate(() => {
      const main = document.createElement('main');
      main.textContent = 'Replaced body';
      const body = document.createElement('body');
      body.append(main);
      document.body.replaceWith(body);
    });
    await expect(sidebar).toBeVisible();
    await page.evaluate(() =>
      document.querySelector('sidekick-sidebar')!.remove(),
    );
    await inspectOverlay(page);
    await expect(page.locator('sidekick-sidebar')).toHaveCount(1);
    await ui
      .getByRole('button', { name: 'Open Sidekick', exact: true })
      .hover();
    await expect(sidebar).toBeVisible();
    await page.close();
    await context.unroute(url);
  });
}

test('saved pinned mode waits for a gesture; hidden mode retains its edge activation', async () => {
  const control = await context.newPage();
  await control.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  await expect(
    control.getByText('All tabs · this window', { exact: true }),
  ).toBeVisible();
  await control.evaluate(async () => {
    const key = 'sidekick.metadata.v1';
    const values = await chrome.storage.local.get(key);
    (values[key] as Metadata).preferences.mode = 'pinned';
    await chrome.storage.local.set(values);
  });
  const page = await context.newPage();
  await page.goto(origin);
  await inspectOverlay(page);
  const ui = page.locator('sidekick=.sidekick-root');
  const sidebar = ui.getByRole('complementary', { includeHidden: true });
  const pinnedEdge = ui.getByRole('button', { name: 'Open pinned Sidekick' });
  await expect(pinnedEdge).toBeVisible();
  await pinnedEdge.hover();
  await expect(sidebar).toBeHidden();
  expect(
    await control.evaluate(
      async () =>
        (
          await chrome.runtime.getContexts({
            contextTypes: ['SIDE_PANEL' as chrome.runtime.ContextType],
          })
        ).length,
    ),
  ).toBe(0);
  await pinnedEdge.click();
  await expect
    .poll(() =>
      control.evaluate(
        async () =>
          (
            await chrome.runtime.getContexts({
              contextTypes: ['SIDE_PANEL' as chrome.runtime.ContextType],
            })
          ).length,
      ),
    )
    .toBe(1);
  await expect(sidebar).toBeHidden();
  await control.evaluate(async () => {
    const windowId = (await chrome.windows.getCurrent()).id!;
    await chrome.sidePanel.close({ windowId });
  });
  const edge = ui.getByRole('button', { name: 'Open Sidekick', exact: true });
  await expect(edge).toBeVisible();
  if (!(await sidebar.isVisible())) await edge.hover();
  await expect(sidebar).toBeVisible();
  await ui.getByRole('button', { name: 'Open settings' }).click();
  await ui.getByLabel('Display mode').selectOption('hidden');
  await expect(sidebar).toBeHidden();
  await expect(edge).toBeVisible();
  await page.mouse.move(800, 500);
  await edge.hover();
  await expect(sidebar).toBeHidden();
  await edge.click();
  await expect(sidebar).toBeVisible();
  // A delayed blur/close from the previous settings view must not dismiss the
  // explicit edge activation after it has already opened successfully.
  await page.waitForTimeout(750);
  await expect(sidebar).toBeVisible();
  await page.close();
  await control.close();
});
