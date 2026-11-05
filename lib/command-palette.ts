import type { TabItem } from './tabs';
import type { Workspace, WorkspaceFavorite, PinnedEntry } from './models';
import type { BookmarkItem } from './bookmarks';

export type CommandPaletteCategory =
  'tabs' | 'workspaces' | 'favorites' | 'pinned' | 'bookmarks' | 'actions';

export interface CommandPaletteResult {
  id: string;
  category: CommandPaletteCategory;
  title: string;
  description: string;
  icon?: string;
  favicon?: string;
  action: CommandPaletteAction;
  score: number;
  group?: string;
}

export interface CommandPaletteAction {
  type:
    | 'activate-tab'
    | 'switch-workspace'
    | 'open-url'
    | 'open-favorite'
    | 'open-pinned'
    | 'open-bookmark'
    | 'new-tab'
    | 'close-tab'
    | 'reload'
    | 'toggle-sidebar'
    | 'toggle-immersive'
    | 'pin-tab'
    | 'open-settings'
    | 'open-bookmarks'
    | 'organize-with-jev'
    | 'search-web';
  payload: unknown;
}

export interface SearchIndex {
  tabs: TabItem[];
  workspaces: Workspace[];
  favorites: WorkspaceFavorite[];
  pinned: PinnedEntry[];
  bookmarks: BookmarkItem[];
  activeWorkspaceId: string;
  activeTabId?: number;
}

function normalize(text: string): string {
  return text.toLowerCase().trim();
}

function scoreMatch(query: string, title: string, url?: string): number {
  const q = normalize(query);
  const t = normalize(title);
  const u = url ? normalize(url) : '';

  if (!q) return 0;

  // Exact match
  if (t === q) return 1000;
  if (u === q) return 950;

  // Prefix match
  if (t.startsWith(q)) return 800;
  if (u.startsWith(q)) return 750;

  // Word boundary match in title
  const titleWords = t.split(/[\s\-._/]+/);
  if (titleWords.some((w) => w.startsWith(q))) {
    return 600;
  }

  // Substring match in title
  if (t.includes(q)) return 400;
  if (u.includes(q)) return 300;

  // Fuzzy match (simple character sequence)
  let ti = 0;
  let matched = 0;
  for (const ch of q) {
    const idx = t.indexOf(ch, ti);
    if (idx === -1) break;
    ti = idx + 1;
    matched++;
  }
  if (matched === q.length) {
    return 100;
  }

  return 0;
}

function isValidUrl(text: string): boolean {
  try {
    const url = new URL(text);
    return ['http:', 'https:'].includes(url.protocol);
  } catch {
    return false;
  }
}

function isRecognizableDomain(text: string): boolean {
  // Check if it looks like a domain (e.g., "github.com", "google.com")
  const domainRegex = /^[a-z0-9-]+\.[a-z]{2,}(?:\/.*)?$/i;
  if (!domainRegex.test(text)) return false;
  // Avoid things that look like search queries with spaces
  return !text.includes(' ');
}

function buildActions(): CommandPaletteResult[] {
  const actions: CommandPaletteResult[] = [
    {
      id: 'action:new-tab',
      category: 'actions',
      title: 'New Tab',
      description: 'Open a new tab',
      icon: 'plus',
      action: { type: 'new-tab', payload: {} },
      score: 500,
      group: 'Actions',
    },
    {
      id: 'action:close-tab',
      category: 'actions',
      title: 'Close Current Tab',
      description: 'Close the active tab',
      icon: 'close',
      action: { type: 'close-tab', payload: {} },
      score: 480,
      group: 'Actions',
    },
    {
      id: 'action:reload',
      category: 'actions',
      title: 'Reload Page',
      description: 'Reload the current page',
      icon: 'reload',
      action: { type: 'reload', payload: {} },
      score: 460,
      group: 'Actions',
    },
    {
      id: 'action:toggle-sidebar',
      category: 'actions',
      title: 'Toggle Sidebar',
      description: 'Show or hide the Sidekick sidebar',
      icon: 'collapse',
      action: { type: 'toggle-sidebar', payload: {} },
      score: 440,
      group: 'Actions',
    },
    {
      id: 'action:toggle-immersive',
      category: 'actions',
      title: 'Toggle Immersive Mode',
      description: 'Enter or exit immersive fullscreen mode',
      icon: 'fullscreen',
      action: { type: 'toggle-immersive', payload: {} },
      score: 420,
      group: 'Actions',
    },
    {
      id: 'action:pin-tab',
      category: 'actions',
      title: 'Pin Current Tab',
      description: 'Pin the active tab to the current workspace',
      icon: 'pin',
      action: { type: 'pin-tab', payload: {} },
      score: 400,
      group: 'Actions',
    },
    {
      id: 'action:open-settings',
      category: 'actions',
      title: 'Open Settings',
      description: 'Open Sidekick settings',
      icon: 'settings',
      action: { type: 'open-settings', payload: {} },
      score: 380,
      group: 'Actions',
    },
    {
      id: 'action:open-bookmarks',
      category: 'actions',
      title: 'Open Bookmarks',
      description: 'Browse Chrome bookmarks',
      icon: 'folder',
      action: { type: 'open-bookmarks', payload: {} },
      score: 360,
      group: 'Actions',
    },
    {
      id: 'action:organize-jev',
      category: 'actions',
      title: 'Organize with Jev',
      description: 'Use AI to classify, route, and group tabs',
      icon: 'sparkles',
      action: { type: 'organize-with-jev', payload: {} },
      score: 340,
      group: 'Actions',
    },
  ];
  return actions;
}

function buildTabResults(
  index: SearchIndex,
  query: string,
): CommandPaletteResult[] {
  const results: CommandPaletteResult[] = [];
  const q = normalize(query);

  for (const tab of index.tabs) {
    const score = scoreMatch(query, tab.title, tab.url);
    if (score === 0 && q) continue;

    // Boost active tab
    const activeBoost = tab.active ? 50 : 0;
    // Boost current workspace tabs
    const workspaceBoost = 25;

    results.push({
      id: `tab:${tab.id}`,
      category: 'tabs',
      title: tab.title,
      description: `${tab.url}${tab.active ? ' (active)' : ''}`,
      favicon:
        tab.favicon && /^(https?:|data:image\/)/.test(tab.favicon)
          ? tab.favicon
          : undefined,
      action: { type: 'activate-tab', payload: { tabId: tab.id } },
      score: score + activeBoost + workspaceBoost,
      group: 'Open Tabs',
    });
  }

  return results;
}

function buildWorkspaceResults(
  index: SearchIndex,
  query: string,
): CommandPaletteResult[] {
  const results: CommandPaletteResult[] = [];

  for (const ws of index.workspaces) {
    const score = scoreMatch(query, ws.name);
    if (score === 0 && normalize(query)) continue;

    const isActive = ws.id === index.activeWorkspaceId;
    const activeBoost = isActive ? 100 : 0;

    results.push({
      id: `workspace:${ws.id}`,
      category: 'workspaces',
      title: ws.name,
      description: isActive ? 'Current workspace' : 'Switch to this workspace',
      icon: ws.icon,
      action: { type: 'switch-workspace', payload: { workspaceId: ws.id } },
      score: score + activeBoost + 200, // Workspaces get a base boost
      group: 'Workspaces',
    });
  }

  return results;
}

function buildFavoriteResults(
  index: SearchIndex,
  query: string,
): CommandPaletteResult[] {
  const results: CommandPaletteResult[] = [];
  const activeFavorites = index.favorites.filter(
    (f) => f.workspaceId === index.activeWorkspaceId,
  );

  for (const fav of activeFavorites) {
    const score = scoreMatch(query, fav.title, fav.url);
    if (score === 0 && normalize(query)) continue;

    results.push({
      id: `favorite:${fav.id}`,
      category: 'favorites',
      title: fav.title,
      description: fav.url,
      favicon:
        fav.favicon && /^(https?:|data:image\/)/.test(fav.favicon)
          ? fav.favicon
          : undefined,
      action: { type: 'open-favorite', payload: { id: fav.id } },
      score: score + 150,
      group: 'Favorites',
    });
  }

  return results;
}

function buildPinnedResults(
  index: SearchIndex,
  query: string,
): CommandPaletteResult[] {
  const results: CommandPaletteResult[] = [];
  const activePinned = index.pinned.filter(
    (p) => p.workspaceId === index.activeWorkspaceId,
  );

  for (const pin of activePinned) {
    const score = scoreMatch(query, pin.title, pin.url);
    if (score === 0 && normalize(query)) continue;

    results.push({
      id: `pinned:${pin.id}`,
      category: 'pinned',
      title: pin.title,
      description: pin.url,
      favicon:
        pin.favicon && /^(https?:|data:image\/)/.test(pin.favicon)
          ? pin.favicon
          : undefined,
      action: { type: 'open-pinned', payload: { id: pin.id } },
      score: score + 100,
      group: 'Pinned',
    });
  }

  return results;
}

function flattenBookmarks(bookmarks: BookmarkItem[]): BookmarkItem[] {
  const result: BookmarkItem[] = [];
  for (const b of bookmarks) {
    if (b.url) result.push(b);
    if (b.children) result.push(...flattenBookmarks(b.children));
  }
  return result;
}

function buildBookmarkResults(
  index: SearchIndex,
  query: string,
): CommandPaletteResult[] {
  const results: CommandPaletteResult[] = [];
  const flat = flattenBookmarks(index.bookmarks);

  for (const bm of flat) {
    if (!bm.url) continue;
    const score = scoreMatch(query, bm.title, bm.url);
    if (score === 0 && normalize(query)) continue;

    results.push({
      id: `bookmark:${bm.id}`,
      category: 'bookmarks',
      title: bm.title,
      description: bm.url,
      action: { type: 'open-bookmark', payload: { url: bm.url } },
      score: score + 50,
      group: 'Bookmarks',
    });
  }

  return results;
}

function buildActionResults(
  query: string,
  hasActiveTab: boolean,
  isImmersive: boolean,
): CommandPaletteResult[] {
  const actions = buildActions();
  const q = normalize(query);
  const results: CommandPaletteResult[] = [];

  for (const action of actions) {
    const score = scoreMatch(query, action.title);
    if (score === 0 && q) continue;

    // Filter out actions that don't apply
    if (action.id === 'action:close-tab' && !hasActiveTab) continue;
    if (action.id === 'action:toggle-immersive') {
      // Always show but update description based on state
      const desc = isImmersive
        ? 'Exit immersive fullscreen mode'
        : 'Enter immersive fullscreen mode';
      results.push({
        ...action,
        description: desc,
        score: score + 300,
      });
      continue;
    }

    results.push({ ...action, score: score + 300 });
  }

  return results;
}

function buildNavigationResult(query: string): CommandPaletteResult | null {
  const trimmed = query.trim();
  if (!trimmed) return null;

  // Check if it's a valid URL
  if (isValidUrl(trimmed)) {
    return {
      id: 'navigate:url',
      category: 'actions',
      title: `Go to ${trimmed}`,
      description: 'Open this URL',
      icon: 'arrow',
      action: { type: 'open-url', payload: { url: trimmed, newTab: false } },
      score: 2000, // High priority for explicit URLs
      group: 'Navigate',
    };
  }

  // Check if it's a recognizable domain
  if (isRecognizableDomain(trimmed)) {
    const url = `https://${trimmed}`;
    return {
      id: 'navigate:domain',
      category: 'actions',
      title: `Go to ${trimmed}`,
      description: `Open https://${trimmed}`,
      icon: 'arrow',
      action: { type: 'open-url', payload: { url, newTab: false } },
      score: 1800,
      group: 'Navigate',
    };
  }

  // Otherwise it's a search query
  return {
    id: 'navigate:search',
    category: 'actions',
    title: `Search for "${trimmed}"`,
    description: 'Search using Google',
    icon: 'search',
    action: { type: 'search-web', payload: { query: trimmed } },
    score: 75,
    group: 'Navigate',
  };
}

export function searchCommandPalette(
  index: SearchIndex,
  query: string,
  options?: {
    isImmersive?: boolean;
    hasActiveTab?: boolean;
  },
): CommandPaletteResult[] {
  const allResults: CommandPaletteResult[] = [];

  // Navigation result (highest priority for URL-like queries)
  const navResult = buildNavigationResult(query);
  if (navResult) allResults.push(navResult);

  // Search across all categories
  allResults.push(...buildTabResults(index, query));
  allResults.push(...buildWorkspaceResults(index, query));
  allResults.push(...buildFavoriteResults(index, query));
  allResults.push(...buildPinnedResults(index, query));
  allResults.push(...buildBookmarkResults(index, query));
  allResults.push(
    ...buildActionResults(
      query,
      options?.hasActiveTab ?? true,
      options?.isImmersive ?? false,
    ),
  );

  // Sort by score descending, then by category priority
  const categoryPriority: Record<CommandPaletteCategory, number> = {
    actions: 6,
    tabs: 5,
    workspaces: 4,
    favorites: 3,
    pinned: 2,
    bookmarks: 1,
  };

  allResults.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return (
      (categoryPriority[b.category] ?? 0) - (categoryPriority[a.category] ?? 0)
    );
  });

  // Deduplicate by ID (keep highest scoring)
  const tabUrls = new Map(index.tabs.map((t) => [t.id, t.url]));
  const canonical = (url: string) => {
    try {
      return new URL(url).href;
    } catch {
      return url;
    }
  };
  const destinations = new Set(
    allResults
      .filter((r) => r.category === 'tabs')
      .map((r) =>
        canonical(
          tabUrls.get((r.action.payload as { tabId: number }).tabId) ?? '',
        ),
      ),
  );
  const seen = new Set<string>();
  const deduped = allResults.filter((r) => {
    if (['favorites', 'pinned', 'bookmarks'].includes(r.category)) {
      const destination = canonical(r.description);
      if (destinations.has(destination)) return false;
      destinations.add(destination);
    }
    if (seen.has(r.id)) return false;
    seen.add(r.id);
    return true;
  });

  // Limit results
  return deduped.slice(0, 20);
}

export function groupResults(
  results: CommandPaletteResult[],
): Map<string, CommandPaletteResult[]> {
  const groups = new Map<string, CommandPaletteResult[]>();
  for (const r of results) {
    const group = r.group ?? r.category;
    const existing = groups.get(group) ?? [];
    existing.push(r);
    groups.set(group, existing);
  }
  return groups;
}
