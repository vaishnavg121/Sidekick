import { describe, expect, it } from 'vitest';
import {
  isRestrictedUrl,
  searchTabs,
  tabReducer,
  toTabItem,
  type TabItem,
} from '../lib/tabs';
const tab = (id: number, index = id): TabItem => ({
  id,
  index,
  windowId: 1,
  title: `Tab ${id}`,
  url: `https://site${id}.test`,
  active: false,
  loading: false,
  restricted: false,
});
describe('tab state', () => {
  it('orders and deduplicates snapshots without mutating the input', () => {
    const original = [tab(2), tab(1), tab(2)];
    expect(
      tabReducer([], { type: 'snapshot', tabs: original }).map((t) => t.id),
    ).toEqual([1, 2]);
    expect(original).toHaveLength(3);
  });
  it('handles navigation, activation, moves and close', () => {
    let tabs = [tab(1), tab(2)];
    tabs = tabReducer(tabs, {
      type: 'upsert',
      tab: { ...tab(2, 0), title: 'New page', loading: true },
    });
    tabs = tabReducer(tabs, { type: 'activate', id: 2 });
    expect(tabs[0]).toMatchObject({
      id: 2,
      title: 'New page',
      active: true,
      loading: true,
    });
    expect(tabs[1]?.active).toBe(false);
    expect(tabReducer(tabs, { type: 'remove', id: 2 })).toEqual([tab(1)]);
  });
  it('searches titles and URLs case insensitively', () => {
    expect(searchTabs([tab(1), tab(2)], ' TAB 1 ')).toEqual([tab(1)]);
    expect(searchTabs([tab(1)], 'SITE1')).toHaveLength(1);
    expect(searchTabs([tab(1)], 'missing')).toEqual([]);
  });
  it('handles inaccessible metadata and restricted pages', () => {
    expect(toTabItem({ id: -1 } as chrome.tabs.Tab)).toBeUndefined();
    expect(
      toTabItem({
        id: 1,
        windowId: 1,
        index: 0,
        active: true,
        status: 'loading',
      } as chrome.tabs.Tab),
    ).toMatchObject({ title: 'Untitled tab', restricted: true, loading: true });
    expect(isRestrictedUrl('chrome://extensions')).toBe(true);
    expect(
      isRestrictedUrl('https://chromewebstore.google.com/detail/foo'),
    ).toBe(true);
    expect(isRestrictedUrl('https://example.com')).toBe(false);
  });
});
