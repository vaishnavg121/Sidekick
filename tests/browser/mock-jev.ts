import type { BrowserContext } from '@playwright/test';
export interface DecisionRequest {
  questions: Record<
    string,
    { type: string; criteria?: Record<string, string> }
  >;
}
export async function mockJev(
  context: BrowserContext,
  extensionId: string,
  answer: (body: DecisionRequest) => Promise<object> | object,
  targetId?: string,
) {
  const cdp = await context.browser()!.newBrowserCDPSession();
  const { targetInfos } = await cdp.send('Target.getTargets');
  const target = targetInfos.find(
    (t) =>
      t.type === 'service_worker' &&
      t.url.includes(extensionId) &&
      (!targetId || t.targetId === targetId),
  )!;
  const { sessionId } = await cdp.send('Target.attachToTarget', {
    targetId: target.targetId,
    flatten: false,
  });
  let id = 2,
    count = 0;
  let enabled!: () => void, enableFailed!: (error: Error) => void;
  const ready = new Promise<void>((resolve, reject) => {
    enabled = resolve;
    enableFailed = reject;
  });
  cdp.on('Target.receivedMessageFromTarget', async (e) => {
    if (e.sessionId !== sessionId) return;
    const event = JSON.parse(e.message);
    if (event.id === 1) {
      if (event.error)
        enableFailed(Error('Mock interception could not be enabled.'));
      else enabled();
      return;
    }
    if (event.method !== 'Fetch.requestPaused') return;
    count++;
    const request = event.params;
    const result = await answer(JSON.parse(request.request.postData));
    await cdp
      .send('Target.sendMessageToTarget', {
        sessionId,
        message: JSON.stringify({
          id: id++,
          method: 'Fetch.fulfillRequest',
          params: {
            requestId: request.requestId,
            responseCode: 200,
            responseHeaders: [
              { name: 'Content-Type', value: 'application/json' },
            ],
            body: Buffer.from(JSON.stringify(result)).toString('base64'),
          },
        }),
      })
      .catch(() => {});
  });
  await cdp.send('Target.sendMessageToTarget', {
    sessionId,
    message: JSON.stringify({
      id: 1,
      method: 'Fetch.enable',
      params: { patterns: [{ urlPattern: 'https://ai-gateway.vercel.sh/*' }] },
    }),
  });
  await ready;
  return { count: () => count, close: () => cdp.detach() };
}
export function validDecisions(body: DecisionRequest) {
  return {
    model: 'typesafe-ai/jev',
    answers: Object.fromEntries(
      Object.entries(body.questions).map(([id, q]) => [
        id,
        q.type === 'boolean'
          ? { type: 'boolean', probability: 1 }
          : q.type === 'score'
            ? { type: 'score', score: 4, probabilities: { 4: 1 } }
            : {
                type: 'choice',
                choice: id.startsWith('topic_')
                  ? 'React development'
                  : id.startsWith('cleanup_')
                    ? 'stale'
                    : Object.keys(q.criteria ?? {})[0],
                probabilities: {
                  [id.startsWith('topic_')
                    ? 'React development'
                    : id.startsWith('cleanup_')
                      ? 'stale'
                      : Object.keys(q.criteria ?? {})[0]!]: 1,
                },
              },
      ]),
    ),
  };
}
