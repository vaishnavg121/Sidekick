import { describe, expect, it } from 'vitest';
import { searchCommandPalette, type SearchIndex } from '../lib/command-palette';
import { createMetadata } from '../lib/models';
import { toTabItem } from '../lib/tabs';
const metadata = createMetadata();
const index: SearchIndex = {
  tabs: ['GitHub', 'Guide to TypeScript', 'Get help'].map((title, i) =>
    toTabItem({
      id: i + 1,
      windowId: 1,
      index: i,
      title,
      url: 'https://example.com/' + i,
      active: false,
    } as chrome.tabs.Tab)!,
  ),
  workspaces: metadata.workspaces,
  favorites: [],
  pinned: [],
  bookmarks: [],
  activeWorkspaceId: metadata.activeWorkspaceId,
};
describe('palette search and action contracts', () => {
  it('ranks exact, prefix, substring, then fuzzy matches', () => {
    const result = searchCommandPalette(index, 'GitHub');
    expect(result[0]!.title).toBe('GitHub');
    expect(searchCommandPalette(index, 'Guide')[0]!.title).toBe(
      'Guide to TypeScript',
    );
    expect(searchCommandPalette(index, 'TypeScript')[0]!.title).toBe(
      'Guide to TypeScript',
    );
    expect(
      searchCommandPalette(index, 'gts').some(
        (r) => r.title === 'Guide to TypeScript',
      ),
    ).toBe(true);
  });
  it('does not mistake a partial fuzzy match for a full sequence', () => {
    expect(
      searchCommandPalette(index, 'gz').some((r) => r.category === 'tabs'),
    ).toBe(false);
  });
  it('makes actions executable with Enter before a generic search fallback', () => {
    expect(searchCommandPalette(index, 'New Tab')[0]!.action.type).toBe(
      'new-tab',
    );
  });
  it('keeps explicit URLs first and rejects script navigation', () => {
    expect(
      searchCommandPalette(index, 'https://example.com/')[0]!.action.type,
    ).toBe('open-url');
    expect(
      searchCommandPalette(index, 'javascript:alert(1)').some(
        (r) => r.action.type === 'open-url',
      ),
    ).toBe(false);
  });
  it('keeps distinct live sessions while suppressing shortcuts to matching live destinations', () => {
    const tab = index.tabs[0]!;
    const favorite = {
      id: 'f',
      workspaceId: index.activeWorkspaceId,
      title: tab.title,
      url: tab.url,
      order: 0,
    };
    const result = searchCommandPalette(
      { ...index, tabs: [tab, { ...tab, id: 99 }], favorites: [favorite] },
      tab.title,
    );
    expect(result.filter((r) => r.category === 'tabs')).toHaveLength(2);
    expect(result.some((r) => r.category === 'favorites')).toBe(false);
  });
  it('limits saved resources to the selected workspace and deduplicates result IDs', () => {
    const favorite = {
      id: 'a',
      workspaceId: 'foreign',
      title: 'Secret',
      url: 'https://secret.example/',
      order: 0,
    };
    expect(
      searchCommandPalette({ ...index, favorites: [favorite] }, 'Secret').some(
        (r) => r.category === 'favorites',
      ),
    ).toBe(false);
    const result = searchCommandPalette(
      { ...index, tabs: [...index.tabs, ...index.tabs] },
      '',
    );
    expect(new Set(result.map((r) => r.id)).size).toBe(result.length);
  });
  it('searches a 250-tab collection within an interactive latency budget', () => {
    const tabs = Array.from({ length: 250 }, (_, i) => ({
      ...index.tabs[0]!,
      id: i,
      title: 'Research document ' + i,
    }));
    const start = performance.now();
    for (let n = 0; n < 100; n++)
      searchCommandPalette({ ...index, tabs }, 'doc' + n);
    expect(performance.now() - start).toBeLessThan(1000);
  });
});
