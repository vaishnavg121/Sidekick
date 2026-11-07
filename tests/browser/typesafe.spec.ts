import type { Metadata, AiSettings } from '../../lib/models';
import {
  test,
  expect,
  chromium,
  type BrowserContext,
  type Worker,
  type Page,
} from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { mockJev } from './mock-jev';
let context: BrowserContext,
  worker: Worker,
  page: Page,
  profile: string,
  extensionId: string;
const directKey = 'synthetic-typesafe-contract-key';
let fault = false;
async function intercept() {
  return mockJev(
    context,
    extensionId,
    (body) => {
      if (!body.questions) return { models: [{ name: 'jev-latest' }] };
      return {
        model: 'jev-fixture',
        usage: { input_tokens: 12, output_tokens: 4 },
        answers: fault
          ? {}
          : Object.fromEntries(
              Object.entries(body.questions).map(([id, q]) => {
                if (q.type === 'noul')
                  return [id, { type: 'noul', noul: 0.99 }];
                if (q.type === 'score') {
                  const criteria = q.criteria as unknown as string[];
                  return [
                    id,
                    {
                      type: 'score',
                      score: 4,
                      confidence: 0.8,
                      legend: Object.fromEntries(
                        criteria.map((v, i) => [String(i), v]),
                      ),
                      probabilities: Object.fromEntries(
                        criteria.map((_, i) => [String(i), i === 4 ? 1 : 0]),
                      ),
                    },
                  ];
                }
                const keys = Object.keys(q.criteria ?? {}),
                  choice = id.startsWith('topic_')
                    ? 'React development'
                    : id.startsWith('cleanup_')
                      ? 'keep'
                      : keys[0]!;
                return [
                  id,
                  {
                    type: 'choice',
                    choice,
                    confidence: 0.7,
                    probabilities: Object.fromEntries(
                      keys.map((k) => [k, k === choice ? 1 : 0]),
                    ),
                  },
                ];
              }),
            ),
      };
    },
    undefined,
    'https://api.typesafe.ai/*',
  );
}
async function launch() {
  const extension = resolve('.output/chrome-mv3');
  context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium',
    headless: true,
    args: [
      '--host-resolver-rules=MAP api.typesafe.ai ~NOTFOUND, MAP ai-gateway.vercel.sh ~NOTFOUND',
      `--disable-extensions-except=${extension}`,
      `--load-extension=${extension}`,
    ],
  });
  await context.route('https://direct-fixture.example.test/**', (r) =>
    r.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><title>React documentation</title><h1>Fixture</h1>',
    }),
  );
  worker =
    context.serviceWorkers()[0] ??
    (await context.waitForEvent('serviceworker'));
  extensionId = new URL(worker.url()).host;
  page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/options.html`);
}
test.beforeEach(async () => {
  fault = false;
  profile = await mkdtemp(join(tmpdir(), 'sidekick-direct-contract-'));
  await launch();
});
test.afterEach(async () => {
  await context?.close();
  await rm(profile, { recursive: true, force: true });
});
test('Direct provider: actual HTTP normalization, secure storage, reload recovery, failure atomicity and disconnect', async () => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await worker.evaluate(() =>
    chrome.storage.local.set({
      'sidekick.ai.v1': {
        provider: 'typesafe',
        gatewayKey: 'vck_dormant_legacy_fixture',
        connected: false,
        status: 'disconnected',
      },
    }),
  );
  await page.reload();
  const meter = await intercept();
  await expect(page.getByLabel('AI provider', { exact: true })).toHaveValue(
    'typesafe',
  );
  await page.getByLabel('TypeSafe Direct API key').fill(directKey);
  await page
    .getByRole('button', { name: 'Verify & Connect', exact: true })
    .click();
  await expect(page.getByText('Connected', { exact: true })).toBeVisible();
  await expect(page.getByText(/Model: jev-fixture/)).toBeVisible();
  expect(meter.count()).toBe(2);
  await page.getByText('Connected', { exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({
    path: 'test-results/typesafe-contract-connected.png',
    animations: 'disabled',
  });
  const stored = await worker.evaluate(() =>
    chrome.storage.local.get('sidekick.ai.v1'),
  );
  expect(stored['sidekick.ai.v1']).toMatchObject({
    provider: 'typesafe',
    typesafeKey: directKey,
    gatewayKey: 'vck_dormant_legacy_fixture',
  });
  const fixture = await context.newPage();
  await fixture.goto('https://direct-fixture.example.test/react');
  const related = await context.newPage();
  await related.goto('https://direct-fixture.example.test/reference');
  await page.goto(`chrome-extension://${extensionId}/dashboard.html`);
  const ui = page.locator('.embedded');
  await ui.getByRole('button', { name: 'AI suggestions', exact: true }).click();
  await ui
    .getByRole('button', { name: 'Analyze workspace tabs', exact: true })
    .click();
  await expect(
    ui.getByRole('button', { name: 'Accept category', exact: true }),
  ).toHaveCount(2);
  await expect(
    ui.getByRole('button', { name: 'Analyze workspace tabs', exact: true }),
  ).toBeEnabled();
  await expect(ui.locator('.error-message')).toHaveCount(0);
  await ui
    .getByRole('heading', { name: 'Categories', exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: 'test-results/typesafe-contract-review.png',
    animations: 'disabled',
  });
  await ui
    .getByRole('button', { name: 'Accept category', exact: true })
    .first()
    .click();
  const metadata = () =>
    worker.evaluate(
      async () =>
        (await chrome.storage.local.get('sidekick.metadata.v1'))[
          'sidekick.metadata.v1'
        ] as Metadata,
    );
  await expect
    .poll(
      async () =>
        Object.keys((await metadata()).aiState?.acceptedByUrl ?? {}).length,
    )
    .toBe(1);
  const before = JSON.stringify((await metadata()).aiState);
  fault = true;
  await ui
    .getByLabel('Workspace focus goal')
    .fill('New invalid-response fixture goal');
  await ui.getByRole('button', { name: 'Evaluate focus', exact: true }).click();
  await expect(ui.getByRole('alert')).toContainText('invalid or contradictory');
  expect(JSON.stringify((await metadata()).aiState)).toBe(before);
  await page.screenshot({
    path: 'test-results/typesafe-contract-error.png',
    animations: 'disabled',
  });
  fault = false;
  // A full isolated-browser restart guarantees a new worker and credential rehydration.
  await context.close();
  await launch();
  // Transport was covered above. This worker-local mock separately verifies that
  // a genuinely new worker rehydrates the Direct credential after browser exit.
  await worker.evaluate(() => {
    globalThis.fetch = async (input, init) => {
      if (
        String(input) !== 'https://api.typesafe.ai/v1/systemone' ||
        new Headers(init?.headers).get('Authorization') !==
          'Bearer synthetic-typesafe-contract-key'
      )
        throw Error('Wrong provider or rehydrated credential.');
      const body = JSON.parse(String(init?.body));
      return new Response(
        JSON.stringify({
          model: 'jev-fixture',
          usage: { input_tokens: 10, output_tokens: 10 },
          answers: Object.fromEntries(
            Object.entries(body.questions).map(([id, value]) => {
              const q = value as { criteria: string[] };
              return [
                id,
                {
                  type: 'score',
                  score: 4,
                  confidence: 0.8,
                  legend: Object.fromEntries(q.criteria.map((v, i) => [i, v])),
                  probabilities: Object.fromEntries(
                    q.criteria.map((_, i) => [i, i === 4 ? 1 : 0]),
                  ),
                },
              ];
            }),
          ),
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    };
  });
  await expect(page.getByText('Connected', { exact: true })).toBeVisible();
  const restoredFixture = await context.newPage();
  await restoredFixture.goto('https://direct-fixture.example.test/recovered');
  await page.goto(`chrome-extension://${extensionId}/dashboard.html`);
  await page
    .locator('.embedded')
    .getByRole('button', { name: 'AI suggestions', exact: true })
    .click();
  await page
    .getByLabel('Workspace focus goal')
    .fill('React recovery after restart');
  await page
    .getByRole('button', { name: 'Evaluate focus', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Focus relevance', exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: 'test-results/typesafe-contract-recovery.png',
    animations: 'disabled',
  });
  const backup = await page.evaluate(async () =>
    chrome.runtime.sendMessage({
      channel: 'sidekick',
      windowId: (await chrome.windows.getCurrent()).id,
      command: { type: 'backup.export' },
    }),
  );
  expect(backup.backup).not.toContain(directKey);
  expect(backup.backup).not.toContain('vck_dormant_legacy_fixture');
  await page.goto(`chrome-extension://${extensionId}/options.html`);
  await page
    .getByRole('button', { name: 'Disconnect & Remove Key', exact: true })
    .click();
  await expect(page.getByText('Not connected', { exact: true })).toBeVisible();
  const after = await worker.evaluate(() =>
    chrome.storage.local.get('sidekick.ai.v1'),
  );
  expect((after['sidekick.ai.v1'] as AiSettings).typesafeKey).toBeUndefined();
  expect((after['sidekick.ai.v1'] as AiSettings).gatewayKey).toBe(
    'vck_dormant_legacy_fixture',
  );
  expect(errors).toEqual([]);
});
test('Direct provider: refuses cross-provider keys before transport and preserves legacy selection', async () => {
  const meter = await intercept();
  await page
    .getByLabel('TypeSafe Direct API key')
    .fill('vck_wrong_provider_fixture');
  await page
    .getByRole('button', { name: 'Verify & Connect', exact: true })
    .click();
  await expect(page.getByRole('alert')).toContainText('different AI provider');
  expect(meter.count()).toBe(0);
  await page.getByLabel('AI provider', { exact: true }).selectOption('vercel');
  await page.getByLabel('Vercel AI Gateway API key').fill(directKey);
  await page
    .getByRole('button', { name: 'Verify & Connect', exact: true })
    .click();
  await expect(page.getByRole('alert')).toContainText('different AI provider');
  expect(meter.count()).toBe(0);
});
