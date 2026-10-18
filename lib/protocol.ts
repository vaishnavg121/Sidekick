import type { Metadata, SidebarPreferences } from './models';
import type { TabItem } from './tabs';
import type { WindowUiState } from './window-state';
import type { BookmarkItem } from './bookmarks';
export const PORT_NAME = 'sidekick:sidebar:v1';
export type Command =
  | { type: 'tab.activate' | 'tab.close'; tabId: number }
  | { type: 'tab.create' }
  | { type: 'immersive.enter' | 'immersive.exit' }
  | { type: 'navigation.go'; input: string; newTab?: boolean }
  | {
      type: 'navigation.action';
      action: 'back' | 'forward' | 'reload' | 'stop' | 'close';
    }
  | { type: 'bookmarks.read'; query: string }
  | {
      type: 'favorite.save';
      id?: string;
      title: string;
      url: string;
      workspaceId: string;
    }
  | { type: 'favorite.remove'; id: string }
  | { type: 'panel.pin' }
  | { type: 'sidebar.mode'; mode: 'hidden' | 'hover' }
  | { type: 'search.update'; query: string }
  | { type: 'preferences.update'; patch: Partial<SidebarPreferences> }
  | { type: 'workspace.select'; id: string };
export type Request = {
  channel: 'sidekick';
  windowId?: number;
  command: Command;
};
export type Reply =
  { ok: true; bookmarks?: BookmarkItem[] } | { ok: false; error: string };
export type ServerEvent =
  | { type: 'focus'; address: boolean }
  | {
      type: 'snapshot';
      tabs: TabItem[];
      metadata: Metadata;
      windowId: number;
      windowState: WindowUiState;
    }
  | { type: 'error'; error: string };
export function isCommand(value: unknown): value is Command {
  if (!value || typeof value !== 'object') return false;
  const c = value as Record<string, unknown>;
  switch (c.type) {
    case 'tab.activate':
    case 'tab.close':
      return Number.isInteger(c.tabId) && Number(c.tabId) >= 0;
    case 'tab.create':
    case 'panel.pin':
    case 'immersive.enter':
    case 'immersive.exit':
      return true;
    case 'navigation.go':
      return (
        typeof c.input === 'string' &&
        c.input.length <= 4096 &&
        (c.newTab === undefined || typeof c.newTab === 'boolean')
      );
    case 'navigation.action':
      return ['back', 'forward', 'reload', 'stop', 'close'].includes(
        String(c.action),
      );
    case 'bookmarks.read':
      return typeof c.query === 'string' && c.query.length <= 2000;
    case 'favorite.save':
      return (
        typeof c.title === 'string' &&
        c.title.trim().length > 0 &&
        c.title.length <= 200 &&
        typeof c.url === 'string' &&
        c.url.length <= 4096 &&
        typeof c.workspaceId === 'string' &&
        c.workspaceId.length < 200 &&
        (c.id === undefined || (typeof c.id === 'string' && c.id.length < 200))
      );
    case 'favorite.remove':
      return typeof c.id === 'string' && c.id.length < 200;
    case 'sidebar.mode':
      return c.mode === 'hidden' || c.mode === 'hover';
    case 'search.update':
      return typeof c.query === 'string' && c.query.length <= 2000;
    case 'workspace.select':
      return typeof c.id === 'string' && c.id.length < 200;
    case 'preferences.update': {
      if (!c.patch || typeof c.patch !== 'object' || Array.isArray(c.patch))
        return false;
      return Object.entries(c.patch).every(([key, v]) =>
        key === 'mode'
          ? ['hidden', 'hover', 'pinned'].includes(String(v))
          : ['width', 'openDelay', 'closeDelay'].includes(key) &&
            typeof v === 'number' &&
            Number.isFinite(v),
      );
    }
    default:
      return false;
  }
}
