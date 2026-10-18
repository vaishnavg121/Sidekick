import type { Metadata, SidebarPreferences } from './models';
import type { TabItem } from './tabs';
export const PORT_NAME = 'sidekick:sidebar:v1';
export type Command =
  | { type: 'tab.activate' | 'tab.close'; tabId: number }
  | { type: 'tab.create' }
  | { type: 'preferences.update'; patch: Partial<SidebarPreferences> }
  | { type: 'workspace.select'; id: string };
export type Request = {
  channel: 'sidekick';
  windowId?: number;
  command: Command;
};
export type Reply = { ok: true } | { ok: false; error: string };
export type ServerEvent =
  | { type: 'snapshot'; tabs: TabItem[]; metadata: Metadata; windowId: number }
  | { type: 'error'; error: string };
export function isCommand(value: unknown): value is Command {
  if (!value || typeof value !== 'object') return false;
  const c = value as Record<string, unknown>;
  switch (c.type) {
    case 'tab.activate':
    case 'tab.close':
      return Number.isInteger(c.tabId) && Number(c.tabId) >= 0;
    case 'tab.create':
      return true;
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
