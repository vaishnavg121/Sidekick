import type { BrowserContext } from '@playwright/test';

// Chrome's real side-panel target is intentionally absent from context.pages().
// Attach through public CDP rather than substituting an ordinary extension tab.
export async function attachNativePanel(context: BrowserContext, url: string) {
  const cdp = await context.browser()!.newBrowserCDPSession();
  const { targetInfos } = await cdp.send('Target.getTargets');
  const target = targetInfos.find(
    (info) => info.type === 'page' && info.url === url,
  );
  if (!target) throw new Error('Native panel target was not created');
  const { sessionId } = await cdp.send('Target.attachToTarget', {
    targetId: target.targetId,
    flatten: false,
  });
  let sequence = 0;
  const pending = new Map<
    number,
    { resolve(value: unknown): void; reject(error: Error): void }
  >();
  cdp.on('Target.receivedMessageFromTarget', (event) => {
    if (event.sessionId !== sessionId) return;
    const message = JSON.parse(event.message) as {
      id?: number;
      result?: unknown;
      error?: { message: string };
    };
    if (message.id === undefined) return;
    const request = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) request?.reject(new Error(message.error.message));
    else request?.resolve(message.result);
  });
  const send = (
    method: string,
    params: Record<string, unknown> = {},
  ): Promise<unknown> => {
    const id = ++sequence;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`Native panel CDP timeout: ${method}`));
      }, 5000);
      pending.set(id, {
        resolve: (value) => {
          clearTimeout(timeout);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timeout);
          reject(error);
        },
      });
      void cdp
        .send('Target.sendMessageToTarget', {
          sessionId,
          message: JSON.stringify({ id, method, params }),
        })
        .catch((error: Error) => {
          pending.delete(id);
          clearTimeout(timeout);
          reject(error);
        });
    });
  };
  return {
    async evaluate<T = unknown>(expression: string): Promise<T> {
      const response = (await send('Runtime.evaluate', {
        expression,
        returnByValue: true,
        awaitPromise: true,
        userGesture: true,
      })) as {
        result: { value: T };
        exceptionDetails?: {
          text: string;
          exception?: { description?: string };
        };
      };
      if (response.exceptionDetails)
        throw new Error(
          response.exceptionDetails.exception?.description ??
            response.exceptionDetails.text,
        );
      return response.result.value;
    },
    send,
    dispose: () => cdp.detach(),
  };
}
