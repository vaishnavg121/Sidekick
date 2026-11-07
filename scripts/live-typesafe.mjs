/* global process, console, chrome, window, setTimeout, clearTimeout */
// Opt-in only. No Playwright traces, video, raw payloads, headers or exception dumps.
import { chromium, expect } from '@playwright/test';
import { readFile, writeFile, mkdtemp, rm, mkdir } from 'node:fs/promises';
import { existsSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, dirname, basename } from 'node:path';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';
import { URL } from 'node:url';
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';

const names = [
  'connection',
  'classification',
  'routing',
  'grouping',
  'focus',
  'cleanup',
];
const report = {
  status: 'SKIPPED',
  requestsThisRun: 0,
  features: Object.fromEntries(
    names.map((n) => [
      n,
      {
        status: 'BLOCKED',
        live: false,
        valid: false,
        ui: false,
        actions: false,
        persisted: false,
        restart: false,
      },
    ]),
  ),
};
let profile,
  context,
  page,
  key,
  stage = 'setup';
const budgetPath = resolve('.output/live-typesafe-budget.json');
const reportPath = resolve('.output/live-typesafe-report.json');
if (process.env.SIDEKICK_LIVE !== '1') {
  console.log(
    'SKIPPED: set SIDEKICK_LIVE=1 to authorize the explicitly opt-in runner.',
  );
  process.exit(0);
}
await mkdir('.output', { recursive: true });
const budget = existsSync(budgetPath)
  ? JSON.parse(await readFile(budgetPath, 'utf8'))
  : {
      used: JSON.parse(await readFile('.output/live-jev-budget.json', 'utf8'))
        .used,
      maximum: 25,
      halted: false,
      provider: 'typesafe',
      historicalVercelUsed: JSON.parse(
        await readFile('.output/live-jev-budget.json', 'utf8'),
      ).used,
    };
const resume = process.argv.includes('--resume');
const accessFixed = process.argv.includes('--access-fixed');
assert(
  !accessFixed || (resume && budget.stopStatus === 403),
  '--access-fixed requires an explicit resume after a recorded 403 and owner-confirmed account access correction.',
);
const expectedUsed = process.argv
  .find((v) => v.startsWith('--expected-used='))
  ?.split('=')[1];
let probeRemaining = 0;
assert(
  Number.isInteger(budget.used) &&
    budget.used >= 0 &&
    budget.used < 25 &&
    budget.maximum === 25,
  'Invalid or exhausted campaign ledger.',
);
if (budget.halted) {
  assert(
    resume && expectedUsed === String(budget.used),
    'Halted campaign: explicit --resume --expected-used=<current count> required.',
  );
  probeRemaining = 1;
} else assert(!resume, 'Resume applies only to a halted campaign.');
try {
  assert(existsSync('.env.e2e.local'));
  execFileSync('git', ['check-ignore', '--quiet', '.env.e2e.local']);
  delete process.env.TYPESAFE_API_KEY;
  process.loadEnvFile('.env.e2e.local');
  key = process.env.TYPESAFE_API_KEY?.trim() ?? '';
  delete process.env.TYPESAFE_API_KEY;
  assert(
    key.length >= 16 &&
      !key.startsWith('vck_') &&
      !/\s/.test(key) &&
      !/^(your|replace|example|<)/i.test(key),
    'Local credential is not a TypeSafe Direct key; no request sent.',
  );
  const fingerprint = createHash('sha256').update(key).digest('hex');
  assert(
    !budget.halted ||
      budget.rejectedCredentialFingerprint !== fingerprint ||
      accessFixed,
    'This credential was already rejected. Replace it, or have the owner correct account access and explicitly attest with --access-fixed before resuming.',
  );
  budget.credentialFingerprint = fingerprint;
  report.resumedFromUsed = resume ? budget.used : null;
  report.previousStopStatus = budget.stopStatus ?? null;
  report.ownerAttestedAccessFix = accessFixed;
  report.responses = [];
  profile = await mkdtemp(resolve(tmpdir(), 'sidekick-typesafe-live-'));
  const extension = resolve('.output/chrome-mv3');
  context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium',
    headless: true,
    viewport: { width: 1366, height: 768 },
    args: [
      '--host-resolver-rules=MAP ai-gateway.vercel.sh ~NOTFOUND',
      `--disable-extensions-except=${extension}`,
      `--load-extension=${extension}`,
    ],
  });
  const fixtures = [
    [
      'https://github.com/sidekick-fixture/react',
      'React development repository on GitHub',
    ],
    ['https://react.dev/learn', 'React documentation — components and hooks'],
    [
      'https://react.dev/reference/react',
      'React API reference — components and hooks',
    ],
    [
      'https://arxiv.org/abs/fixture',
      'Research paper — machine learning evaluation',
    ],
    ['https://www.youtube.com/watch?v=fixture', 'Music video — entertainment'],
    [
      'https://store.example.test/products?variant=blue',
      'Shop running shoes online',
    ],
    [
      'https://mail.google.com/mail/fixture',
      'Gmail inbox — email communication',
    ],
    [
      'https://calendar.google.com/calendar/fixture',
      'Calendar — weekly planning',
    ],
    ['https://react.dev/learn', 'React documentation — components and hooks'],
    [
      'https://store.example.test/products?variant=red',
      'Shop running shoes online',
    ],
    [
      'https://docs.example.test/react',
      'React API reference — components and hooks',
    ],
    [
      'https://planning.example.test/tasks',
      'Task board — weekly productivity planning',
    ],
    [
      'https://reference.example.test/react?version=18',
      'React documentation — version 18',
    ],
    [
      'https://reference.example.test/react?version=19',
      'React documentation — version 19',
    ],
  ];
  const fixtureMap = new Map(fixtures);
  fixtureMap.set(
    'https://foreign.example.test/isolated',
    'Foreign window — isolated fixture',
  );
  await context.route('https://**/*', (route) => {
    const title = fixtureMap.get(route.request().url());
    if (!title) return route.continue();
    return route.fulfill({
      contentType: 'text/html; charset=utf-8',
      body: `<!doctype html><title>${title}</title><h1>${title}</h1><script>window.loadToken=crypto.randomUUID()</script>`,
    });
  });
  let worker =
    context.serviceWorkers()[0] ??
    (await context.waitForEvent('serviceworker'));
  const id = new URL(worker.url()).host;
  const cdp = await context.browser().newBrowserCDPSession();
  let nextId = 1;
  let activeMeterSession;
  async function meter(targetId) {
    if (activeMeterSession)
      await cdp
        .send('Target.detachFromTarget', { sessionId: activeMeterSession })
        .catch(() => {});
    const { targetInfos } = await cdp.send('Target.getTargets');
    const target = targetInfos.find(
      (t) =>
        t.type === 'service_worker' &&
        t.url.includes(id) &&
        (!targetId || t.targetId === targetId),
    );
    assert(target);
    const { sessionId } = await cdp.send('Target.attachToTarget', {
      targetId: target.targetId,
      flatten: false,
    });
    activeMeterSession = sessionId;
    const pending = new Map();
    async function send(method, params) {
      const messageId = nextId++;
      const result = new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(messageId);
          reject(Error('Gateway meter acknowledgement timed out.'));
        }, 5000);
        pending.set(messageId, { resolve, reject, timer });
      });
      await cdp.send('Target.sendMessageToTarget', {
        sessionId,
        message: JSON.stringify({ id: messageId, method, params }),
      });
      return result;
    }
    cdp.on('Target.receivedMessageFromTarget', (e) => {
      if (e.sessionId !== sessionId) return;
      const event = JSON.parse(e.message);
      if (event.id && pending.has(event.id)) {
        const item = pending.get(event.id);
        clearTimeout(item.timer);
        pending.delete(event.id);
        if (event.error) item.reject(Error('Gateway meter command failed.'));
        else item.resolve(event.result);
        return;
      }
      if (event.method !== 'Fetch.requestPaused') return;
      void (async () => {
        const p = event.params;
        if (p.responseStatusCode !== undefined) {
          const status = p.responseStatusCode;
          const diagnostic = {
            httpStatus: status,
            category:
              status === 401
                ? 'invalid_authentication'
                : status === 402
                  ? 'payment_or_credit_required'
                  : status === 403
                    ? 'access_forbidden'
                    : status === 429
                      ? 'rate_or_quota_limit'
                      : status >= 400
                        ? 'request_or_provider_error'
                        : 'success',
            gatewayCode: null,
          };
          if (status >= 400) {
            budget.halted = true;
            budget.stopStatus = status;
            budget.rejectedCredentialFingerprint = budget.credentialFingerprint;
            writeFileSync(budgetPath, JSON.stringify(budget));
            // Read only a fixed allowlist of public error codes. Never retain body/messages/headers.
            try {
              const body = await send('Fetch.getResponseBody', {
                requestId: p.requestId,
              });
              const data = JSON.parse(
                body.base64Encoded
                  ? Buffer.from(body.body, 'base64').toString('utf8')
                  : body.body,
              );
              const code = data?.error?.code ?? data?.error?.type ?? data?.type;
              if (
                [
                  'invalid_api_key',
                  'authentication_error',
                  'invalid_request_error',
                  'insufficient_credits',
                  'insufficient_quota',
                  'rate_limit_exceeded',
                  'model_not_found',
                  'permission_denied',
                  'forbidden',
                  'unauthorized',
                  'no_providers_available',
                  'model_not_available',
                  'gateway_authentication_error',
                  'gateway_permission_denied',
                  'gateway_insufficient_credits',
                  'gateway_rate_limit_error',
                ].includes(code)
              )
                diagnostic.gatewayCode = code;
            } catch {
              /* No raw remote data is recorded. */
            }
          }
          diagnostic.endpoint = new URL(p.request.url).pathname;
          let body;
          if (status === 200) {
            try {
              const result = await send('Fetch.getResponseBody', {
                requestId: p.requestId,
              });
              body = JSON.parse(
                result.base64Encoded
                  ? Buffer.from(result.body, 'base64').toString('utf8')
                  : result.body,
              );
              if (/^jev[\w.-]{0,80}$/.test(body.model))
                diagnostic.model = body.model;
              if (
                body.usage &&
                [body.usage.input_tokens, body.usage.output_tokens].every(
                  (v) => Number.isSafeInteger(v) && v >= 0,
                )
              )
                diagnostic.usage = {
                  inputTokens: body.usage.input_tokens,
                  outputTokens: body.usage.output_tokens,
                };
              if (body.models)
                diagnostic.jevLatestAvailable =
                  Array.isArray(body.models) &&
                  body.models.some((m) => m.name === 'jev-latest');
              if (body.answers && typeof body.answers === 'object') {
                const names = Object.keys(body.answers);
                diagnostic.answerCount = names.length;
                diagnostic.scoreDiagnostics = names
                  .filter((n) => body.answers[n]?.type === 'score')
                  .slice(0, 20)
                  .map((n) => {
                    const a = body.answers[n];
                    let q;
                    try {
                      q = JSON.parse(p.request.postData ?? '{}').questions?.[n];
                    } catch {
                      /* no raw data */
                    }
                    return {
                      question: n,
                      score: Number.isFinite(a.score) ? a.score : null,
                      probabilities:
                        a.probabilities && typeof a.probabilities === 'object'
                          ? Object.fromEntries(
                              Object.entries(a.probabilities)
                                .filter(
                                  ([k, v]) =>
                                    /^\d+$/.test(k) &&
                                    typeof v === 'number' &&
                                    Number.isFinite(v),
                                )
                                .slice(0, 10),
                            )
                          : null,
                      legendKeys:
                        a.legend && typeof a.legend === 'object'
                          ? Object.keys(a.legend).filter((k) => /^\d+$/.test(k))
                          : [],
                      legendMatches:
                        !!q &&
                        q.criteria?.every(
                          (v, i) => a.legend?.[String(i)] === v,
                        ),
                    };
                  });

                let questions = {};
                try {
                  questions =
                    JSON.parse(p.request.postData ?? '{}').questions ?? {};
                } catch {
                  /* No raw data retained. */
                }
                diagnostic.decisions = names
                  .filter((n) =>
                    /^(test|(?:classify|route|topic|focus|cleanup)_\d+)$/.test(
                      n,
                    ),
                  )
                  .slice(0, 20)
                  .map((n) => {
                    const a = body.answers[n],
                      q = questions[n],
                      safe = { question: n };
                    if (
                      a?.type === 'noul' &&
                      Number.isFinite(a.noul) &&
                      a.noul >= 0 &&
                      a.noul <= 1
                    )
                      safe.probability = a.noul;
                    if (
                      a?.type === 'choice' &&
                      q?.criteria &&
                      Object.hasOwn(q.criteria, a.choice)
                    ) {
                      safe.choice = a.choice;
                      const probability = a.probabilities?.[a.choice];
                      if (
                        Number.isFinite(probability) &&
                        probability >= 0 &&
                        probability <= 1
                      )
                        safe.selectedProbability = probability;
                    }
                    if (
                      a?.type === 'score' &&
                      Number.isFinite(a.score) &&
                      a.score >= 0 &&
                      a.score <= 10
                    )
                      safe.score = a.score;
                    if (
                      Number.isFinite(a?.confidence) &&
                      a.confidence >= 0 &&
                      a.confidence <= 1
                    )
                      safe.providerConfidence = a.confidence;
                    return safe;
                  });
                diagnostic.feature =
                  names[0] === 'test'
                    ? 'connection'
                    : names[0]?.startsWith('classify_')
                      ? 'classification'
                      : names[0]?.startsWith('route_')
                        ? 'routing'
                        : names[0]?.startsWith('topic_')
                          ? 'grouping'
                          : names[0]?.startsWith('focus_')
                            ? 'focus'
                            : 'cleanup';
              }
            } catch {
              diagnostic.safeMetadataUnavailable = true;
            }
          }
          report.responses.push(diagnostic);
          await send('Fetch.continueResponse', { requestId: p.requestId });
          return;
        }
        const isProbe = budget.halted && probeRemaining > 0;
        const blocked =
          (budget.halted && !isProbe) || budget.used >= budget.maximum;
        if (!blocked) {
          if (isProbe) probeRemaining--;
          budget.used++;
          report.requestsThisRun++;
          writeFileSync(budgetPath, JSON.stringify(budget));
        }
        await send(
          blocked ? 'Fetch.failRequest' : 'Fetch.continueRequest',
          blocked
            ? { requestId: p.requestId, errorReason: 'BlockedByClient' }
            : { requestId: p.requestId },
        );
      })().catch(() => {
        budget.halted = true;
        report.meterFailed = true;
        writeFileSync(budgetPath, JSON.stringify(budget));
        void context.close().catch(() => {});
      });
    });
    // Wait for the worker acknowledgement before allowing the UI to send anything.
    await send('Fetch.enable', {
      patterns: [
        {
          urlPattern: 'https://api.typesafe.ai/*',
          requestStage: 'Request',
        },
        {
          urlPattern: 'https://api.typesafe.ai/*',
          requestStage: 'Response',
        },
      ],
    });
    return target.targetId;
  }
  await meter();
  page = await context.newPage();
  const errors = [];
  page.on('pageerror', () => errors.push('owned-page-error'));
  async function command(command) {
    const r = await page.evaluate(
      async (command) =>
        chrome.runtime.sendMessage({
          channel: 'sidekick',
          windowId: (await chrome.windows.getCurrent()).id,
          command,
        }),
      command,
    );
    assert(r.ok, 'Sanitized extension operation failed.');
    return r;
  }
  async function metadata() {
    return worker.evaluate(
      async () =>
        (await chrome.storage.local.get('sidekick.metadata.v1'))[
          'sidekick.metadata.v1'
        ],
    );
  }
  await page.goto(`chrome-extension://${id}/options.html`);
  stage = 'connection';
  await expect(page.getByText('Not connected', { exact: true })).toBeVisible();
  // Trusted options only. The value is never placed in a website/content script.
  await page
    .getByLabel('AI provider', { exact: true })
    .selectOption('typesafe');
  await page.getByLabel('TypeSafe Direct API key').fill(key);
  report.features.connection.live = true;
  await page.getByRole('button', { name: 'Verify & Connect' }).click();
  await expect
    .poll(async () => page.locator('.ai-status-badge').innerText(), {
      timeout: 30000,
    })
    .toMatch(/Connected|Error:/);
  const connection = await page.locator('.ai-status-badge').innerText();
  if (connection !== 'Connected') {
    report.status = 'BLOCKED';
    report.reason = /authorization/i.test(connection)
      ? 'TypeSafe authentication or access rejected'
      : /quota|rate/i.test(connection)
        ? 'TypeSafe rate or balance restriction'
        : 'TypeSafe unavailable or returned invalid verification';
    budget.halted = true;
    throw Error('external-block');
  }
  assert(
    report.responses.filter((r) => r.httpStatus === 200).length === 2 &&
      !report.meterFailed,
    'Verification must have an observed HTTP 200 and validated answer.',
  );
  budget.halted = false;
  delete budget.rejectedCredentialFingerprint;
  budget.lastVerifiedAt = new Date().toISOString();
  writeFileSync(budgetPath, JSON.stringify(budget));
  report.authenticationSucceeded = true;
  report.verificationSchemaMatched = true;
  report.features.connection = {
    status: 'PASS',
    live: true,
    valid: true,
    ui: true,
    actions: true,
    persisted: true,
    restart: false,
  };
  await page.getByText('Connected', { exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({
    path: '.output/typesafe-live-connected.png',
    animations: 'disabled',
  });
  if (process.argv.includes('--verify-only')) {
    report.status = 'PASS';
    report.scope = 'authentication-only';
  } else {
    await page.goto(`chrome-extension://${id}/dashboard.html`);
    const ui = page.locator('.embedded');
    const inbox = (await metadata()).activeWorkspaceId;
    for (const name of [
      'Development — React and code',
      'Research — papers',
      'Personal — shopping and entertainment',
    ])
      await command({
        type: 'workspace.save',
        input: {
          name,
          color: '#6d8fad',
          icon: 'S',
          theme: 'dark',
          preferredEmail: '',
        },
      });
    await command({ type: 'workspace.select', id: inbox });
    const pages = [];
    for (const [url] of fixtures) {
      const p = await context.newPage();
      await p.goto(url);
      pages.push(p);
    }
    const baseWindow = await page.evaluate(
      async () => (await chrome.windows.getCurrent()).id,
    );
    const foreign = await worker.evaluate(async () => {
      const w = await chrome.windows.create({
        url: 'https://foreign.example.test/isolated',
        focused: false,
      });
      return {
        windowId: w.id,
        tabs: w.tabs.map((t) => ({
          id: t.id,
          url: t.url,
          pinned: t.pinned,
          groupId: t.groupId,
        })),
      };
    });
    await expect
      .poll(
        async () =>
          await worker.evaluate(
            async (windowId) => (await chrome.tabs.query({ windowId }))[0]?.url,
            foreign.windowId,
          ),
      )
      .toBe('https://foreign.example.test/isolated');
    foreign.tabs = await worker.evaluate(
      async (windowId) =>
        (await chrome.tabs.query({ windowId })).map((t) => ({
          id: t.id,
          url: t.url,
          pinned: t.pinned,
          groupId: t.groupId,
        })),
      foreign.windowId,
    );
    const crossTab = await worker.evaluate(
      async (windowId) =>
        chrome.tabs.create({
          windowId,
          url: 'https://react.dev/learn',
          active: false,
        }),
      baseWindow,
    );
    await command({
      type: 'tab.updateWorkspace',
      tabId: crossTab.id,
      workspaceId: (await metadata()).workspaces.find((w) =>
        w.name.startsWith('Development'),
      ).id,
    });
    await command({ type: 'workspace.select', id: inbox });
    await page.bringToFront();
    const tokens = await Promise.all(
      pages.map((p) => p.evaluate(() => window.loadToken)),
    );
    await ui
      .getByRole('button', { name: 'AI suggestions', exact: true })
      .click();
    const section = (heading) =>
      ui.locator('.ai-section').filter({
        has: page.getByRole('heading', { name: heading, exact: true }),
      });
    if (!process.argv.includes('--diagnostic-focus-only')) {
      stage = 'analyze';
      await ui
        .getByRole('button', { name: 'Analyze workspace tabs', exact: true })
        .click();
      await expect(
        ui.getByRole('heading', { name: 'Categories', exact: true }),
      ).toBeVisible({ timeout: 45000 });
      await expect(
        ui.getByRole('button', { name: 'Analyze workspace tabs', exact: true }),
      ).toBeEnabled({ timeout: 60000 });
      assert.equal(
        await section('Categories')
          .getByRole('button', { name: 'Accept category', exact: true })
          .count(),
        fixtures.length,
      );
      assert.equal(await ui.locator('.error-message').count(), 0);
      for (const n of ['classification', 'routing', 'grouping', 'cleanup'])
        Object.assign(report.features[n], {
          live: true,
          valid: true,
          ui: true,
        });
      await page.screenshot({
        path: '.output/typesafe-live-classification.png',
      });
      stage = 'classification';
      await section('Categories')
        .getByRole('button', { name: 'Accept category', exact: true })
        .first()
        .click();
      await expect
        .poll(
          async () =>
            Object.keys((await metadata()).aiState?.acceptedByUrl ?? {}).length,
        )
        .toBe(1);
      await section('Categories')
        .getByRole('button', { name: 'Dismiss category', exact: true })
        .first()
        .click();
      Object.assign(report.features.classification, {
        actions: true,
        persisted: true,
        status: 'PASS',
      });
      const edit = section('Categories').locator('select').first();
      await edit.selectOption('Research');
      await section('Categories')
        .getByRole('button', { name: 'Accept category', exact: true })
        .first()
        .click();
      await expect
        .poll(async () =>
          Object.values((await metadata()).aiState?.acceptedByUrl ?? {}).some(
            (v) => v.category === 'Research',
          ),
        )
        .toBe(true);
      assert(
        Object.keys((await metadata()).aiState?.dismissedCategoriesByUrl ?? {})
          .length > 0,
      );
      report.features.classification.edited = true;
      stage = 'grouping';
      const groups = section('Related tabs').getByRole('button', {
        name: 'Accept tab group',
        exact: true,
      });
      if (await groups.count()) {
        await section('Related tabs').scrollIntoViewIfNeeded();
        await page.screenshot({
          path: '.output/typesafe-live-grouping.png',
          animations: 'disabled',
        });
        const groupBefore = await worker.evaluate(() => chrome.tabs.query({}));
        const dismissFirst = section('Related tabs').getByRole('button', {
          name: 'Dismiss group',
          exact: true,
        });
        if ((await dismissFirst.count()) > 1) {
          await dismissFirst.last().click();
          assert.deepEqual(
            await worker
              .evaluate(() => chrome.tabs.query({}))
              .then((ts) => ts.map((t) => [t.id, t.groupId])),
            groupBefore.map((t) => [t.id, t.groupId]),
          );
          report.features.grouping.rejected = true;
        }
        await groups.first().click();
        await expect
          .poll(
            async () =>
              (await worker.evaluate(() => chrome.tabGroups.query({}))).length,
          )
          .toBeGreaterThan(0);
        assert.equal((await metadata()).pinnedEntries.length, 0);
        const dismiss = section('Related tabs').getByRole('button', {
          name: 'Dismiss group',
          exact: true,
        });
        if (await dismiss.count()) await dismiss.first().click();
        Object.assign(report.features.grouping, {
          actions: true,
          persisted: true,
          status: 'PASS',
        });
      } else
        report.features.grouping.reason =
          'Model returned no related group; accept path not exercised';
    }
    stage = 'focus';
    await ui
      .getByLabel('Workspace focus goal')
      .fill('Focus on React development and documentation.');
    await ui
      .getByRole('button', { name: 'Evaluate focus', exact: true })
      .click();
    await expect(
      ui.getByRole('heading', { name: 'Focus relevance', exact: true }),
    ).toBeVisible({ timeout: 45000 });
    await expect(
      ui.getByRole('button', { name: 'Exit Focus / Show All', exact: true }),
    ).toBeVisible();
    const focusDecisions = report.responses
      .filter((r) => r.feature === 'focus')
      .at(-1).decisions;
    const expectedHidden = focusDecisions
      .filter((d) => d.score < 2.5)
      .map((d) => Number(d.question.split('_')[1]))
      .sort((a, b) => a - b);
    const actualHidden = await worker.evaluate(
      async ({ windowId, workspaceId }) =>
        (await chrome.storage.session.get('sidekick.window-ui.v1'))[
          'sidekick.window-ui.v1'
        ][windowId]?.focusHidden?.[workspaceId] ?? [],
      { windowId: baseWindow, workspaceId: inbox },
    );
    assert.deepEqual(
      actualHidden.sort((a, b) => a - b),
      expectedHidden,
    );
    await section('Focus relevance').scrollIntoViewIfNeeded();
    await page.screenshot({
      path: '.output/typesafe-live-focus.png',
      animations: 'disabled',
    });
    await section('Focus relevance')
      .getByRole('button', { name: 'Hide during Focus', exact: true })
      .first()
      .click();
    await section('Focus relevance')
      .getByRole('button', { name: 'Keep visible', exact: true })
      .first()
      .click();
    await ui
      .getByRole('button', { name: 'Exit Focus / Show All', exact: true })
      .click();
    await expect
      .poll(async () => (await metadata()).aiState.focusPreferences[inbox].mode)
      .toBe(false);
    assert.equal(pages.filter((p) => !p.isClosed()).length, fixtures.length);
    report.features.focus = {
      status: 'PASS',
      live: true,
      valid: true,
      ui: true,
      actions: true,
      persisted: true,
      restart: false,
    };
    if (process.argv.includes('--diagnostic-focus-only')) {
      report.status = 'PASS';
      report.scope = 'focus-diagnostic-only';
    } else {
      stage = 'cleanup';
      const review = section('Cleanup suggestions').getByRole('button', {
        name: 'Review cleanup',
        exact: true,
      });
      if (await review.count()) {
        await section('Cleanup suggestions').scrollIntoViewIfNeeded();
        await page.screenshot({
          path: '.output/typesafe-live-cleanup.png',
          animations: 'disabled',
        });
        const count = context.pages().length;
        await review.first().click();
        await ui
          .getByRole('button', { name: 'Cancel cleanup', exact: true })
          .click();
        assert.equal(context.pages().length, count);
        await review.first().click();
        await ui
          .getByRole('button', {
            name: 'Confirm archive and close',
            exact: true,
          })
          .click();
        await expect
          .poll(async () => (await metadata()).library?.archive.length ?? 0)
          .toBeGreaterThan(0);
        Object.assign(report.features.cleanup, {
          actions: true,
          persisted: true,
          status: 'PASS',
        });
      }
      stage = 'routing';
      if (await section('Workspace routing').count()) {
        await section('Workspace routing').scrollIntoViewIfNeeded();
        await page.screenshot({
          path: '.output/typesafe-live-routing.png',
          animations: 'disabled',
        });
      }
      const moves = section('Workspace routing').getByRole('button', {
        name: 'Accept move',
        exact: true,
      });
      if (await moves.count()) {
        const rejects = section('Workspace routing').getByRole('button', {
          name: 'Reject recommendation',
          exact: true,
        });
        if ((await rejects.count()) > 1) {
          const membershipBeforeReject = JSON.stringify(
            await worker.evaluate(() =>
              chrome.storage.session.get('sidekick.memberships.v2'),
            ),
          );
          await rejects.last().click();
          assert.equal(
            JSON.stringify(
              await worker.evaluate(() =>
                chrome.storage.session.get('sidekick.memberships.v2'),
              ),
            ),
            membershipBeforeReject,
          );
          await expect
            .poll(
              async () =>
                Object.keys((await metadata()).aiState?.rejectedByUrl ?? {})
                  .length,
            )
            .toBeGreaterThan(0);
        }
        const before = await worker.evaluate(() =>
          chrome.storage.session.get('sidekick.memberships.v2'),
        );
        const allTabsBeforeRoute = await worker.evaluate(() =>
          chrome.tabs.query({}),
        );
        await moves.first().click();
        await expect
          .poll(async () =>
            JSON.stringify(
              await worker.evaluate(() =>
                chrome.storage.session.get('sidekick.memberships.v2'),
              ),
            ),
          )
          .not.toBe(JSON.stringify(before));
        assert.deepEqual(
          (await worker.evaluate(() => chrome.tabs.query({})))
            .map((t) => t.id)
            .sort(),
          allTabsBeforeRoute.map((t) => t.id).sort(),
        );
        Object.assign(report.features.routing, {
          actions: true,
          persisted: true,
          status: 'PASS',
        });
      } else
        report.features.routing.reason =
          'Model returned no destination change; accept path not exercised';
      for (let i = 0; i < pages.length; i++)
        if (!pages[i].isClosed())
          assert.equal(
            await pages[i].evaluate(() => window.loadToken),
            tokens[i],
          );
      assert.equal(
        await worker.evaluate(
          async (id) => (await chrome.tabs.get(id)).url,
          crossTab.id,
        ),
        'https://react.dev/learn',
      );
      const foreignAfter = await worker.evaluate(
        async (windowId) =>
          (await chrome.tabs.query({ windowId })).map((t) => ({
            id: t.id,
            url: t.url,
            pinned: t.pinned,
            groupId: t.groupId,
          })),
        foreign.windowId,
      );
      assert.deepEqual(foreignAfter, foreign.tabs);
      report.independentWindows = true;
      report.crossWorkspaceCleanupSafe = true;
      const archiveEntry = (await metadata()).library?.archive[0];
      if (archiveEntry) {
        await command({ type: 'archive.restore', id: archiveEntry.id });
        await expect
          .poll(async () =>
            (await metadata()).library.archive.some(
              (a) => a.id === archiveEntry.id,
            ),
          )
          .toBe(false);
        report.features.cleanup.recovery = true;
      }
      const membershipsBeforeRestart = await worker.evaluate(
        async () =>
          (await chrome.storage.session.get('sidekick.memberships.v2'))[
            'sidekick.memberships.v2'
          ].tabs,
      );
      const groupsBeforeRestart = await worker.evaluate(async () =>
        (await chrome.tabGroups.query({})).map((g) => ({
          id: g.id,
          title: g.title,
        })),
      );
      stage = 'restart';
      const saved = JSON.stringify((await metadata()).aiState);
      const lifecycle = await context.newCDPSession(page);
      const versions = new Map();
      const restart = { versionId: '', stopped: false };
      lifecycle.on('ServiceWorker.workerVersionUpdated', (e) => {
        for (const version of e.versions)
          if (version.scriptURL.includes(id)) {
            versions.set(version.versionId, version);
            if (
              version.versionId === restart.versionId &&
              version.runningStatus === 'stopped'
            )
              restart.stopped = true;
          }
      });
      await lifecycle.send('ServiceWorker.enable');
      await expect
        .poll(
          () =>
            [...versions.values()].find((v) => v.runningStatus === 'running')
              ?.versionId,
        )
        .toBeTruthy();
      restart.versionId = [...versions.values()].find(
        (v) => v.runningStatus === 'running',
      ).versionId;
      if (activeMeterSession) {
        await cdp
          .send('Target.detachFromTarget', { sessionId: activeMeterSession })
          .catch(() => {});
        activeMeterSession = undefined;
      }
      await lifecycle.send('ServiceWorker.stopWorker', {
        versionId: restart.versionId,
      });
      await expect.poll(() => restart.stopped).toBe(true);
      await page.reload();
      await expect
        .poll(
          () =>
            context.serviceWorkers().filter((w) => w.url().includes(id)).length,
        )
        .toBe(1);
      worker = context.serviceWorkers().find((w) => w.url().includes(id));
      await lifecycle.detach();
      await cdp.detach();
      assert.equal(JSON.stringify((await metadata()).aiState), saved);
      assert.deepEqual(
        await worker.evaluate(
          async () =>
            (await chrome.storage.session.get('sidekick.memberships.v2'))[
              'sidekick.memberships.v2'
            ].tabs,
        ),
        membershipsBeforeRestart,
      );
      assert.deepEqual(
        await worker.evaluate(async () =>
          (await chrome.tabGroups.query({})).map((g) => ({
            id: g.id,
            title: g.title,
          })),
        ),
        groupsBeforeRestart,
      );
      for (const feature of Object.values(report.features))
        if (feature.persisted) feature.restart = true;
      await ui
        .getByRole('button', { name: 'AI suggestions', exact: true })
        .click();
      const postRestartGoal =
        'A goal with no relevant tabs: underwater archaeology';
      await expect(
        ui.getByRole('heading', { name: 'Focus relevance', exact: true }),
      ).toHaveCount(0);
      const managedAfterRestart = await worker.evaluate(
        async (windowId) => chrome.tabs.query({ windowId }),
        baseWindow,
      );
      assert(
        managedAfterRestart.length <= 20 &&
          !budget.halted &&
          budget.used < budget.maximum,
      );
      // Exactly one batch, one UI operation and no retries. Reserve before sending,
      // because DevTools Fetch interception can be lost across worker suspension.
      budget.used++;
      report.requestsThisRun++;
      report.postRestartReservedRequests = 1;
      writeFileSync(budgetPath, JSON.stringify(budget));
      await ui.getByLabel('Workspace focus goal').fill(postRestartGoal);
      await ui
        .getByRole('button', { name: 'Evaluate focus', exact: true })
        .click();
      await expect(
        ui.getByRole('heading', { name: 'Focus relevance', exact: true }),
      ).toBeVisible({ timeout: 45000 });
      await ui
        .getByRole('button', { name: 'Exit Focus / Show All', exact: true })
        .click();
      await expect
        .poll(
          async () => (await metadata()).aiState.focusPreferences[inbox].goal,
        )
        .toBe(postRestartGoal);
      report.postRestartValidatedResponse = true;
      report.postRestartUsageUnavailable = true;
      const backup = await command({ type: 'backup.export' });
      assert(typeof backup.backup === 'string' && !backup.backup.includes(key));
      report.noCredentialInBackup = true;
      stage = 'disconnect';
      const snapshot = await page.evaluate(
        () =>
          new Promise((resolve) => {
            const p = chrome.runtime.connect({ name: 'sidekick:sidebar:v1' });
            p.onMessage.addListener((e) => {
              if (e.type === 'snapshot') {
                resolve(JSON.stringify(e));
                p.disconnect();
              }
            });
            void chrome.windows
              .getCurrent()
              .then((w) =>
                p.postMessage({ type: 'subscribe', windowId: w.id }),
              );
          }),
      );
      assert(!snapshot.includes(key));
      await page.screenshot({ path: '.output/live-typesafe-safe.png' });
      await page.goto(`chrome-extension://${id}/options.html`);
      await page
        .getByRole('button', { name: 'Disconnect & Remove Key', exact: true })
        .click();
      await expect(
        page.getByText('Not connected', { exact: true }),
      ).toBeVisible();
      const storage = JSON.stringify(
        await worker.evaluate(() => chrome.storage.local.get(null)),
      );
      assert(!storage.includes(key));
      assert.equal(errors.length, 0);
      await context.setOffline(true);
      await page.goto(`chrome-extension://${id}/dashboard.html`);
      await expect(
        page.locator('.embedded').getByLabel('Workspace', { exact: true }),
      ).not.toHaveValue('');
      await page
        .locator('.embedded')
        .getByRole('button', { name: 'Open command palette (Alt+Shift+K)' })
        .click();
      await expect(
        page.getByRole('combobox', { name: 'Command palette search' }),
      ).toBeFocused();
      report.offline = true;
      await context.setOffline(false);
      report.status = Object.values(report.features).every(
        (f) => f.status === 'PASS',
      )
        ? 'PASS'
        : 'BLOCKED';
      report.noCredentialInSnapshot = true;
      report.disconnectRemovedKey = true;
      report.noOwnedPageErrors = true;
    }
  }
} catch (error) {
  if (page) {
    const message = await page
      .locator('.embedded .error-message')
      .innerText()
      .catch(() => '');
    if (/TypeSafe returned|Jev returned/.test(message))
      report.uiFailure = message.split(key).join('[redacted]').slice(0, 200);
  }
  report.failedCheckLine =
    error instanceof Error
      ? error.stack
          ?.split('\n')
          .find((line) => /live-typesafe\.mjs:\d+:\d+/.test(line))
          ?.match(/live-typesafe\.mjs:\d+:\d+/)?.[0]
      : undefined;
  if (report.status !== 'BLOCKED')
    report.status =
      budget.halted || stage === 'connection' || stage === 'setup'
        ? 'BLOCKED'
        : 'FAIL';
  report.stage = stage;
  report.reason ??=
    stage === 'setup'
      ? 'Local credential or resume preflight rejected; no request sent.'
      : 'Check failed at the named stage; no raw error or credential was recorded.';
} finally {
  await context?.close().catch(() => {});
  if (
    profile &&
    dirname(resolve(profile)).toLowerCase() ===
      resolve(tmpdir()).toLowerCase() &&
    basename(profile).startsWith('sidekick-typesafe-live-')
  )
    await rm(profile, { recursive: true, force: true });
  await writeFile(budgetPath, JSON.stringify(budget, null, 2));
  report.totalRequestsInBudget = budget.used;
  report.historicalVercelRequests = budget.historicalVercelUsed;
  report.directRequestsInCampaign = budget.used - budget.historicalVercelUsed;
  report.stopStatus = budget.stopStatus ?? null;
  await writeFile(reportPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
  if (report.status !== 'PASS') process.exitCode = 1;
}
