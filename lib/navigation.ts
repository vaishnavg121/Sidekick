// All navigation paths share this boundary, including bookmark/shortcut opens.
const INTERNAL = new Set([
  'newtab',
  'settings',
  'history',
  'bookmarks',
  'extensions',
  'downloads',
]);
function hasControls(value: string) {
  return Array.from(value).some(
    (char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127,
  );
}
export function safeUrl(input: string): string {
  if (hasControls(input) || input.length > 4096)
    throw new Error('Enter a valid web address.');
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new Error('Enter a valid web address.');
  }
  if (
    (url.protocol !== 'https:' &&
      url.protocol !== 'http:' &&
      !(url.protocol === 'chrome:' && INTERNAL.has(url.hostname))) ||
    url.username ||
    url.password
  )
    throw new Error(
      'Only web addresses and supported Chrome pages can be opened.',
    );
  return url.href;
}
export function resolveAddress(input: string): string {
  const value = input.trim();
  if (!value || value.length > 4096 || hasControls(input))
    throw new Error('Enter a web address or search.');
  if (/^(?:https?|chrome):/i.test(value)) return safeUrl(value);
  // Check host:port before scheme detection; localhost:3000 is an address.
  if (
    /^(?:localhost|\[[\da-f:]+\]|(?:[\p{L}\p{N}-]+\.)+[\p{L}\p{N}-]+)(?::\d{1,5})?(?:[/?#][^\s]*)?$/iu.test(
      value,
    )
  )
    return safeUrl(`https://${value}`);
  if (/^[a-z][a-z\d+.-]*:/i.test(value))
    throw new Error('That address scheme is not supported.');
  return `https://www.google.com/search?q=${encodeURIComponent(value)}`;
}
export class NavigationService {
  private async active(windowId: number) {
    const [tab] = await chrome.tabs.query({ windowId, active: true });
    if (tab?.id === undefined) throw new Error('No active tab in this window.');
    return tab;
  }
  async navigate(windowId: number, input: string, newTab = false) {
    const url = resolveAddress(input);
    if (newTab) await chrome.tabs.create({ windowId, url });
    else await chrome.tabs.update((await this.active(windowId)).id!, { url });
  }
  async action(
    windowId: number,
    action: 'back' | 'forward' | 'reload' | 'stop' | 'close',
  ) {
    const id = (await this.active(windowId)).id!;
    switch (action) {
      case 'back':
        await chrome.tabs.goBack(id);
        break;
      case 'forward':
        await chrome.tabs.goForward(id);
        break;
      case 'reload':
        await chrome.tabs.reload(id);
        break;
      case 'close':
        await chrome.tabs.remove(id);
        break;
      case 'stop': {
        try {
          const result: unknown = await chrome.tabs.sendMessage(id, {
            channel: 'sidekick:page',
            action: 'stop',
          });
          if (
            !result ||
            typeof result !== 'object' ||
            !('ok' in result) ||
            result.ok !== true
          )
            throw new Error('No receiver');
        } catch {
          throw new Error(
            'Stop is unavailable on this page. Use Chrome’s toolbar or Escape.',
          );
        }
      }
    }
  }
}
