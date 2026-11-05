import type { MetadataRepository } from './repository';
import type { WorkspaceEngine } from './workspaces';
import {
  emptyLibrary,
  snapshotPages,
  storedPage,
  archiveResource,
} from './library';
import { exportBackup, parseBackup, mergeBackup } from './backup';

export type ProductivityCommand =
  | { type: 'session.save'; name: string }
  | { type: 'session.rename'; id: string; name: string }
  | { type: 'session.delete'; id: string }
  | { type: 'session.restore'; id: string; urls?: string[] }
  | { type: 'snooze.create'; tabId: number; dueAt: number; close: boolean }
  | {
      type:
        | 'snooze.cancel'
        | 'snooze.restore'
        | 'archive.restore'
        | 'archive.delete';
      id: string;
    }
  | { type: 'archive.tab'; tabId: number; close: boolean }
  | { type: 'archive.resource'; kind: 'favorite' | 'pinned'; id: string }
  | { type: 'backup.export' }
  | { type: 'backup.preview'; text: string }
  | { type: 'backup.import'; token: string }
  | { type: 'onboarding.dismiss' };
export function isProductivityCommand(
  c: Record<string, unknown>,
): c is Record<string, unknown> & ProductivityCommand {
  const id = (v: unknown) =>
    typeof v === 'string' && v.length > 0 && v.length < 200;
  const name = (v: unknown) =>
    typeof v === 'string' && v.trim().length > 0 && v.length <= 80;
  const tab = () => Number.isInteger(c.tabId) && Number(c.tabId) >= 0;
  switch (c.type) {
    case 'session.save':
      return name(c.name);
    case 'session.rename':
      return id(c.id) && name(c.name);
    case 'session.delete':
    case 'snooze.cancel':
    case 'snooze.restore':
    case 'archive.restore':
    case 'archive.delete':
      return id(c.id);
    case 'session.restore':
      return (
        id(c.id) &&
        (c.urls === undefined ||
          (Array.isArray(c.urls) &&
            c.urls.length <= 1000 &&
            c.urls.every((u) => typeof u === 'string' && u.length <= 4096)))
      );
    case 'snooze.create':
      return (
        tab() &&
        typeof c.dueAt === 'number' &&
        Number.isFinite(c.dueAt) &&
        typeof c.close === 'boolean'
      );
    case 'archive.tab':
      return tab() && typeof c.close === 'boolean';
    case 'archive.resource':
      return id(c.id) && (c.kind === 'favorite' || c.kind === 'pinned');
    case 'backup.preview':
      return typeof c.text === 'string' && c.text.length <= 5_000_000;
    case 'backup.import':
      return id(c.token);
    case 'backup.export':
    case 'onboarding.dismiss':
      return true;
    default:
      return false;
  }
}
export class ProductivityService {
  private queue: Promise<unknown> = Promise.resolve();
  handle(c: ProductivityCommand, windowId: number) {
    const next = this.queue.then(() => this.execute(c, windowId));
    this.queue = next.catch(() => undefined);
    return next;
  }
  constructor(
    private repository: MetadataRepository,
    private workspaces: WorkspaceEngine,
  ) {}
  private async live(windowId: number, tabId: number) {
    const { tabs, workspaceId } = await this.workspaces.snapshot(windowId);
    const tab = tabs.find((t) => t.id === tabId);
    if (!tab) throw Error('Tab is no longer in this workspace and window.');
    return { tab, workspaceId };
  }
  async reconcileAlarms() {
    const l = (await this.repository.get()).library ?? emptyLibrary();
    for (const s of l.snoozed)
      if (!s.ready)
        await chrome.alarms.create('sidekick:snooze:' + s.id, {
          when: Math.max(Date.now() + 1000, s.dueAt!),
        });
  }
  async due(name: string) {
    if (!name.startsWith('sidekick:snooze:')) return;
    const id = name.slice('sidekick:snooze:'.length);
    await this.repository.update((m) => {
      const l = m.library ?? emptyLibrary();
      return {
        ...m,
        library: {
          ...l,
          snoozed: l.snoozed.map((s) =>
            s.id === id ? { ...s, ready: true } : s,
          ),
        },
      };
    });
    const count =
      (await this.repository.get()).library?.snoozed.filter((s) => s.ready)
        .length ?? 0;
    await chrome.action.setBadgeText({ text: count ? String(count) : '' });
    if (
      count &&
      (await chrome.permissions.contains({ permissions: ['notifications'] }))
    )
      await chrome.notifications.create('sidekick-snoozed', {
        type: 'basic',
        iconUrl: 'icon/128.png',
        title: 'Sidekick reminders',
        message: `${count} snoozed tab reminder${count === 1 ? ' is' : 's are'} ready. Open Sidekick’s Library to restore.`,
      });
  }
  private async execute(
    c: ProductivityCommand,
    windowId: number,
  ): Promise<{
    backup?: string;
    preview?: { token: string; workspaces: number; pages: number };
  }> {
    const workspaceId = await this.workspaces.activeWorkspace(windowId);
    switch (c.type) {
      case 'onboarding.dismiss':
        await this.repository.update((m) => ({
          ...m,
          onboardingDismissed: true,
        }));
        break;
      case 'session.save': {
        const pages = snapshotPages(
          (await this.workspaces.snapshot(windowId)).tabs,
        );
        if (!pages.length)
          throw Error('No supported pages to save in this workspace.');
        await this.repository.update((m) => {
          const l = m.library ?? emptyLibrary();
          return {
            ...m,
            library: {
              ...l,
              sessions: [
                ...l.sessions,
                {
                  id: crypto.randomUUID(),
                  workspaceId,
                  name: c.name.trim(),
                  createdAt: new Date().toISOString(),
                  pages,
                },
              ],
            },
          };
        });
        break;
      }
      case 'session.rename':
      case 'session.delete':
        await this.repository.update((m) => {
          const l = m.library ?? emptyLibrary();
          const s = l.sessions.find(
            (s) => s.id === c.id && s.workspaceId === workspaceId,
          );
          if (!s) throw Error('Session no longer exists in this workspace.');
          return {
            ...m,
            library: {
              ...l,
              sessions:
                c.type === 'session.delete'
                  ? l.sessions.filter((s) => s.id !== c.id)
                  : l.sessions.map((s) =>
                      s.id === c.id ? { ...s, name: c.name.trim() } : s,
                    ),
            },
          };
        });
        break;
      case 'session.restore': {
        const s = (await this.repository.get()).library?.sessions.find(
          (s) => s.id === c.id && s.workspaceId === workspaceId,
        );
        if (!s) throw Error('Session no longer exists in this workspace.');
        const selected = c.urls
          ? s.pages.filter((p) => c.urls!.includes(p.url))
          : s.pages;
        if (c.urls?.some((url) => !s.pages.some((p) => p.url === url)))
          throw Error('Unknown saved page.');
        for (const p of selected)
          await this.workspaces.open(windowId, p.url, s.workspaceId);
        break;
      }
      case 'snooze.create':
      case 'archive.tab': {
        const { tab, workspaceId: owner } = await this.live(windowId, c.tabId);
        if (
          c.type === 'snooze.create' &&
          (c.dueAt < Date.now() + 1000 || c.dueAt > Date.now() + 366 * 86400000)
        )
          throw Error('Choose a future reminder within one year.');
        const saved = {
          ...storedPage(owner, tab),
          ...(c.type === 'snooze.create'
            ? { dueAt: c.dueAt, ready: false }
            : {}),
        };
        await this.repository.update((m) => {
          const l = m.library ?? emptyLibrary(),
            key = c.type === 'snooze.create' ? 'snoozed' : 'archive';
          return { ...m, library: { ...l, [key]: [...l[key], saved] } };
        });
        if (c.type === 'snooze.create')
          await chrome.alarms.create('sidekick:snooze:' + saved.id, {
            when: c.dueAt,
          });
        if (c.close) await chrome.tabs.remove(tab.id);
        break;
      }
      case 'archive.resource':
        await this.repository.update((m) => {
          const items = c.kind === 'favorite' ? m.favorites : m.pinnedEntries;
          if (
            !items.some((e) => e.id === c.id && e.workspaceId === workspaceId)
          )
            throw Error('Resource no longer exists in this workspace.');
          return archiveResource(m, c.kind, c.id);
        });
        break;
      case 'snooze.restore':
      case 'archive.restore': {
        const l = (await this.repository.get()).library ?? emptyLibrary(),
          key = c.type === 'snooze.restore' ? 'snoozed' : 'archive';
        const p = l[key].find(
          (p) => p.id === c.id && p.workspaceId === workspaceId,
        );
        if (!p) throw Error('Saved page no longer exists in this workspace.');
        await this.workspaces.open(windowId, p.url, p.workspaceId);
        await this.repository.update((m) => {
          const l = m.library ?? emptyLibrary();
          return {
            ...m,
            library: { ...l, [key]: l[key].filter((p) => p.id !== c.id) },
          };
        });
        if (key === 'snoozed')
          await chrome.alarms.clear('sidekick:snooze:' + c.id);
        break;
      }
      case 'snooze.cancel':
      case 'archive.delete':
        await this.repository.update((m) => {
          const l = m.library ?? emptyLibrary(),
            key = c.type === 'snooze.cancel' ? 'snoozed' : 'archive';
          return {
            ...m,
            library: {
              ...l,
              [key]: l[key].filter(
                (p) => p.id !== c.id || p.workspaceId !== workspaceId,
              ),
            },
          };
        });
        if (c.type === 'snooze.cancel')
          await chrome.alarms.clear('sidekick:snooze:' + c.id);
        break;
      case 'backup.export':
        return {
          backup: JSON.stringify(
            exportBackup(await this.repository.get()),
            null,
            2,
          ),
        };
      case 'backup.preview': {
        const backup = parseBackup(c.text),
          token = crypto.randomUUID();
        await chrome.storage.session.set({
          ['sidekick:import:' + token]: {
            backup,
            windowId,
            expires: Date.now() + 600000,
          },
        });
        return {
          preview: {
            token,
            workspaces: backup.metadata.workspaces.length,
            pages:
              backup.metadata.favorites.length +
              backup.metadata.pinnedEntries.length +
              (backup.metadata.library?.sessions.reduce(
                (n, s) => n + s.pages.length,
                0,
              ) ?? 0),
          },
        };
      }
      case 'backup.import': {
        const key = 'sidekick:import:' + c.token;
        const pending = (await chrome.storage.session.get(key))[key] as
          | {
              windowId: number;
              expires: number;
              backup: import('./backup').Backup;
            }
          | undefined;
        if (
          !pending ||
          pending.windowId !== windowId ||
          pending.expires < Date.now()
        )
          throw Error('Import preview expired. Preview the file again.');
        await this.repository.update((m) => mergeBackup(m, pending.backup));
        await chrome.storage.session.remove(key);
        await this.reconcileAlarms();
        break;
      }
    }
    if (c.type.startsWith('snooze.')) {
      const count =
        (await this.repository.get()).library?.snoozed.filter((s) => s.ready)
          .length ?? 0;
      await chrome.action.setBadgeText({ text: count ? String(count) : '' });
    }
    return {};
  }
}
