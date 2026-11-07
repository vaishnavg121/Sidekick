/* global process, console, chrome */
import { chromium } from '@playwright/test';
import { readFile, writeFile, mkdtemp, rm, cp } from 'node:fs/promises';
import { resolve, dirname, basename, sep } from 'node:path';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';
import { URL } from 'node:url';
const extension = resolve(process.argv[2] ?? '');
assert(extension.startsWith(resolve('playwright-report') + sep));
const fromVersion = JSON.parse(
  await readFile(resolve(extension, 'manifest.json'), 'utf8'),
).version;
assert(['0.2.0', '0.3.0'].includes(fromVersion));
const profile = await mkdtemp(resolve(tmpdir(), 'sidekick-upgrade-'));
let context;
async function launch() {
  context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium',
    headless: true,
    args: [
      `--disable-extensions-except=${extension}`,
      `--load-extension=${extension}`,
    ],
  });
  await context.route('https://upgrade.example.test/**', (r) =>
    r.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><title>Upgrade fixture</title><h1>Fixture</h1>',
    }),
  );
  const worker =
    context.serviceWorkers()[0] ??
    (await context.waitForEvent('serviceworker'));
  const id = new URL(worker.url()).host,
    page = await context.newPage();
  await page.goto(`chrome-extension://${id}/dashboard.html`);
  return { worker, page, id };
}
try {
  const first = await launch();
  const command = async (command) => {
    const r = await first.page.evaluate(
      async (command) =>
        chrome.runtime.sendMessage({
          channel: 'sidekick',
          windowId: (await chrome.windows.getCurrent()).id,
          command,
        }),
      command,
    );
    assert(r.ok);
  };
  await command({
    type: 'workspace.save',
    input: {
      name: 'Upgrade preservation',
      color: '#6d8fad',
      icon: 'U',
      theme: 'light',
      preferredEmail: '',
    },
  });
  const metadata = () =>
    first.worker.evaluate(
      async () =>
        (await chrome.storage.local.get('sidekick.metadata.v1'))[
          'sidekick.metadata.v1'
        ],
    );
  const workspaceId = (await metadata()).workspaces.find(
    (w) => w.name === 'Upgrade preservation',
  ).id;
  await command({ type: 'workspace.select', id: workspaceId });
  await command({
    type: 'preferences.update',
    patch: { width: 360, openDelay: 250 },
  });
  await command({
    type: 'resource.save',
    kind: 'favorite',
    input: {
      workspaceId,
      title: 'Retained favorite',
      url: 'https://upgrade.example.test/favorite',
    },
  });
  await command({
    type: 'folder.save',
    input: { workspaceId, parentId: null, name: 'Retained folder' },
  });
  await command({
    type: 'resource.save',
    kind: 'pinned',
    input: {
      workspaceId,
      title: 'Retained pin',
      url: 'https://upgrade.example.test/pinned',
      folderId: (await metadata()).folders[0].id,
    },
  });
  const live = await context.newPage();
  await live.goto('https://upgrade.example.test/live');
  await command({ type: 'workspace.select', id: workspaceId });
  await command({ type: 'session.save', name: 'Retained session' });
  const tab = await first.worker.evaluate(
    async () =>
      (await chrome.tabs.query({})).find(
        (t) => t.url === 'https://upgrade.example.test/live',
      ).id,
  );
  await command({ type: 'archive.tab', tabId: tab, close: false });
  await command({
    type: 'snooze.create',
    tabId: tab,
    dueAt: Date.now() + 86400000,
    close: false,
  });
  await first.worker.evaluate(() =>
    chrome.storage.local.set({
      'sidekick.ai.v1': {
        gatewayKey: 'vck_dormant_upgrade_fixture',
        connected: true,
        status: 'connected',
      },
    }),
  );
  const before = await metadata();
  assert(before.library.sessions[0].pages.length > 0);
  await context.close();
  // The same known disposable extension directory preserves the unpacked ID.
  await cp(resolve('.output/chrome-mv3'), extension, {
    recursive: true,
    force: true,
  });
  const second = await launch();
  assert.equal(second.id, first.id);
  const after = await second.worker.evaluate(
    async () =>
      (await chrome.storage.local.get('sidekick.metadata.v1'))[
        'sidekick.metadata.v1'
      ],
  );
  for (const field of [
    'workspaces',
    'favorites',
    'pinnedEntries',
    'folders',
    'preferences',
    'library',
  ])
    assert.deepEqual(after[field], before[field]);
  assert.equal(
    JSON.parse(await readFile(resolve(extension, 'manifest.json'), 'utf8'))
      .version,
    '0.4.0',
  );
  const legacyAi = await second.worker.evaluate(
    async () =>
      (await chrome.storage.local.get('sidekick.ai.v1'))['sidekick.ai.v1'],
  );
  assert.deepEqual(legacyAi, {
    gatewayKey: 'vck_dormant_upgrade_fixture',
    connected: true,
    status: 'connected',
  });
  const report = {
    legacyAiCredentialPreserved: true,
    status: 'PASS',
    from: fromVersion,
    to: '0.4.0',
    sameUnpackedPathAndId: true,
    workspaces: true,
    favorites: true,
    pinned: true,
    folders: true,
    preferences: true,
    sessions: true,
    archive: true,
    snoozed: true,
  };
  await writeFile(
    '.output/sidekick-upgrade-verification.json',
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report));
} finally {
  await context?.close();
  assert.equal(dirname(profile).toLowerCase(), resolve(tmpdir()).toLowerCase());
  assert(basename(profile).startsWith('sidekick-upgrade-'));
  await rm(profile, { recursive: true, force: true });
}
