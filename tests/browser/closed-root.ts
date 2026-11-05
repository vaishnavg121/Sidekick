import {
  expect,
  selectors,
  type BrowserContext,
  type Page,
} from '@playwright/test';
/** Only disposable fixture pages get this DevTools handle; production stays closed. */
export async function inspectClosedRoot(context: BrowserContext, page: Page) {
  await expect(page.locator('sidekick-sidebar')).toBeAttached();
  expect(
    await page.locator('sidekick-sidebar').evaluate((el) => el.shadowRoot),
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
  const find = (n: Node): Node | undefined =>
    n.nodeName === 'SIDEKICK-SIDEBAR'
      ? n
      : [...(n.children ?? []), ...(n.shadowRoots ?? [])]
          .map(find)
          .find(Boolean);
  const shadow = find(root)?.shadowRoots?.[0];
  if (!shadow) throw Error('No isolated shadow root');
  const { object } = await cdp.send('DOM.resolveNode', {
    nodeId: shadow.nodeId,
  });
  await cdp.send('Runtime.callFunctionOn', {
    objectId: object.objectId,
    functionDeclaration: 'function() { window.__sidekickPolishRoot=this; }',
  });
  await cdp.detach();
  return page.locator('polish=.sidekick-root');
}

export async function registerClosedRootSelector() {
  await selectors.register('polish', () => ({
    query(_root: unknown, selector: string) {
      return (
        (
          window as Window & { __sidekickPolishRoot?: ShadowRoot }
        ).__sidekickPolishRoot?.querySelector(selector) ?? null
      );
    },
    queryAll(_root: unknown, selector: string) {
      return Array.from(
        (
          window as Window & { __sidekickPolishRoot?: ShadowRoot }
        ).__sidekickPolishRoot?.querySelectorAll(selector) ?? [],
      );
    },
  }));
}
