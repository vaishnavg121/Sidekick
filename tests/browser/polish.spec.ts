import { mockJev, validDecisions } from './mock-jev';
import {
  test,
  expect,
  chromium,
  type BrowserContext,
  type Page,
  type Worker,
} from '@playwright/test';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { resolve, dirname, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { createServer, type Server } from 'node:http';
import { inspectClosedRoot, registerClosedRootSelector } from './closed-root';
import { APPEARANCE_PRESETS, parseTheme } from '../../lib/appearance';
import type { Command, Reply } from '../../lib/protocol';
let context: BrowserContext,
  worker: Worker,
  page: Page,
  profile: string,
  server: Server,
  origin: string,
  extensionId: string;
let ownedErrors: string[] = [];
async function request(
  command: Command,
  from = page,
): Promise<Extract<Reply, { ok: true }>> {
  const reply = (await from.evaluate(
    async (command) =>
      chrome.runtime.sendMessage({
        channel: 'sidekick',
        command,
        windowId: (await chrome.windows.getCurrent()).id,
      }),
    command,
  )) as Reply;
  if (!reply.ok) throw Error(reply.error);
  return reply;
}
async function metadata() {
  return worker.evaluate(
    async () =>
      (await chrome.storage.local.get('sidekick.metadata.v1'))[
        'sidekick.metadata.v1'
      ] as import('../../lib/models').Metadata,
  );
}
async function workspace(name: string) {
  const ui = page.locator('.embedded');
  await ui
    .getByRole('button', { name: 'Create workspace', exact: true })
    .click();
  await ui.getByLabel('Workspace name', { exact: true }).fill(name);
  await ui.getByRole('button', { name: 'Save workspace', exact: true }).click();
  await expect(ui.getByLabel('Workspace', { exact: true })).toHaveValue(
    (await expect
      .poll(async () =>
        (await metadata()).workspaces.some((w) => w.name === name),
      )
      .toBe(true),
    (await metadata()).workspaces.find((w) => w.name === name)!.id),
  );
  return (await metadata()).workspaces.find((w) => w.name === name)!.id;
}
test.beforeAll(async () => {
  await registerClosedRootSelector();
  server = createServer((req, res) => {
    res.setHeader('Content-Type', 'text/html');
    res.end(
      `<!doctype html><title>${req.url?.slice(1) || 'Fixture'}</title><h1>${req.url}</h1><input placeholder="Website input"><script>window.loadToken=crypto.randomUUID()</script>`,
    );
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const a = server.address();
  if (!a || typeof a === 'string') throw Error('No fixture server');
  origin = `http://127.0.0.1:${a.port}`;
});
test.afterAll(async () => {
  await new Promise<void>((done) => server.close(() => done()));
});
test.beforeEach(async ({ browserName }, info) => {
  expect(browserName).toBe('chromium');
  ownedErrors = [];
  profile = await mkdtemp(resolve(tmpdir(), 'sidekick-master-'));
  const extension = resolve('.output/chrome-mv3');
  context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium',
    headless: info.project.use.headless !== false,
    viewport: { width: 1280, height: 900 },
    args: [
      '--host-resolver-rules=MAP ai-gateway.vercel.sh ~NOTFOUND',
      `--disable-extensions-except=${extension}`,
      `--load-extension=${extension}`,
    ],
  });
  context.on('page', (p) =>
    p.on('pageerror', (e) => ownedErrors.push(e.message)),
  );
  worker =
    context.serviceWorkers()[0] ??
    (await context.waitForEvent('serviceworker'));
  extensionId = new URL(worker.url()).host;
  page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/dashboard.html`);
  await expect(
    page.locator('.embedded').getByLabel('Workspace', { exact: true }),
  ).not.toHaveValue('');
  const got = page.getByRole('button', { name: 'Got it', exact: true });
  if (await got.count()) await got.click();
});
test.afterEach(async () => {
  await context?.close();
  if (
    dirname(resolve(profile)).toLowerCase() !==
      resolve(tmpdir()).toLowerCase() ||
    !basename(profile).startsWith('sidekick-master-')
  )
    throw Error('Unexpected profile');
  await rm(profile, { recursive: true, force: true });
  expect(ownedErrors).toEqual([]);
});

async function studio() {
  await page.goto(`chrome-extension://${extensionId}/options.html`);
  await page.locator('.appearance-entry > summary').click();
  return page.locator('.appearance-studio');
}
async function token(name: string) {
  return page
    .locator('.sidekick-root')
    .first()
    .evaluate(
      (el, name) => getComputedStyle(el).getPropertyValue(name).trim(),
      name,
    );
}
test('Appearance Studio: all controls preview without writes, apply persists, hue supports pointer and keyboard', async () => {
  const before = await metadata(),
    editor = await studio();
  for (const name of [
    'Minimal Dark',
    'Minimal Light',
    'Graphite',
    'Warm Neutral',
    'Deep Ocean',
    'Soft Lavender',
    'Frosted Glass',
  ])
    await editor
      .getByRole('button', { name: `Preset ${name}`, exact: true })
      .click();
  await editor
    .getByRole('button', { name: 'Preset Graphite', exact: true })
    .click();
  await editor
    .getByLabel('Appearance color mode', { exact: true })
    .selectOption('light');
  await expect.poll(() => token('--sk-bg')).toBe('#f5f5f2');
  await page.emulateMedia({ colorScheme: 'light' });
  await editor
    .getByLabel('Appearance color mode', { exact: true })
    .selectOption('system');
  await expect.poll(() => token('--sk-bg')).toBe('#f5f5f2');
  await editor
    .getByLabel('Appearance color mode', { exact: true })
    .selectOption('dark');
  await page.emulateMedia({ colorScheme: 'dark' });
  await editor
    .getByRole('button', { name: 'Preset Graphite', exact: true })
    .click();
  for (const [label, hex, restore] of [
    ['Base color', '#242628', '#232425'],
    ['Secondary accent', '#ad9fbf', '#959ba4'],
  ]) {
    await editor.getByLabel(label!, { exact: true }).fill(hex!);
    await editor.getByLabel(label!, { exact: true }).press('Tab');
    await editor.getByLabel(label!, { exact: true }).fill(restore!);
    await editor.getByLabel(label!, { exact: true }).press('Tab');
  }
  await editor.getByLabel('Accent color', { exact: true }).fill('#3579a2');
  await editor.getByLabel('Accent color', { exact: true }).press('Tab');
  const ring = editor.getByRole('slider', { name: 'Hue', exact: true });
  await ring.focus();
  await ring.press('Home');
  await ring.press('ArrowRight');
  await expect(ring).toHaveAttribute('aria-valuenow', '1');
  await ring.click({ position: { x: 95, y: 49 } });
  await expect(ring).toHaveAttribute('aria-valuenow', /8[5-9]|9[0-5]/);
  await editor.getByLabel('Accent color', { exact: true }).fill('#000000');
  await editor.getByLabel('Accent color', { exact: true }).press('Tab');
  await editor
    .getByRole('slider', { name: 'Saturation', exact: true })
    .press('End');
  await expect(
    editor.getByRole('slider', { name: 'Saturation', exact: true }),
  ).toHaveValue('100');
  await editor
    .getByRole('slider', { name: 'Brightness', exact: true })
    .press('End');
  await editor.getByLabel('Accent color', { exact: true }).fill('#ffffff');
  await editor.getByLabel('Accent color', { exact: true }).press('Tab');
  await ring.press('ArrowRight');
  await expect(ring).toHaveAttribute('aria-valuenow', '91');
  await ring.press('ArrowLeft');
  await editor
    .getByRole('slider', { name: 'Saturation', exact: true })
    .press('End');
  for (const label of [
    'Saturation',
    'Brightness',
    'Text contrast',
    'Surface strength',
    'Border opacity',
    'Shadow depth',
    'Sidebar opacity',
    'Backdrop blur',
    'Grain',
    'Surface softness',
    'Corner radius',
    'Row density',
    'Animation intensity',
  ])
    await editor.getByRole('slider', { name: label, exact: true }).press('End');
  await editor
    .getByLabel('Background fill', { exact: true })
    .selectOption('linear');
  await editor
    .getByRole('button', { name: 'Add color stop', exact: true })
    .click();
  await editor
    .getByLabel('Gradient stop 3 color', { exact: true })
    .fill('#a3bdaf');
  await editor
    .getByRole('slider', { name: 'Gradient stop 3 position', exact: true })
    .press('Home');
  await editor
    .getByRole('slider', { name: 'Gradient angle', exact: true })
    .press('End');
  await editor
    .getByRole('slider', { name: 'Gradient intensity', exact: true })
    .press('End');
  await expect.poll(() => token('--sk-gradient')).toContain('linear-gradient');
  expect((await metadata()).appearance).toEqual(before.appearance);
  await page.screenshot({
    animations: 'disabled',
    path: 'test-results/polish-studio.png',
  });
  await ring.scrollIntoViewIfNeeded();
  await page.screenshot({
    animations: 'disabled',
    path: 'test-results/polish-color-wheel.png',
  });
  await expect(editor.locator('.hue-ring')).toHaveScreenshot(
    'color-wheel.png',
    { animations: 'disabled' },
  );
  await editor
    .getByRole('button', { name: 'Apply appearance', exact: true })
    .click();
  await expect
    .poll(
      async () => (await metadata()).appearance?.global?.gradient.stops.length,
    )
    .toBe(3);
  const saved = (await metadata()).appearance!.global!;
  expect(saved).toMatchObject({
    contrast: 100,
    surfaceOpacity: 100,
    borderOpacity: 40,
    shadow: 80,
    transparency: 100,
    blur: 24,
    grain: 6,
    softness: 8,
    radius: 16,
    density: 115,
    motion: 150,
  });
  expect(saved.blur).toBe(24);
  expect(saved.grain).toBe(6);
  expect(saved.radius).toBe(16);
  expect(saved.motion).toBe(150);
  expect((await metadata()).workspaces).toEqual(before.workspaces);
  await page.reload();
  expect((await metadata()).appearance?.global).toEqual(saved);
  await expect.poll(() => token('--sk-blur')).toBe('24px');
  await page.locator('.appearance-entry > summary').click();
  await page
    .locator('.appearance-studio')
    .getByLabel('Background fill', { exact: true })
    .selectOption('radial');
  for (const label of ['Radial center X', 'Radial center Y'])
    await page.getByRole('slider', { name: label, exact: true }).press('End');
  await expect.poll(() => token('--sk-gradient')).toContain('at 100% 100%');
  await page.screenshot({
    animations: 'disabled',
    path: 'test-results/polish-gradient.png',
  });
  await expect(page.locator('.gradient-preview')).toHaveScreenshot(
    'gradient-preview.png',
    { animations: 'disabled' },
  );
  await page
    .getByRole('button', { name: 'Remove gradient stop 3', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Remove gradient stop 1', exact: true }),
  ).toBeDisabled();
});
test('Appearance files: real download/import, invalid CSS rejection, preview discard and inheritance reset', async () => {
  const editor = await studio();
  await editor
    .getByRole('button', { name: 'Preset Deep Ocean', exact: true })
    .click();
  const download = page.waitForEvent('download');
  await editor
    .getByRole('button', { name: 'Export theme', exact: true })
    .click();
  const path = await (await download).path();
  const exported = await readFile(path!, 'utf8');
  expect(parseTheme(exported).base).toBe('#12232e');
  expect(exported).not.toContain('gatewayKey');
  await editor.getByLabel('Import theme file').setInputFiles({
    name: 'unsafe.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        format: 'sidekick-theme',
        appearance: { base: 'url(https://evil.test)' },
      }),
    ),
  });
  await expect(editor.getByRole('alert')).toContainText('Invalid theme');
  expect((await metadata()).appearance).toBeUndefined();
  await editor.getByLabel('Import theme file').setInputFiles({
    name: 'safe.json',
    mimeType: 'application/json',
    buffer: Buffer.from(exported),
  });
  await expect(editor.locator('p[role="status"]')).toContainText(
    'Imported preview',
  );
  await editor
    .getByRole('button', { name: 'Apply appearance', exact: true })
    .click();
  await expect
    .poll(async () => (await metadata()).appearance?.global?.base)
    .toBe('#12232e');
  await editor
    .getByRole('button', { name: 'Preset Minimal Light', exact: true })
    .click();
  await editor
    .getByRole('button', { name: 'Discard preview', exact: true })
    .click();
  await expect.poll(() => token('--sk-bg')).toBe('#12232e');
  await editor
    .getByRole('button', { name: 'Reset preview', exact: true })
    .click();
  expect((await metadata()).appearance?.global?.base).toBe('#12232e');
  await editor
    .getByRole('button', { name: 'Use inherited appearance', exact: true })
    .click();
  await expect
    .poll(async () => (await metadata()).appearance?.global)
    .toBeUndefined();
});
test('Appearance workspace overrides preserve old metadata and independently follow window selection', async () => {
  const initial = await metadata(),
    first = initial.activeWorkspaceId,
    other = await workspace('Separate theme');
  await request({ type: 'workspace.select', id: first });
  let editor = await studio();
  await editor
    .getByRole('button', { name: 'Preset Graphite', exact: true })
    .click();
  await editor
    .getByRole('button', { name: 'Apply appearance', exact: true })
    .click();
  await expect
    .poll(async () => (await metadata()).appearance?.global?.base)
    .toBe('#232425');
  await editor.getByLabel('Appearance scope').selectOption('workspace');
  await editor
    .getByRole('button', { name: 'Preset Deep Ocean', exact: true })
    .click();
  await editor
    .getByRole('button', { name: 'Apply appearance', exact: true })
    .click();
  await expect
    .poll(async () => (await metadata()).appearance?.workspaces?.[first]?.base)
    .toBe('#12232e');
  await page.locator('.appearance-entry > summary').click();
  await request({ type: 'workspace.select', id: other });
  await expect.poll(() => token('--sk-bg')).toBe('#232425');
  await page.screenshot({
    animations: 'disabled',
    path: 'test-results/polish-workspace-global.png',
  });
  await request({ type: 'workspace.select', id: first });
  await expect.poll(() => token('--sk-bg')).toBe('#12232e');
  await page.screenshot({
    animations: 'disabled',
    path: 'test-results/polish-workspace-override.png',
  });
  expect((await metadata()).workspaces[0]!.id).toBe(initial.workspaces[0]!.id);
  editor = await studio();
  await editor.getByLabel('Appearance scope').selectOption('workspace');
  await editor
    .getByRole('button', { name: 'Use inherited appearance', exact: true })
    .click();
  await expect
    .poll(async () => (await metadata()).appearance?.workspaces?.[first])
    .toBeUndefined();
});
test('Visual matrix: seven coherent presets, narrow/wide windows, palette and reduced motion', async () => {
  const editor = await studio();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  for (const [name, slug] of [
    ['Minimal Dark', 'dark'],
    ['Minimal Light', 'light'],
    ['Graphite', 'graphite'],
    ['Warm Neutral', 'warm'],
    ['Deep Ocean', 'ocean'],
    ['Soft Lavender', 'lavender'],
    ['Frosted Glass', 'frosted'],
  ]) {
    await editor
      .getByRole('button', { name: `Preset ${name}`, exact: true })
      .click();
    await page.screenshot({
      animations: 'disabled',
      path: `test-results/polish-${slug}.png`,
    });
  }
  await editor
    .getByRole('button', { name: 'Apply appearance', exact: true })
    .click();
  await page.goto(`chrome-extension://${extensionId}/dashboard.html`);
  for (const [width, height] of [
    [1366, 768],
    [1920, 1080],
    [520, 768],
  ] as const) {
    await page.setViewportSize({ width, height });
    await expect(page.locator('.embedded .sidebar')).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      animations: 'disabled',
      path: `test-results/polish-viewport-${width}.png`,
    });
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page
    .locator('.embedded')
    .getByRole('button', { name: 'Open command palette (Alt+Shift+K)' })
    .click();
  await expect(
    page.getByRole('combobox', { name: 'Command palette search' }),
  ).toBeFocused();
  expect(
    await page
      .locator('.command-palette')
      .evaluate((el) => getComputedStyle(el).animationName),
  ).toBe('none');
  await page.screenshot({
    animations: 'disabled',
    path: 'test-results/polish-palette-narrow.png',
  });
  await page.keyboard.press('Escape');
  await expect(
    page.getByRole('dialog', { name: 'Command Palette' }),
  ).toBeHidden();
  await page.emulateMedia({ forcedColors: 'active', reducedMotion: 'reduce' });
  await expect(page.locator('.embedded .sidebar')).toHaveCSS(
    'backdrop-filter',
    'none',
  );
  await page.screenshot({
    animations: 'disabled',
    path: 'test-results/polish-forced-colors.png',
  });
  expect(errors).toEqual([]);
});
test('Folder drag hover expands at 800ms and cancels on leave, drop and drag end', async () => {
  const workspaceId = (await metadata()).activeWorkspaceId;
  await request({
    type: 'folder.save',
    input: {
      workspaceId,
      parentId: null,
      name: 'Hover folder',
      collapsed: true,
    },
  });
  await request({
    type: 'resource.save',
    kind: 'pinned',
    input: {
      workspaceId,
      title: 'Drag resource',
      url: origin + '/resource',
      folderId: null,
    },
  });
  const folder = page
    .locator(`[data-folder-id="${(await metadata()).folders[0]!.id}"]`)
    .first();
  const data = await page.evaluateHandle(() => new DataTransfer());
  await data.evaluate(
    (d, item) =>
      d.setData('application/x-sidekick-entry', JSON.stringify(item)),
    {
      kind: 'pinned',
      id: (await metadata()).pinnedEntries[0]!.id,
      workspaceId,
    },
  );
  await folder.dispatchEvent('dragover', { dataTransfer: data });
  await folder.dispatchEvent('dragleave', { dataTransfer: data });
  await page.waitForTimeout(950);
  expect((await metadata()).folders[0]!.collapsed).toBe(true);
  await folder.dispatchEvent('dragover', { dataTransfer: data });
  await folder.dispatchEvent('dragend', { dataTransfer: data });
  await page.waitForTimeout(950);
  expect((await metadata()).folders[0]!.collapsed).toBe(true);
  const start = Date.now();
  await folder.dispatchEvent('dragover', { dataTransfer: data });
  await expect
    .poll(async () => (await metadata()).folders[0]!.collapsed)
    .toBe(false);
  expect(Date.now() - start).toBeGreaterThanOrEqual(750);
  await page.screenshot({
    animations: 'disabled',
    path: 'test-results/polish-folder-hover.png',
  });
  await folder.dispatchEvent('drop', { dataTransfer: data });
  await data.dispose();
});

async function connectMock() {
  await page.goto(`chrome-extension://${extensionId}/options.html`);
  await page
    .getByLabel('Vercel AI Gateway API key')
    .fill('isolated-mock-contract-key');
  await page
    .getByRole('button', { name: 'Verify & Connect', exact: true })
    .click();
  await expect(page.getByText('Connected', { exact: true })).toBeVisible();
  await page.goto(`chrome-extension://${extensionId}/dashboard.html`);
}
test('Jev review: manual category override, durable dismissal, grouping, Focus and conservative cleanup', async () => {
  const mock = await mockJev(context, extensionId, validDecisions);
  await connectMock();
  const research = await workspace('Research');
  const ui = page.locator('.embedded');
  const live = [];
  for (const name of [
    'React-documentation',
    'React-API-reference',
    'React-documentation',
    'Shopping-shoes',
  ]) {
    const p = await context.newPage();
    await p.goto(origin + '/' + name);
    live.push(p);
  }
  await page.bringToFront();
  await request({ type: 'workspace.select', id: research });
  await ui.getByRole('button', { name: 'AI suggestions', exact: true }).click();
  await ui
    .getByRole('button', { name: 'Analyze workspace tabs', exact: true })
    .click();
  await expect(
    ui.getByRole('heading', { name: 'Categories', exact: true }),
  ).toBeVisible();
  await expect(
    ui.getByRole('button', { name: 'Analyze workspace tabs', exact: true }),
  ).toBeEnabled();
  await page.screenshot({
    animations: 'disabled',
    path: 'test-results/polish-jev-classification.png',
  });
  await expect(
    ui.locator('.ai-section').first().locator('article').first(),
  ).toHaveScreenshot('compact-ai-row.png', { animations: 'disabled' });
  await ui
    .getByRole('heading', { name: 'Workspace routing', exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    animations: 'disabled',
    path: 'test-results/polish-jev-routing.png',
  });
  await ui
    .getByRole('button', { name: 'Accept tab group', exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    animations: 'disabled',
    path: 'test-results/polish-jev-grouping.png',
  });
  await ui
    .getByRole('button', { name: 'Accept tab group', exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (await worker.evaluate(() => chrome.tabGroups.query({}))).length,
    )
    .toBe(1);
  const category = ui.getByLabel('Category for React-documentation').first();
  await category.selectOption('Education');
  await expect(
    ui.getByText('Manually selected', { exact: true }),
  ).toBeVisible();
  await ui
    .getByRole('button', { name: 'Accept category', exact: true })
    .first()
    .click();
  await expect
    .poll(
      async () =>
        (await metadata()).aiState?.acceptedByUrl?.[
          origin + '/React-documentation'
        ]?.category,
    )
    .toBe('Education');
  await ui
    .getByRole('button', { name: 'Dismiss category', exact: true })
    .first()
    .click();
  await expect
    .poll(
      async () =>
        Object.keys((await metadata()).aiState?.dismissedCategoriesByUrl ?? {})
          .length,
    )
    .toBe(1);
  await ui.getByLabel('Workspace focus goal').fill('React documentation');
  await ui.getByRole('button', { name: 'Evaluate focus', exact: true }).click();
  await expect(
    ui.getByRole('heading', { name: 'Focus relevance', exact: true }),
  ).toBeVisible();
  await ui
    .getByRole('heading', { name: 'Focus relevance', exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    animations: 'disabled',
    path: 'test-results/polish-jev-focus.png',
  });
  await ui
    .getByRole('button', { name: 'Exit Focus / Show All', exact: true })
    .click();
  const review = ui
    .getByRole('button', { name: 'Review cleanup', exact: true })
    .first();
  await review.scrollIntoViewIfNeeded();
  await page.screenshot({
    animations: 'disabled',
    path: 'test-results/polish-jev-cleanup.png',
  });
  const before = (await tabsForPolish()).length;
  await review.click();
  await ui.getByRole('button', { name: 'Cancel cleanup', exact: true }).click();
  expect((await tabsForPolish()).length).toBe(before);
  await review.click();
  await ui
    .getByRole('button', { name: 'Confirm archive and close', exact: true })
    .click();
  await expect
    .poll(async () => (await metadata()).library?.archive.length ?? 0)
    .toBe(1);
  expect((await metadata()).pinnedEntries).toHaveLength(0);
  await ui
    .getByRole('button', { name: 'Analyze workspace tabs', exact: true })
    .click();
  await expect(
    ui.getByRole('button', { name: 'Analyze workspace tabs', exact: true }),
  ).toBeEnabled();
  expect(
    (await metadata()).aiState?.acceptedByUrl?.[origin + '/React-documentation']
      ?.category,
  ).toBe('Education');
  await page.reload();
  expect((await metadata()).aiState?.dismissedCategoriesByUrl).toBeTruthy();
  await mock.close();
});
async function tabsForPolish() {
  return worker.evaluate(() => chrome.tabs.query({}));
}
for (const change of ['workspace', 'closed', 'navigation'] as const)
  test(`Jev stale inference rejects ${change} changes before Focus persistence`, async () => {
    let release!: () => void, arrived!: () => void;
    const ready = new Promise<void>((r) => {
        arrived = r;
      }),
      hold = new Promise<void>((r) => {
        release = r;
      });
    const mock = await mockJev(context, extensionId, async (body) => {
      if (Object.keys(body.questions).some((k) => k.startsWith('focus_'))) {
        arrived();
        await hold;
      }
      return validDecisions(body);
    });
    await connectMock();
    const first = (await metadata()).activeWorkspaceId,
      other = await workspace('Other workspace');
    await request({ type: 'workspace.select', id: first });
    const live = await context.newPage();
    await live.goto(origin + '/Stable-title');
    await page.bringToFront();
    const ui = page.locator('.embedded');
    await ui
      .getByRole('button', { name: 'AI suggestions', exact: true })
      .click();
    await ui.getByLabel('Workspace focus goal').fill('React');
    await ui
      .getByRole('button', { name: 'Evaluate focus', exact: true })
      .click();
    await ready;
    if (change === 'workspace')
      await request({ type: 'workspace.select', id: other });
    else if (change === 'closed') await live.close();
    else await live.goto(origin + '/Changed-title');
    release();
    await expect(page.locator('[role="alert"]').first()).toContainText(
      'changed',
    );
    expect(
      (await metadata()).aiState?.focusPreferences?.[first],
    ).toBeUndefined();
    await mock.close();
  });
test('Jev invalid partial response leaves metadata unchanged and announces a concise error', async () => {
  const mock = await mockJev(context, extensionId, (body) =>
    Object.keys(body.questions).some((k) => k.startsWith('focus_'))
      ? { answers: {} }
      : validDecisions(body),
  );
  await connectMock();
  const live = await context.newPage();
  await live.goto(origin + '/Fixture');
  await page.bringToFront();
  const before = JSON.stringify((await metadata()).aiState);
  const ui = page.locator('.embedded');
  await ui.getByRole('button', { name: 'AI suggestions', exact: true }).click();
  await ui.getByLabel('Workspace focus goal').fill('React');
  await ui.getByRole('button', { name: 'Evaluate focus', exact: true }).click();
  await expect(page.locator('[role="alert"]').first()).toContainText(
    'invalid focus score',
  );
  expect(JSON.stringify((await metadata()).aiState)).toBe(before);
  expect(live.isClosed()).toBe(false);
  await page.screenshot({
    animations: 'disabled',
    path: 'test-results/polish-jev-error.png',
  });
  await mock.close();
});

test('Hover effects on a website: actual pointer/focus recovery, real resource drag and dock restoration', async () => {
  await request({
    type: 'appearance.update',
    config: APPEARANCE_PRESETS['Frosted Glass']!,
  });
  const workspaceId = (await metadata()).activeWorkspaceId;
  await request({
    type: 'folder.save',
    input: { workspaceId, parentId: null, name: 'Drag folder' },
  });
  await request({
    type: 'resource.save',
    kind: 'pinned',
    input: {
      workspaceId,
      title: 'Move with pointer',
      url: origin + '/pointer',
      folderId: null,
    },
  });
  const folderId = (await metadata()).folders[0]!.id;
  const content = await context.newPage();
  await content.route(origin + '/visual-hover', (r) =>
    r.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><title>Website effects fixture</title><style>body{margin:23px;background:repeating-linear-gradient(120deg,#d4dce5 0 90px,#b7c8ce 90px 180px);min-height:200vh}main{margin:100px auto;width:min(600px,calc(100% - 100px));padding:35px;box-sizing:border-box;background:#fff}input{font:16px system-ui}</style><main><h1>Website test page</h1><p>The sidebar effects stay inside Sidekick.</p><input aria-label="Website field"></main>',
    }),
  );
  await content.goto(origin + '/visual-hover');
  const before = await content.evaluate(() => ({
    margin: document.body.style.margin,
    css: getComputedStyle(document.body).margin,
    padding: getComputedStyle(document.body).padding,
  }));
  const ui = await inspectClosedRoot(context, content),
    sidebar = ui.getByRole('complementary', {
      name: 'Sidekick sidebar',
      includeHidden: true,
    });
  const revealStart = Date.now();
  await ui.getByRole('button', { name: 'Open Sidekick', exact: true }).hover();
  await expect(sidebar).toBeVisible();
  await expect
    .poll(async () => (await sidebar.boundingBox())?.x ?? -1000)
    .toBeGreaterThanOrEqual(-1);
  console.log(
    'Hover reveal including configured delay and transition, ms',
    Date.now() - revealStart,
  );
  await content.mouse.move(150, 220);
  await expect(sidebar).toBeVisible();
  console.log(
    'Website blur verification',
    await ui.evaluate((el) => ({
      inline: el.style.getPropertyValue('--sk-blur'),
      computed: getComputedStyle(el).getPropertyValue('--sk-blur'),
      forced: matchMedia('(forced-colors: active)').matches,
      supports: CSS.supports('backdrop-filter', 'blur(1px)'),
    })),
  );
  expect(
    await sidebar.evaluate((el) => getComputedStyle(el).backdropFilter),
  ).toContain('16px');
  await content.screenshot({
    animations: 'disabled',
    path: 'test-results/polish-hover-glass.png',
  });
  await ui
    .getByRole('textbox', { name: 'Search tabs', exact: true })
    .fill('Website');
  await content.mouse.move(900, 300);
  await expect(sidebar).toBeVisible();
  await content.getByLabel('Website field').click();
  await expect(sidebar).toBeHidden();
  await request({ type: 'sidebar.mode', mode: 'docked' });
  await expect(sidebar).toBeVisible();
  await ui.getByRole('textbox', { name: 'Search tabs', exact: true }).fill('');
  await content.screenshot({
    animations: 'disabled',
    path: 'test-results/polish-docked-glass.png',
  });
  await ui
    .locator('.pinned-row')
    .first()
    .dragTo(
      ui.locator(`[data-folder-id="${folderId}"] .folder-toggle`).first(),
    );
  await expect
    .poll(async () => (await metadata()).pinnedEntries[0]!.folderId)
    .toBe(folderId);
  await content.screenshot({
    animations: 'disabled',
    path: 'test-results/polish-pointer-drag.png',
  });
  await ui.getByRole('button', { name: 'Undock sidebar', exact: true }).click();
  await expect
    .poll(async () =>
      content.evaluate(() => getComputedStyle(document.body).margin),
    )
    .toBe(before.css);
  expect(
    await content.evaluate(() => getComputedStyle(document.body).padding),
  ).toBe(before.padding);
});
test('Jev worker restart during inference preserves data and a new mocked UI operation recovers', async () => {
  let arrived!: () => void, release!: () => void;
  const ready = new Promise<void>((r) => {
      arrived = r;
    }),
    hold = new Promise<void>((r) => {
      release = r;
    });
  const mock = await mockJev(context, extensionId, async (body) => {
    if (Object.keys(body.questions).some((k) => k.startsWith('focus_'))) {
      arrived();
      await hold;
    }
    return validDecisions(body);
  });
  await connectMock();
  const live = await context.newPage();
  await live.goto(origin + '/Worker-recovery');
  await page.bringToFront();
  const ui = page.locator('.embedded');
  await ui.getByRole('button', { name: 'AI suggestions', exact: true }).click();
  await ui.getByLabel('Workspace focus goal').fill('React');
  await ui.getByRole('button', { name: 'Evaluate focus', exact: true }).click();
  await ready;
  const cdp = await context.newCDPSession(page);
  const versions = new Map<
    string,
    { runningStatus: string; targetId?: string }
  >();
  let stopped = false;
  const restart = { versionId: '' };
  cdp.on('ServiceWorker.workerVersionUpdated', (e) => {
    for (const version of e.versions)
      if (version.scriptURL.includes(extensionId)) {
        versions.set(version.versionId, version);
        if (
          version.versionId === restart.versionId &&
          version.runningStatus === 'stopped'
        )
          stopped = true;
      }
  });
  await cdp.send('ServiceWorker.enable');
  await expect
    .poll(
      () =>
        [...versions].find(
          ([, status]) => status.runningStatus === 'running',
        )?.[0],
    )
    .toBeTruthy();
  const versionId = [...versions].find(
    ([, status]) => status.runningStatus === 'running',
  )![0];
  restart.versionId = versionId;
  await cdp.send('ServiceWorker.stopWorker', { versionId });
  await expect.poll(() => stopped).toBe(true);
  release();
  await page.reload();
  await expect(ui.getByLabel('Workspace', { exact: true })).not.toHaveValue('');
  const state = await page.evaluate(
    async () =>
      (await chrome.storage.local.get('sidekick.metadata.v1'))[
        'sidekick.metadata.v1'
      ],
  );
  expect(
    (state as import('../../lib/models').Metadata).aiState?.focusPreferences,
  ).toBeUndefined();
  await mock.close();
  await expect
    .poll(
      () =>
        context.serviceWorkers().filter((w) => w.url().includes(extensionId))
          .length,
    )
    .toBe(1);
  worker = context.serviceWorkers().find((w) => w.url().includes(extensionId))!;
  // Transport behavior is covered by the other HTTP-interception tests. Here a
  // worker-local stub verifies key rehydration and UI recovery without letting
  // a restarted target fall through to the network.
  await worker.evaluate(() => {
    globalThis.fetch = async (_input, init) => {
      if (
        new Headers(init?.headers).get('Authorization') !==
        'Bearer isolated-mock-contract-key'
      )
        throw Error('Fixture key was not restored');
      const body = JSON.parse(String(init?.body));
      return new Response(
        JSON.stringify({
          model: 'typesafe-ai/jev',
          answers: Object.fromEntries(
            Object.keys(body.questions).map((id) => [
              id,
              { type: 'score', score: 4, probabilities: { 4: 1 } },
            ]),
          ),
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    };
  });
  await ui.getByRole('button', { name: 'AI suggestions', exact: true }).click();
  await ui.getByLabel('Workspace focus goal').fill('React');
  await ui.getByRole('button', { name: 'Evaluate focus', exact: true }).click();
  await expect(
    ui.getByRole('heading', { name: 'Focus relevance', exact: true }),
  ).toBeVisible();
  expect(live.isClosed()).toBe(false);
  await cdp.detach();
});
