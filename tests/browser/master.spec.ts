import { contrastRatio, defaultAppearance } from '../../lib/appearance';
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
import type { Command, Reply } from '../../lib/protocol';
let context: BrowserContext,
  worker: Worker,
  page: Page,
  profile: string,
  server: Server,
  origin: string,
  extensionId: string;
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
async function tabs() {
  return worker.evaluate(() => chrome.tabs.query({}));
}
test.beforeAll(async () => {
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
});

test('Master acceptance: workspace membership, tab moves, session/worker reconciliation and independent windows', async () => {
  const dev = await workspace('Development');
  const live: Page[] = [];
  for (const path of ['GitHub', 'Documentation']) {
    const p = await context.newPage();
    await p.goto(origin + '/' + path);
    live.push(p);
  }
  await page.bringToFront();
  const ent = await workspace('Entertainment');
  for (const path of ['YouTube', 'Another-page']) {
    const p = await context.newPage();
    await p.goto(origin + '/' + path);
    live.push(p);
  }
  await page.bringToFront();
  // The dashboard was created in Personal; manually activating it follows that assignment.
  await page
    .locator('.embedded')
    .getByLabel('Workspace', { exact: true })
    .selectOption(dev);
  const ui = page.locator('.embedded');
  await expect(ui.locator('.tab-row')).toHaveCount(2);
  const tokens = await Promise.all(
    live.map((p) =>
      p.evaluate(() => (window as Window & { loadToken?: string }).loadToken),
    ),
  );
  for (let i = 0; i < 3; i++) {
    await ui.getByLabel('Workspace', { exact: true }).selectOption(ent);
    await expect(ui).toHaveAttribute('data-workspace-id', ent);
    await expect(ui.locator('.tab-row')).toHaveCount(2);
    await ui.getByLabel('Workspace', { exact: true }).selectOption(dev);
    await expect(ui).toHaveAttribute('data-workspace-id', dev);
    await expect(ui.locator('.tab-row')).toHaveCount(2);
  }
  const drag = await page.evaluateHandle(() => new DataTransfer());
  const github = (await tabs()).find((t) => t.url === origin + '/GitHub')!;
  await drag.evaluate(
    (d, value) =>
      d.setData('application/x-sidekick-entry', JSON.stringify(value)),
    { kind: 'tab', id: String(github.id), workspaceId: dev },
  );
  await ui
    .getByRole('button', { name: 'Entertainment', exact: true })
    .dispatchEvent('drop', { dataTransfer: drag });
  await drag.dispose();
  await expect(ui.locator('.tab-row')).toHaveCount(1);
  await ui.getByLabel('Workspace', { exact: true }).selectOption(ent);
  await expect(ui).toHaveAttribute('data-workspace-id', ent);
  await expect(ui.locator('.tab-row')).toHaveCount(3);
  expect(
    (await tabs()).filter((t) => t.url?.startsWith(origin + '/')),
  ).toHaveLength(4);
  expect(
    await Promise.all(
      live.map((p) =>
        p.evaluate(() => (window as Window & { loadToken?: string }).loadToken),
      ),
    ),
  ).toEqual(tokens);
  const secondWindow = await worker.evaluate(
    async (url) => (await chrome.windows.create({ url, focused: false }))!.id!,
    `chrome-extension://${extensionId}/dashboard.html`,
  );
  const second = await expect
    .poll(
      () =>
        context.pages().filter((p) => p.url().endsWith('/dashboard.html'))
          .length,
    )
    .toBe(2)
    .then(() =>
      context
        .pages()
        .find((p) => p !== page && p.url().endsWith('/dashboard.html'))!,
    );
  await request({ type: 'workspace.select', id: dev }, second);
  await expect(
    second.locator('.embedded').getByLabel('Workspace', { exact: true }),
  ).toHaveValue(dev);
  await expect(ui.getByLabel('Workspace', { exact: true })).toHaveValue(ent);
  const cdp = await context.browser()!.newBrowserCDPSession();
  const targets = await cdp.send('Target.getTargets');
  const target = targets.targetInfos.find(
    (t) => t.type === 'service_worker' && t.url.includes(extensionId),
  )!;
  await cdp.send('Target.closeTarget', { targetId: target.targetId });
  await expect(ui.getByLabel('Workspace', { exact: true })).toHaveValue(ent);
  await page.reload();
  await expect(page.locator('.embedded .tab-row')).toHaveCount(3);
  await worker.evaluate((id) => chrome.windows.remove(id), secondWindow);
  await page.screenshot({
    animations: 'disabled',
    path: 'test-results/master-workspaces.png',
  });
});

test('Master acceptance: Chrome New Tab unchanged and palette keyboard/action/accessibility', async () => {
  const original = await context.newPage();
  await original.goto('chrome://newtab/');
  expect(
    await worker.evaluate(
      () => chrome.runtime.getManifest().chrome_url_overrides,
    ),
  ).toBeUndefined();
  await expect(original.locator('.sidekick-root')).toHaveCount(0);
  await original.close();
  const ui = page.locator('.embedded');
  await ui
    .getByRole('button', { name: 'Open command palette (Alt+Shift+K)' })
    .click();
  const input = ui.getByRole('combobox', { name: 'Command palette search' });
  await expect(input).toBeFocused();
  await input.fill('Open Settings');
  await input.press('Enter');
  await expect(
    ui.getByRole('heading', { name: 'Settings', exact: true }),
  ).toBeVisible();
  await ui
    .getByRole('button', { name: 'Open command palette (Alt+Shift+K)' })
    .click();
  await expect(input).toBeFocused();
  await input.fill('New Tab');
  await input.press('ArrowDown');
  await expect(input).toHaveAttribute('aria-activedescendant', 'palette-1');
  await input.press('Tab');
  await expect(input).toBeFocused();
  await input.press('Escape');
  await expect(ui.getByRole('dialog', { name: 'Command Palette' })).toHaveCount(
    0,
  );
  await ui
    .getByRole('button', { name: 'Open command palette (Alt+Shift+K)' })
    .click();
  await input.fill('New Tab');
  const before = (await tabs()).length;
  await input.press('Enter');
  await expect.poll(async () => (await tabs()).length).toBe(before + 1);
});

test('Keyboard Chrome commands expose four assigned defaults and configurable productivity actions', async () => {
  const commands = await worker.evaluate(() => chrome.commands.getAll());
  expect(
    commands.find((c) => c.name === 'open-command-palette')?.shortcut,
  ).toBe('Alt+Shift+K');
  const manifest = await worker.evaluate(() => chrome.runtime.getManifest());
  expect(
    Object.values(manifest.commands ?? {}).filter((c) => c.suggested_key),
  ).toHaveLength(4);
  for (const name of [
    'next-workspace',
    'previous-workspace',
    'new-tab',
    'focus-tab-search',
    'organize-jev',
    'toggle-focus',
    'toggle-sidebar',
  ])
    expect(commands.some((c) => c.name === name)).toBe(true);
});

test('Master performance: 210 real Chrome tabs stay searchable with responsive palette rendering', async () => {
  const appearance = defaultAppearance();
  appearance.blur = 12;
  appearance.transparency = 90;
  appearance.grain = 2;
  appearance.gradient.type = 'linear';
  await request({ type: 'appearance.update', config: appearance });
  await expect
    .poll(() =>
      page
        .locator('.embedded .sidebar')
        .evaluate((el) => getComputedStyle(el).backdropFilter),
    )
    .toContain('12px');
  const windowId = await page.evaluate(
    async () => (await chrome.windows.getCurrent()).id!,
  );
  const measurements: { count: number; queryMs: number; paletteMs: number }[] =
    [];
  const blankBaseline = (await tabs()).filter(
    (t) => t.url === 'about:blank',
  ).length;
  let created = 0;
  for (const count of [10, 50, 100, 210]) {
    await worker.evaluate(
      async ({ windowId, amount }) => {
        for (let n = 0; n < amount; n++)
          await chrome.tabs.create({
            windowId,
            url: 'about:blank',
            active: false,
          });
      },
      { windowId, amount: count - created },
    );
    created = count;
    await expect
      .poll(async () => page.locator('.embedded .tab-row').count())
      .toBeGreaterThanOrEqual(count);
    const start = Date.now();
    await request({ type: 'search.update', query: 'blank' });
    await expect(page.locator('.embedded .tab-row')).toHaveCount(
      count + blankBaseline,
    );
    const queryMs = Date.now() - start;
    await page
      .locator('.embedded')
      .getByRole('button', { name: 'Open command palette (Alt+Shift+K)' })
      .click();
    const paletteStart = Date.now();
    const input = page.getByRole('combobox', {
      name: 'Command palette search',
    });
    await input.fill('blank');
    await expect(
      page
        .getByRole('dialog', { name: 'Command Palette' })
        .getByRole('option')
        .first(),
    ).toBeVisible();
    measurements.push({ count, queryMs, paletteMs: Date.now() - paletteStart });
    await input.press('Escape');
  }
  console.log('Measured real-tab search timings', JSON.stringify(measurements));
  const perf = await context.newCDPSession(page);
  await perf.send('Performance.enable');
  const { metrics } = await perf.send('Performance.getMetrics');
  console.log(
    '210-tab renderer metrics with custom gradient/blur',
    JSON.stringify(
      Object.fromEntries(
        metrics
          .filter((m) =>
            [
              'JSHeapUsedSize',
              'Nodes',
              'Documents',
              'LayoutCount',
              'RecalcStyleCount',
              'TaskDuration',
            ].includes(m.name),
          )
          .map((m) => [m.name, m.value]),
      ),
    ),
  );
  await perf.detach();
  expect(
    measurements.every((m) => m.queryMs < 5000 && m.paletteMs < 2000),
  ).toBe(true);
  await page.screenshot({
    animations: 'disabled',
    path: 'test-results/master-210-tabs.png',
  });
});

test('Master recovery: full browser restart reconciles fresh Chrome handles with saved workspace fingerprints', async () => {
  const dev = await workspace('Development');
  for (const name of ['restart-code', 'restart-docs']) {
    const p = await context.newPage();
    await p.goto(origin + '/' + name);
  }
  await page.bringToFront();
  const ent = await workspace('Entertainment');
  for (const name of ['restart-video', 'restart-personal']) {
    const p = await context.newPage();
    await p.goto(origin + '/' + name);
  }
  await request({ type: 'workspace.select', id: ent });
  await expect
    .poll(async () => {
      const s = await worker.evaluate(() =>
        chrome.storage.session.get('sidekick.memberships.v2'),
      );
      return Object.values(
        (
          s['sidekick.memberships.v2'] as {
            tabs: Record<string, { workspaceId: string }>;
          }
        ).tabs,
      ).filter((t) => t.workspaceId === ent).length;
    })
    .toBe(2);
  await context.close();
  const extension = resolve('.output/chrome-mv3');
  context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium',
    headless: true,
    viewport: { width: 1280, height: 900 },
    args: [
      '--restore-last-session',
      '--host-resolver-rules=MAP ai-gateway.vercel.sh ~NOTFOUND',
      `--disable-extensions-except=${extension}`,
      `--load-extension=${extension}`,
    ],
  });
  worker =
    context.serviceWorkers()[0] ??
    (await context.waitForEvent('serviceworker'));
  await expect
    .poll(
      async () =>
        (await tabs()).filter((t) => t.url?.includes('/restart-')).length,
    )
    .toBe(4);
  page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/dashboard.html`);
  const ui = page.locator('.embedded');
  await ui.getByLabel('Workspace', { exact: true }).selectOption(dev);
  await expect(ui.locator('.tab-row')).toHaveCount(2);
  await expect(
    ui.getByRole('button', { name: 'restart-code', exact: true }),
  ).toBeVisible();
  await ui.getByLabel('Workspace', { exact: true }).selectOption(ent);
  await expect(ui.locator('.tab-row')).toHaveCount(2);
  await expect(
    ui.getByRole('button', { name: 'restart-video', exact: true }),
  ).toBeVisible();
  await page.screenshot({
    animations: 'disabled',
    path: 'test-results/master-browser-restart.png',
  });
});

test('Master acceptance: save/restore sessions, alarm reminder, archive and previewed backup import', async () => {
  const ui = page.locator('.embedded');
  await workspace('Research');
  const p = await context.newPage();
  await p.goto(origin + '/Research');
  await page.bringToFront();
  await request({
    type: 'workspace.select',
    id: (await metadata()).workspaces.find((w) => w.name === 'Research')!.id,
  });
  await ui.getByRole('button', { name: 'Open library', exact: true }).click();
  await ui.getByLabel('Session name', { exact: true }).fill('Morning research');
  await ui
    .getByRole('button', { name: 'Save workspace session', exact: true })
    .click();
  await expect(ui.getByLabel('Session name Morning research')).toBeVisible();
  await page.screenshot({
    animations: 'disabled',
    path: 'test-results/master-sessions.png',
  });
  const before = (await tabs()).length;
  await ui.getByRole('button', { name: 'Restore selected pages' }).click();
  await expect.poll(async () => (await tabs()).length).toBe(before);
  await ui.getByRole('button', { name: 'Back from library' }).click();
  await ui
    .getByRole('button', { name: 'Actions for tab Research', exact: true })
    .click();
  await ui
    .getByRole('menuitem', { name: 'Save copy to archive · keep tab open' })
    .click();
  const tab = (await tabs()).find((t) => t.url === origin + '/Research')!;
  await request({
    type: 'snooze.create',
    tabId: tab.id!,
    dueAt: Date.now() + 1500,
    close: false,
  });
  await expect
    .poll(async () => (await metadata()).library!.snoozed[0]?.ready)
    .toBe(true);
  await ui.getByRole('button', { name: 'Open library', exact: true }).click();
  await ui.getByRole('button', { name: 'Snoozed', exact: true }).click();
  await expect(ui.getByText('Ready to restore', { exact: true })).toBeVisible();
  await page.screenshot({
    animations: 'disabled',
    path: 'test-results/master-snoozed.png',
  });
  await ui.getByRole('button', { name: 'Restore snoozed page' }).click();
  await expect(
    ui.getByRole('button', { name: 'Restore snoozed page' }),
  ).toHaveCount(0);
  await ui.getByRole('button', { name: 'Archive', exact: true }).click();
  await expect(
    ui.getByRole('button', { name: 'Restore archived page' }),
  ).toBeVisible();
  await page.screenshot({
    animations: 'disabled',
    path: 'test-results/master-archive.png',
  });
  await ui.getByRole('button', { name: 'Restore archived page' }).click();
  await expect.poll(async () => (await tabs()).length).toBe(before);
  await page.screenshot({
    animations: 'disabled',
    path: 'test-results/master-library.png',
  });
  await ui.getByRole('button', { name: 'Open settings', exact: true }).click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    ui
      .getByRole('button', { name: 'Export metadata backup', exact: true })
      .click(),
  ]);
  const backup = await readFile((await download.path())!, 'utf8');
  expect(JSON.parse(backup).metadata.aiSettings).toBeUndefined();
  const count = (await metadata()).workspaces.length;
  await ui.getByLabel('Import Sidekick backup').setInputFiles({
    name: 'invalid.json',
    mimeType: 'application/json',
    buffer: Buffer.from('broken'),
  });
  await expect(ui.getByRole('alert')).toContainText('not valid JSON');
  await page.screenshot({
    animations: 'disabled',
    path: 'test-results/master-error.png',
  });
  expect((await metadata()).workspaces).toHaveLength(count);
  await ui.getByRole('button', { name: 'Dismiss error' }).click();
  await ui.getByLabel('Import Sidekick backup').setInputFiles({
    name: 'backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(backup),
  });
  await expect(
    ui.getByRole('button', { name: 'Confirm import copies' }),
  ).toBeVisible();
  expect((await metadata()).workspaces).toHaveLength(count);
  await ui.getByRole('button', { name: 'Confirm import copies' }).click();
  await expect
    .poll(async () => (await metadata()).workspaces.length)
    .toBe(count * 2);
  await page.screenshot({
    animations: 'disabled',
    path: 'test-results/master-library.png',
  });
  await p.close();
});

test('Master acceptance: trusted AI key boundary, mocked real HTTP contract, routing and Focus Mode', async () => {
  const ui = page.locator('.embedded'),
    dev = await workspace('Development');
  await workspace('Personal AI');
  await request({ type: 'workspace.select', id: dev });
  const p = await context.newPage();
  await p.goto(origin + '/Documentation');
  const companion = await context.newPage();
  await companion.goto(origin + '/Related-documentation');
  await request({ type: 'workspace.select', id: dev });
  const cdp = await context.browser()!.newBrowserCDPSession();
  await cdp.send('Target.setDiscoverTargets', { discover: true });
  await cdp.detach();
  // Route actual worker HTTP requests with CDP Fetch, never a production fake service.
  const target = (
    await (
      await context.browser()!.newBrowserCDPSession()
    ).send('Target.getTargets')
  ).targetInfos.find(
    (t) => t.type === 'service_worker' && t.url.includes(extensionId),
  )!;
  const browserCdp = await context.browser()!.newBrowserCDPSession();
  const { sessionId } = await browserCdp.send('Target.attachToTarget', {
    targetId: target.targetId,
    flatten: false,
  });
  let nextMessage = 1;
  const messages: object[] = [];
  browserCdp.on('Target.receivedMessageFromTarget', async (e) => {
    if (e.sessionId !== sessionId) return;
    const event = JSON.parse(e.message);
    if (event.method !== 'Fetch.requestPaused') return;
    const req = event.params;
    const body = JSON.parse(req.request.postData);
    messages.push(body);
    const answers: Record<string, object> = {};
    for (const [id, q] of Object.entries(body.questions) as [
      string,
      { type: string; criteria?: Record<string, string> },
    ][]) {
      if (q.type === 'boolean')
        answers[id] = { type: 'boolean', probability: 1 };
      else if (q.type === 'score')
        answers[id] = { type: 'score', score: 4, probabilities: { '4': 1 } };
      else {
        const choice = id.startsWith('topic_')
          ? 'TypeScript development'
          : Object.keys(q.criteria ?? {})[0]!;
        answers[id] = {
          type: 'choice',
          choice,
          probabilities: { [choice]: 1 },
        };
      }
    }
    await browserCdp.send('Target.sendMessageToTarget', {
      sessionId,
      message: JSON.stringify({
        id: nextMessage++,
        method: 'Fetch.fulfillRequest',
        params: {
          requestId: req.requestId,
          responseCode: 200,
          responseHeaders: [
            { name: 'Content-Type', value: 'application/json' },
          ],
          body: Buffer.from(
            JSON.stringify({ model: 'typesafe-ai/jev', answers }),
          ).toString('base64'),
        },
      }),
    });
  });
  await browserCdp.send('Target.sendMessageToTarget', {
    sessionId,
    message: JSON.stringify({
      id: nextMessage++,
      method: 'Fetch.enable',
      params: { patterns: [{ urlPattern: 'https://ai-gateway.vercel.sh/*' }] },
    }),
  });
  await page.goto(`chrome-extension://${extensionId}/options.html`);
  await page
    .getByLabel('Vercel AI Gateway API key')
    .fill('isolated-contract-test-key');
  await page.getByRole('button', { name: 'Verify & Connect' }).click();
  await expect(page.getByText('Connected', { exact: true })).toBeVisible();
  await page.goto(`chrome-extension://${extensionId}/dashboard.html`);
  await request({ type: 'workspace.select', id: dev });
  await ui.getByRole('button', { name: 'AI suggestions', exact: true }).click();
  await ui.getByRole('button', { name: 'Analyze workspace tabs' }).click();
  await expect(
    ui.getByRole('heading', { name: 'Categories', exact: true }),
  ).toBeVisible();
  await ui.getByLabel('Workspace focus goal').fill('Documentation');
  await ui.getByRole('button', { name: 'Evaluate focus' }).click();
  await expect(
    ui.getByRole('button', { name: 'Exit Focus / Show All' }),
  ).toBeVisible();
  await ui.getByRole('button', { name: 'Exit Focus / Show All' }).click();
  await ui
    .getByRole('button', { name: 'Accept category', exact: true })
    .first()
    .click();
  await expect
    .poll(
      async () =>
        Object.keys((await metadata()).aiState?.acceptedByUrl ?? {}).length,
    )
    .toBe(1);
  await ui
    .getByRole('button', { name: 'Accept tab group', exact: true })
    .click();
  await expect
    .poll(async () =>
      (await worker.evaluate(() => chrome.tabGroups.query({}))).some(
        (g) => g.title === 'TypeScript development',
      ),
    )
    .toBe(true);
  expect((await metadata()).pinnedEntries).toHaveLength(0);
  await ui
    .getByRole('button', { name: 'Accept move', exact: true })
    .first()
    .click();
  await expect
    .poll(async () => {
      const state = await worker.evaluate(() =>
        chrome.storage.session.get('sidekick.memberships.v2'),
      );
      return Object.values(
        (
          state['sidekick.memberships.v2'] as {
            tabs: Record<string, { workspaceId: string }>;
          }
        ).tabs,
      ).filter((t) => t.workspaceId === dev).length;
    })
    .toBe(1);
  await expect(ui.getByText('Closed tab', { exact: true })).toHaveCount(0);
  expect(messages.length).toBeGreaterThan(1);
  expect(JSON.stringify(messages)).not.toContain('isolated-contract-test-key');
  const snapshot = await page.evaluate(async () => {
    return new Promise<string>((resolve) => {
      const port = chrome.runtime.connect({ name: 'sidekick:sidebar:v1' });
      port.onMessage.addListener((e) => {
        if (e.type === 'snapshot') {
          resolve(JSON.stringify(e));
          port.disconnect();
        }
      });
      void chrome.windows
        .getCurrent()
        .then((w) => port.postMessage({ type: 'subscribe', windowId: w.id }));
    });
  });
  expect(snapshot).not.toContain('isolated-contract-test-key');
  await page.screenshot({
    animations: 'disabled',
    path: 'test-results/master-ai.png',
  });
  await p.close();
  await companion.close();
  await browserCdp.detach();
});

test('Visual acceptance: compact resources, nested folders, drag target, palette and both themes', async () => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const m = await metadata(),
    workspaceId = m.activeWorkspaceId,
    ui = page.locator('.embedded');
  const live = await context.newPage();
  await live.goto(origin + '/Code-review');
  await page.bringToFront();
  await request({
    type: 'resource.save',
    kind: 'favorite',
    input: { workspaceId, title: 'Code review', url: origin + '/Code-review' },
  });
  await request({
    type: 'folder.save',
    input: { workspaceId, parentId: null, name: 'Projects' },
  });
  const parent = (await metadata()).folders.find(
    (f) => f.name === 'Projects',
  )!.id;
  await request({
    type: 'folder.save',
    input: { workspaceId, parentId: parent, name: 'Reference' },
  });
  const child = (await metadata()).folders.find(
    (f) => f.name === 'Reference',
  )!.id;
  await request({
    type: 'resource.save',
    kind: 'pinned',
    input: {
      workspaceId,
      title: 'Documentation',
      url: origin + '/Documentation',
      folderId: child,
    },
  });
  await expect(
    ui.getByRole('button', { name: 'Open pinned Documentation' }),
  ).toBeVisible();
  await page.screenshot({
    animations: 'disabled',
    path: 'test-results/master-dark.png',
  });
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
  await ui
    .locator(`[data-folder-id="${parent}"]`)
    .dispatchEvent('dragover', { dataTransfer: data });
  await page.screenshot({
    animations: 'disabled',
    path: 'test-results/master-drag-target.png',
  });
  await ui
    .locator(`[data-folder-id="${parent}"]`)
    .dispatchEvent('drop', { dataTransfer: data });
  await data.dispose();
  await ui
    .getByRole('button', { name: 'Open command palette (Alt+Shift+K)' })
    .click();
  await page
    .getByRole('combobox', { name: 'Command palette search' })
    .fill('Code');
  const bounds = await page.locator('.command-palette').boundingBox();
  expect(bounds).toBeTruthy();
  expect(Math.abs(bounds!.x + bounds!.width / 2 - 640)).toBeLessThan(2);
  await page.screenshot({
    animations: 'disabled',
    path: 'test-results/master-palette.png',
  });
  await page.keyboard.press('Escape');
  await ui.getByRole('button', { name: 'Open settings', exact: true }).click();
  await page.screenshot({
    animations: 'disabled',
    path: 'test-results/master-settings.png',
  });
  await ui.getByRole('button', { name: 'Back to tabs', exact: true }).click();
  const w = (await metadata()).workspaces.find((w) => w.id === workspaceId)!;
  await request({
    type: 'workspace.save',
    input: {
      id: w.id,
      name: w.name,
      color: w.color,
      icon: 'P',
      theme: 'light',
      preferredEmail: '',
    },
  });
  await expect(page.locator('.newtab-shell')).toHaveAttribute(
    'data-theme',
    'light',
  );
  const lightButton = page.locator('.dashboard-tools .text-button');
  const foreground = await lightButton.evaluate(
    (el) => getComputedStyle(el).color,
  );
  const foregroundHex =
    '#' +
    foreground
      .match(/\d+/g)!
      .slice(0, 3)
      .map((v) => Number(v).toString(16).padStart(2, '0'))
      .join('');
  const background = await page
    .locator('.newtab-shell')
    .evaluate((el) => getComputedStyle(el).getPropertyValue('--sk-bg').trim());
  expect(contrastRatio(foregroundHex, background)).toBeGreaterThanOrEqual(4.5);
  await page.screenshot({
    animations: 'disabled',
    path: 'test-results/master-light.png',
  });
  await workspace('Empty workspace');
  await expect(ui.locator('.tab-row')).toHaveCount(0);
  await page.screenshot({
    animations: 'disabled',
    path: 'test-results/master-empty.png',
  });
  await live.close();
});

test('Offline acceptance: local resource editing, palette and persisted metadata work without AI or network', async () => {
  const ui = page.locator('.embedded');
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const live = await context.newPage();
  await live.goto(origin + '/Offline-reference');
  await page.bringToFront();
  await context.setOffline(true);
  await ui.getByRole('button', { name: 'Add shortcut', exact: true }).click();
  await ui.getByLabel('Shortcut name').fill('Offline reference');
  await ui.getByLabel('Web address').fill(origin + '/Offline-reference');
  await ui.getByRole('button', { name: 'Save shortcut', exact: true }).click();
  await expect(
    ui.getByRole('button', { name: 'Offline reference', exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    ui.getByRole('button', { name: 'Offline reference', exact: true }),
  ).toBeVisible();
  await ui
    .getByRole('button', { name: 'Open command palette (Alt+Shift+K)' })
    .click();
  await page
    .getByRole('combobox', { name: 'Command palette search' })
    .fill('Offline');
  await expect(
    page
      .getByRole('dialog', { name: 'Command Palette' })
      .getByRole('option')
      .first(),
  ).toBeVisible();
  await page.keyboard.press('Escape');
  expect((await metadata()).aiSettings?.gatewayKey).toBeUndefined();
  expect(errors).toEqual([]);
  await context.setOffline(false);
  await live.close();
});
