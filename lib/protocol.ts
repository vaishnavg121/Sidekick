import type { Metadata, SidebarPreferences } from './models';
import type { TabItem } from './tabs';
import type { WindowUiState } from './window-state';
export const PORT_NAME = 'sidekick:sidebar:v1';
export type Command =
  | { type: 'tab.activate' | 'tab.close'; tabId: number }
  | { type: 'tab.create' }
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
export type Reply = { ok: true } | { ok: false; error: string };
export type ServerEvent =
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
      return true;
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
