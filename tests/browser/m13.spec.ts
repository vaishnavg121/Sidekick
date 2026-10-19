import {
  test,
  expect,
  chromium,
  selectors,
  type BrowserContext,
  type Page,
  type Worker,
  type Locator,
} from '@playwright/test';
import { createServer, type Server } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { resolve, dirname, basename } from 'node:path';
import { tmpdir } from 'node:os';
let context: BrowserContext,
  worker: Worker,
  server: Server,
  profile: string,
  origin: string;
async function overlay(page: Page): Promise<Locator> {
  await expect(page.locator('sidekick-sidebar')).toHaveCount(1);
  const cdp = await context.newCDPSession(page);
  const { root } = await cdp.send('DOM.getDocument', {
    depth: -1,
    pierce: true,
  });
  interface DomNode {
    nodeName: string;
    nodeId: number;
    children?: DomNode[];
    shadowRoots?: DomNode[];
  }
  const find = (node: DomNode): DomNode | undefined =>
    node.nodeName === 'SIDEKICK-SIDEBAR'
      ? node
      : [...(node.children ?? []), ...(node.shadowRoots ?? [])]
          .map(find)
          .find(Boolean);
  const shadow = find(root)?.shadowRoots?.[0];
  if (!shadow) throw Error('No shadow root');
  const { object } = await cdp.send('DOM.resolveNode', {
    nodeId: shadow.nodeId,
  });
  await cdp.send('Runtime.callFunctionOn', {
    objectId: object.objectId,
    functionDeclaration: 'function(){window.__m13Shadow=this;}',
  });
  await cdp.detach();
  return page.locator('m13=.sidekick-root');
}
async function open(page: Page) {
  const ui = await overlay(page);
  if (
    !(await ui.getByRole('complementary', { includeHidden: true }).isVisible())
  )
    await ui
      .getByRole('button', { name: 'Open Sidekick', exact: true })
      .click();
  return ui;
}
test.beforeAll(async ({ browserName }, info) => {
  expect(browserName).toBe('chromium');
  await selectors.register('m13', () => ({
    query(_root: Node, selector: string) {
      return (
        (
          window as Window & { __m13Shadow?: ShadowRoot }
        ).__m13Shadow?.querySelector(selector) ?? null
      );
    },
    queryAll(_root: Node, selector: string) {
      return Array.from(
        (
          window as Window & { __m13Shadow?: ShadowRoot }
        ).__m13Shadow?.querySelectorAll(selector) ?? [],
      );
    },
  }));
  server = createServer((req, res) => {
    res.setHeader('Content-Type', 'text/html');
    res.end(
      `<!doctype html><html style="color:rgb(20, 30, 40)"><title>Dock garden ${req.url}</title><style>html{margin:0;padding:0}body{margin:0}header{position:fixed;left:0;top:0;width:100%;background:#cde4ed;padding:16px;box-sizing:border-box}nav{position:sticky;top:55px;background:#ece5fc;padding:12px}main{padding:90px 24px 20px;min-height:1900px}article{width:100%;max-width:850px;margin:auto}button.action{position:fixed;right:18px;bottom:18px;width:140px}body>footer{width:100vw;height:40px;background:#ddd}</style><header>Important fixed website controls</header><main><nav>Sticky navigation</nav><article><h1>Content fits beside Sidekick</h1><p>Responsive document and normal scrolling.</p></article></main><button class="action" style="opacity:0.9">Website action</button><footer>Viewport-width footer</footer></html>`,
    );
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const address = server.address();
  if (!address || typeof address === 'string') throw Error('No server');
  origin = `http://127.0.0.1:${address.port}`;
  profile = await mkdtemp(resolve(tmpdir(), 'sidekick-m13-'));
  const extension = resolve('.output/chrome-mv3');
  context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium',
    headless: info.project.use.headless !== false,
    viewport: { width: 1280, height: 900 },
    args: [
      `--disable-extensions-except=${extension}`,
      `--load-extension=${extension}`,
    ],
  });
  worker =
    context.serviceWorkers()[0] ??
    (await context.waitForEvent('serviceworker'));
});
test.afterAll(async () => {
  await context?.close();
  await new Promise<void>((done) => server?.close(() => done()));
  if (
    dirname(resolve(profile)).toLowerCase() !==
      resolve(tmpdir()).toLowerCase() ||
    !basename(profile).startsWith('sidekick-m13-')
  )
    throw Error('Unexpected test profile');
  await rm(profile, { recursive: true, force: true });
});

test('Docking visual: custom left sidebar reflows fixed/sticky content, resizes, scrolls and restores without native panels', async () => {
  const page = await context.newPage();
  await page.goto(origin + '/layout');
  const ui = await open(page);
  const before = await page.evaluate(() => ({
    html: document.documentElement.style.cssText,
    body: document.body.style.cssText,
    header: (document.querySelector('header') as HTMLElement).style.cssText,
    action: (document.querySelector('.action') as HTMLElement).style.cssText,
  }));
  await page.screenshot({ path: 'test-results/m13-before.png' });
  for (const width of [1280, 1000, 900]) {
    await page.setViewportSize({ width, height: 900 });
    for (let repeat = 0; repeat < 3; repeat++) {
      if (
        !(await ui
          .getByRole('complementary', { includeHidden: true })
          .isVisible())
      )
        await ui
          .getByRole('button', { name: 'Open Sidekick', exact: true })
          .click();
      await ui
        .getByRole('button', { name: 'Dock sidebar', exact: true })
        .click();
      await expect
        .poll(() =>
          page.evaluate(
            () => document.documentElement.getBoundingClientRect().left,
          ),
        )
        .toBe(320);
      await expect(ui).toHaveClass(/docked/);
      const boxes = await page.evaluate(() => ({
        root: document.documentElement.getBoundingClientRect().toJSON(),
        header: document
          .querySelector('header')!
          .getBoundingClientRect()
          .toJSON(),
        main: document.querySelector('main')!.getBoundingClientRect().toJSON(),
        action: document
          .querySelector('.action')!
          .getBoundingClientRect()
          .toJSON(),
        viewport: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
      }));
      expect(boxes.header.x).toBeGreaterThanOrEqual(319);
      expect(boxes.main.x).toBeGreaterThanOrEqual(319);
      expect(boxes.header.right).toBeLessThanOrEqual(boxes.viewport + 2);
      expect(boxes.action.right).toBeLessThanOrEqual(boxes.viewport + 2);
      expect(boxes.scrollWidth).toBeLessThanOrEqual(boxes.viewport + 2);
      expect(
        await worker.evaluate(
          async () =>
            (
              await chrome.runtime.getContexts({
                contextTypes: ['SIDE_PANEL' as chrome.runtime.ContextType],
              })
            ).length,
        ),
      ).toBe(0);
      if (!repeat) {
        await page.screenshot({ path: `test-results/m13-docked-${width}.png` });
        await page.evaluate(() => scrollTo(0, 400));
        expect(await page.evaluate(() => scrollY)).toBeGreaterThan(0);
        const sticky = await page.locator('nav').boundingBox();
        expect(sticky!.x).toBeGreaterThanOrEqual(320);
        await page.screenshot({
          path: `test-results/m13-scrolled-${width}.png`,
        });
        await page.evaluate(() => scrollTo(0, 0));
      }
      await ui
        .getByRole('button', { name: 'Undock sidebar', exact: true })
        .click();
      await expect
        .poll(() =>
          page.evaluate(
            () => document.documentElement.getBoundingClientRect().left,
          ),
        )
        .toBe(0);
      expect(
        await page.evaluate(() => ({
          html: document.documentElement.style.cssText,
          body: document.body.style.cssText,
          header: (document.querySelector('header') as HTMLElement).style
            .cssText,
          action: (document.querySelector('.action') as HTMLElement).style
            .cssText,
        })),
      ).toEqual(before);
    }
  }
  await ui.getByRole('button', { name: 'Dock sidebar', exact: true }).click();
  await ui.getByRole('button', { name: 'Open settings', exact: true }).click();
  await ui
    .getByRole('slider', { name: 'Sidebar width', exact: true })
    .fill('360');
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.getBoundingClientRect().left,
      ),
    )
    .toBe(360);
  await ui
    .getByRole('slider', { name: 'Sidebar width', exact: true })
    .fill('320');
  await ui.getByLabel('Display mode').selectOption('hover');
  await page.screenshot({ path: 'test-results/m13-after-undock.png' });
  await page.close();
});
test('unsafe and narrow pages explicitly fall back, preserving author edits and recovering after resize', async () => {
  const page = await context.newPage();
  await page.goto(origin + '/unsafe');
  let ui = await open(page);
  await page.evaluate(
    () => (document.documentElement.style.transform = 'translateX(2px)'),
  );
  await ui.getByRole('button', { name: 'Dock sidebar', exact: true }).click();
  await expect(ui.getByText(/incompatible document layout/)).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.style.marginLeft),
  ).toBe('');
  await ui
    .getByRole('button', { name: 'Use Hover overlay', exact: true })
    .click();
  await page.evaluate(() =>
    document.documentElement.style.removeProperty('transform'),
  );
  await page.setViewportSize({ width: 700, height: 850 });
  await ui.getByRole('button', { name: 'Dock sidebar', exact: true }).click();
  await expect(ui.getByText(/too narrow/)).toBeVisible();
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.getBoundingClientRect().left,
      ),
    )
    .toBe(320);
  await page.evaluate(() =>
    document.documentElement.style.setProperty(
      'color',
      'rgb(9, 8, 7)',
      'important',
    ),
  );
  await ui.getByRole('button', { name: 'Undock sidebar', exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.style.color)).toBe(
    'rgb(9, 8, 7)',
  );
  await page.reload();
  ui = await open(page);
  await expect(
    ui.getByRole('button', { name: 'Dock sidebar', exact: true }),
  ).toBeVisible();
  await page.close();
});
test('Favorites are compact, independent, editable, reorderable and reuse existing live tabs', async () => {
  const page = await context.newPage();
  await page.goto(origin + '/favorite-a');
  await page.evaluate(() =>
    document.body.addEventListener('drop', () => {
      document.body.dataset.websiteDrop = 'received';
    }),
  );
  const ui = await open(page);
  await ui
    .getByRole('button', { name: 'Add current tab to Favorites', exact: true })
    .dblclick();
  await expect(ui.locator('.favorite-tile')).toHaveCount(1);
  await ui.getByRole('button', { name: 'Add shortcut', exact: true }).click();
  await ui.getByLabel('Shortcut name').fill('Favorite B');
  await ui.getByLabel('Web address').fill(origin + '/favorite-b');
  await ui.getByRole('button', { name: 'Save shortcut', exact: true }).click();
  await expect(ui.locator('.favorite-tile')).toHaveCount(2);
  const a = await ui
    .locator('.favorites-grid>li')
    .nth(0)
    .getAttribute('data-resource-id');
  const b = await ui
    .locator('.favorites-grid>li')
    .nth(1)
    .getAttribute('data-resource-id');
  const drag = await page.evaluateHandle(() => new DataTransfer());
  await drag.evaluate(
    (data, value) =>
      data.setData('application/x-sidekick-entry', JSON.stringify(value)),
    {
      kind: 'favorite',
      id: b!,
      workspaceId: await worker.evaluate(
        async () =>
          (
            (await chrome.storage.local.get('sidekick.metadata.v1'))[
              'sidekick.metadata.v1'
            ] as { activeWorkspaceId: string }
          ).activeWorkspaceId,
      ),
    },
  );
  await ui
    .locator('.favorites-grid>li')
    .nth(0)
    .dispatchEvent('drop', { dataTransfer: drag });
  await drag.dispose();
  expect(
    await page.evaluate(() => document.body.dataset.websiteDrop),
  ).toBeUndefined();
  await expect(ui.locator('.favorites-grid>li').first()).toHaveAttribute(
    'data-resource-id',
    b!,
  );
  const count = await worker.evaluate(
    async () => (await chrome.tabs.query({})).length,
  );
  await ui.locator(`[data-resource-id="${a}"] .favorite-tile`).dblclick();
  await expect
    .poll(() =>
      worker.evaluate(async () => (await chrome.tabs.query({})).length),
    )
    .toBe(count);
  await ui
    .getByRole('button', { name: 'Actions for Favorite B', exact: true })
    .click();
  await ui
    .getByRole('menuitem', { name: 'Edit Favorite B', exact: true })
    .click();
  await ui.getByLabel('Shortcut name').fill('Favorite renamed');
  await ui.getByRole('button', { name: 'Save shortcut', exact: true }).click();
  await expect(
    ui.getByRole('button', { name: 'Favorite renamed', exact: true }),
  ).toBeVisible();
  await page.reload();
  const refreshed = await open(page);
  await expect(
    refreshed.getByRole('button', { name: 'Favorite renamed', exact: true }),
  ).toBeVisible();
  await page.close();
});
test('Pinned tabs persist nested folders, accept tab drags and unpin into Today without Chrome native pins', async () => {
  const page = await context.newPage();
  await page.goto(origin + '/pin-a');
  const ui = await open(page);
  await ui
    .getByRole('button', { name: 'Pin current tab', exact: true })
    .dblclick();
  await expect(ui.locator('.pinned-row')).toHaveCount(1);
  await ui
    .getByRole('button', { name: 'Create pinned folder', exact: true })
    .click();
  await ui.getByLabel('Folder name').fill('Research');
  await ui.getByRole('button', { name: 'Save folder', exact: true }).click();
  await expect(ui.locator('.pinned-folder')).toHaveCount(1);
  const pinned = ui.locator('.pinned-row');
  const entryId = await pinned.getAttribute('data-resource-id');
  const workspaceId = await worker.evaluate(
    async () =>
      (
        (await chrome.storage.local.get('sidekick.metadata.v1'))[
          'sidekick.metadata.v1'
        ] as { activeWorkspaceId: string }
      ).activeWorkspaceId,
  );
  const data = await page.evaluateHandle(() => new DataTransfer());
  await data.evaluate(
    (drag, value) =>
      drag.setData('application/x-sidekick-entry', JSON.stringify(value)),
    { kind: 'pinned', id: entryId!, workspaceId },
  );
  await ui
    .locator('.pinned-folder-heading')
    .dispatchEvent('drop', { dataTransfer: data });
  await expect(ui.locator('.pinned-folder .pinned-row')).toHaveCount(1);
  await ui
    .getByRole('button', { name: /Research/ })
    .first()
    .click();
  await expect(ui.locator('.pinned-row')).toHaveCount(0);
  await page.reload();
  const refreshed = await open(page);
  await expect(
    refreshed.getByRole('button', { name: /Research/ }).first(),
  ).toHaveAttribute('aria-expanded', 'false');
  await refreshed
    .getByRole('button', { name: /Research/ })
    .first()
    .click();
  await expect(refreshed.locator('.pinned-row')).toHaveCount(1);
  await data.dispose();
  const unpinData = await page.evaluateHandle(() => new DataTransfer());
  await unpinData.evaluate(
    (drag, value) =>
      drag.setData('application/x-sidekick-entry', JSON.stringify(value)),
    { kind: 'pinned', id: entryId!, workspaceId },
  );
  await refreshed
    .getByRole('region', { name: 'Today tabs' })
    .dispatchEvent('drop', { dataTransfer: unpinData });
  await unpinData.dispose();
  await expect(refreshed.locator('.pinned-row')).toHaveCount(0);
  expect(
    await worker.evaluate(async () =>
      (await chrome.tabs.query({})).some((tab) => tab.pinned),
    ),
  ).toBe(false);
  await page.close();
});
test('YouTube adapter contains its absolute Home canvas and rejects other layouts', async () => {
  const page = await context.newPage();
  const html =
    '<!doctype html><style>html,body{margin:0;height:100%}ytd-app{display:block}ytd-page-manager{display:block;position:absolute;left:72px;right:0;top:56px}ytd-browse{display:block}header{position:fixed;left:0;top:0;width:100%;height:56px}main{height:500px}</style><ytd-app><header>Site header</header><ytd-page-manager><ytd-browse page-subtype="home"><main>Important content</main></ytd-browse></ytd-page-manager></ytd-app>';
  await context.route('https://www.youtube.com/sidekick-fixture', (route) =>
    route.fulfill({ contentType: 'text/html', body: html }),
  );
  await page.goto('https://www.youtube.com/sidekick-fixture');
  const ui = await open(page);
  await ui.getByRole('button', { name: 'Dock sidebar', exact: true }).click();
  await expect
    .poll(() =>
      page
        .locator('ytd-page-manager')
        .evaluate((e) => e.getBoundingClientRect().left),
    )
    .toBe(392);
  await ui.getByRole('button', { name: 'Undock sidebar', exact: true }).click();
  await expect
    .poll(() =>
      page
        .locator('ytd-page-manager')
        .evaluate((e) => e.getBoundingClientRect().left),
    )
    .toBe(72);
  expect(
    await page.evaluate(() => document.documentElement.style.position),
  ).toBe('');
  await page
    .locator('ytd-browse')
    .evaluate((e) => e.setAttribute('page-subtype', 'watch'));
  await ui.getByRole('button', { name: 'Dock sidebar', exact: true }).click();
  await expect(ui.getByText(/YouTube layout is not verified/)).toBeVisible();
  await ui
    .getByRole('button', { name: 'Use Hover overlay', exact: true })
    .click();
  await context.unroute('https://www.youtube.com/sidekick-fixture');
  await page.close();
});

test('Pinned rename, reorder, workspace moves, Today drag and closed-tab reopening use durable entries', async () => {
  const first = await context.newPage();
  await first.goto(origin + '/pin-reopen');
  let ui = await open(first);
  const originalWorkspace = await ui
    .getByLabel('Workspace', { exact: true })
    .inputValue();
  await ui
    .getByRole('button', { name: 'Pin current tab', exact: true })
    .click();
  await ui
    .getByRole('button', {
      name: 'Actions for pinned Dock garden /pin-reopen',
      exact: true,
    })
    .click();
  await ui
    .getByRole('menuitem', { name: 'Rename / edit pinned entry', exact: true })
    .click();
  await ui.getByLabel('Pinned name').fill('Durable pinned');
  await ui
    .getByRole('button', { name: 'Save pinned entry', exact: true })
    .click();
  const second = await context.newPage();
  await second.goto(origin + '/pin-second');
  ui = await open(second);
  await ui
    .getByRole('button', { name: 'Create workspace', exact: true })
    .click();
  await ui
    .getByLabel('Workspace name', { exact: true })
    .fill('Move destination');
  await ui.getByRole('button', { name: 'Save workspace', exact: true }).click();
  await expect(ui.getByLabel('Workspace', { exact: true })).not.toHaveValue(
    originalWorkspace,
  );
  const targetWorkspace = await ui
    .getByLabel('Workspace', { exact: true })
    .inputValue();
  await ui
    .getByLabel('Workspace', { exact: true })
    .selectOption(originalWorkspace);
  await ui
    .getByRole('button', {
      name: 'Actions for pinned Durable pinned',
      exact: true,
    })
    .click();
  await ui
    .getByLabel('Move pinned Durable pinned to workspace', { exact: true })
    .selectOption(targetWorkspace);
  await expect(
    ui.getByRole('button', { name: 'Open pinned Durable pinned', exact: true }),
  ).toHaveCount(0);
  await ui
    .getByLabel('Workspace', { exact: true })
    .selectOption(targetWorkspace);
  await expect(
    ui.getByRole('button', { name: 'Open pinned Durable pinned', exact: true }),
  ).toBeVisible();
  await first.close();
  const created = context.waitForEvent('page');
  await ui
    .getByRole('button', { name: 'Open pinned Durable pinned', exact: true })
    .dblclick();
  const reopened = await created;
  await expect(reopened).toHaveURL(origin + '/pin-reopen');
  await second.bringToFront();
  const tabId = await worker.evaluate(
    async (url) =>
      (await chrome.tabs.query({})).find((t) => t.url === url)!.id!,
    origin + '/pin-second',
  );
  const data = await second.evaluateHandle(() => new DataTransfer());
  await data.evaluate(
    (drag, value) =>
      drag.setData('application/x-sidekick-entry', JSON.stringify(value)),
    { kind: 'tab', id: String(tabId), workspaceId: targetWorkspace },
  );
  await ui
    .locator('.pinned-section')
    .dispatchEvent('drop', { dataTransfer: data });
  await data.dispose();
  await expect(ui.locator('.pinned-row')).toHaveCount(2);
  const firstId = await ui
    .locator('.pinned-row')
    .nth(0)
    .getAttribute('data-resource-id');
  const lastId = await ui
    .locator('.pinned-row')
    .nth(1)
    .getAttribute('data-resource-id');
  const reorder = await second.evaluateHandle(() => new DataTransfer());
  await reorder.evaluate(
    (drag, value) =>
      drag.setData('application/x-sidekick-entry', JSON.stringify(value)),
    { kind: 'pinned', id: lastId!, workspaceId: targetWorkspace },
  );
  await ui
    .locator('.pinned-row')
    .nth(0)
    .dispatchEvent('drop', { dataTransfer: reorder });
  await reorder.dispose();
  await expect(ui.locator('.pinned-row').first()).toHaveAttribute(
    'data-resource-id',
    lastId!,
  );
  expect(lastId).not.toBe(firstId);
  await reopened.close();
  await second.close();
});

test('New Tab includes one shared sidebar, workspace authoring and per-workspace themes/resources', async () => {
  const page = await context.newPage();
  await page.goto('chrome://newtab/');
  await expect(page.locator('.newtab-shell>.embedded .sidebar')).toHaveCount(1);
  await expect(
    page.getByRole('heading', { name: 'Make room for what matters.' }),
  ).toBeVisible();
  await expect(page.locator('sidekick-sidebar')).toHaveCount(0);
  expect(
    await worker.evaluate(
      () => chrome.runtime.getManifest().chrome_url_overrides?.newtab,
    ),
  ).toBe('newtab.html');
  const sidebar = page.locator('.embedded');
  await sidebar
    .getByRole('button', { name: 'Create workspace', exact: true })
    .click();
  await sidebar
    .getByLabel('Workspace name', { exact: true })
    .fill('Research space');
  await sidebar.getByLabel('Icon', { exact: true }).fill('R');
  await sidebar.getByLabel('Color', { exact: true }).fill('#bb88ee');
  await sidebar
    .getByLabel('Workspace theme', { exact: true })
    .selectOption('light');
  await sidebar
    .getByLabel('Email label · optional', { exact: true })
    .fill('research@example.test');
  await sidebar
    .getByRole('button', { name: 'Save workspace', exact: true })
    .click();
  await expect(page.locator('.newtab-shell')).toHaveAttribute(
    'data-theme',
    'light',
  );
  await page.setViewportSize({ width: 900, height: 900 });
  expect(
    (await page.locator('.dashboard').boundingBox())!.x,
  ).toBeGreaterThanOrEqual(240);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(900);
  await page.screenshot({
    path: 'test-results/m13-newtab-900.png',
    fullPage: true,
  });
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(sidebar.getByLabel('Workspace', { exact: true })).toHaveValue(
    /.+/,
  );
  await expect(sidebar.getByText('research@example.test')).toBeVisible();
  await expect(sidebar.locator('.favorite-tile')).toHaveCount(0);
  await expect(sidebar.locator('.pinned-row')).toHaveCount(0);
  await sidebar
    .getByRole('button', { name: 'Add shortcut', exact: true })
    .click();
  await sidebar.getByLabel('Shortcut name').fill('Research shortcut');
  await sidebar.getByLabel('Web address').fill(origin + '/research');
  await sidebar
    .getByRole('button', { name: 'Save shortcut', exact: true })
    .click();
  await expect(page.locator('.dashboard .favorite-tile')).toHaveCount(1);
  await page.screenshot({
    path: 'test-results/m13-newtab-light.png',
    fullPage: true,
  });
  await page.reload();
  await expect(page.locator('.newtab-shell')).toHaveAttribute(
    'data-theme',
    'light',
  );
  await expect(
    sidebar.getByRole('button', { name: 'Research shortcut', exact: true }),
  ).toBeVisible();
  await sidebar
    .getByRole('button', { name: 'Edit workspace', exact: true })
    .click();
  await sidebar
    .getByLabel('Workspace name', { exact: true })
    .fill('Research renamed');
  await sidebar
    .getByLabel('Workspace theme', { exact: true })
    .selectOption('dark');
  await sidebar
    .getByRole('button', { name: 'Save workspace', exact: true })
    .click();
  await expect(page.locator('.newtab-shell')).toHaveAttribute(
    'data-theme',
    'dark',
  );
  await page.screenshot({
    path: 'test-results/m13-newtab-dark.png',
    fullPage: true,
  });
  await sidebar
    .getByRole('button', { name: 'Hide sidebar', exact: true })
    .click();
  await expect(
    sidebar.getByRole('complementary', { includeHidden: true }),
  ).toBeHidden();
  await sidebar
    .getByRole('button', { name: 'Open Sidekick', exact: true })
    .click();
  await expect(
    sidebar.getByRole('complementary', { includeHidden: true }),
  ).toBeVisible();
  await page.close();
});
