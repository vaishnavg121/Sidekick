export interface TabItem {
  id: number;
  windowId: number;
  index: number;
  title: string;
  url: string;
  favicon?: string;
  active: boolean;
  loading: boolean;
  restricted: boolean;
}
export function isRestrictedUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return (
      !['http:', 'https:'].includes(u.protocol) ||
      u.hostname === 'chromewebstore.google.com' ||
      (u.hostname === 'chrome.google.com' && u.pathname.startsWith('/webstore'))
    );
  } catch {
    return true;
  }
}
export function toTabItem(tab: chrome.tabs.Tab): TabItem | undefined {
  if (tab.id === undefined || tab.id < 0) return;
  const url = tab.pendingUrl || tab.url || '';
  return {
    id: tab.id,
    windowId: tab.windowId,
    index: tab.index,
    title: tab.title || 'Untitled tab',
    url,
    favicon: tab.favIconUrl,
    active: tab.active,
    loading: tab.status === 'loading',
    restricted: isRestrictedUrl(url),
  };
}
export type TabAction =
  | { type: 'snapshot'; tabs: TabItem[] }
  | { type: 'remove'; id: number }
  | { type: 'upsert'; tab: TabItem }
  | { type: 'activate'; id: number };
export function tabReducer(state: TabItem[], action: TabAction): TabItem[] {
  switch (action.type) {
    case 'snapshot':
      return [...new Map(action.tabs.map((t) => [t.id, t])).values()].sort(
        (a, b) => a.index - b.index,
      );
    case 'remove':
      return state.filter((t) => t.id !== action.id);
    case 'upsert':
      return [...state.filter((t) => t.id !== action.tab.id), action.tab].sort(
        (a, b) => a.index - b.index,
      );
    case 'activate':
      return state.map((t) => ({ ...t, active: t.id === action.id }));
  }
}
export function searchTabs(tabs: TabItem[], query: string): TabItem[] {
  const q = query.trim().toLocaleLowerCase();
  return tabs.filter((t) =>
    `${t.title} ${t.url}`.toLocaleLowerCase().includes(q),
  );
}
