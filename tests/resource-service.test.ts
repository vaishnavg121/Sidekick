import { afterEach, describe, expect, it, vi } from 'vitest';
import { ResourceService } from '../lib/resource-service';
import { MetadataRepository, type StorageArea } from '../lib/repository';
function setup() {
  const data: Record<string, unknown> = {};
  const area: StorageArea = {
    async get(key) {
      return structuredClone({ [key]: data[key] });
    },
    async set(items) {
      Object.assign(data, structuredClone(items));
    },
  };
  const repository = new MetadataRepository(area);
  const tabs: {
    id: number;
    windowId: number;
    url: string;
    title?: string;
    active?: boolean;
  }[] = [];
  const create = vi.fn(async (options: { windowId: number; url: string }) => {
    const tab = { ...options, id: 100 + tabs.length, active: true };
    tabs.push(tab);
    return tab;
  });
  const update = vi.fn(async (id: number, options: { active: boolean }) => {
    const tab = tabs.find((t) => t.id === id);
    if (!tab) throw Error('Missing tab');
    tab.active = options.active;
    return tab;
  });
  vi.stubGlobal('chrome', {
    tabs: {
      query: vi.fn(async (options: { windowId: number; active?: boolean }) =>
        tabs.filter(
          (t) =>
            t.windowId === options.windowId && (!options.active || t.active),
        ),
      ),
      get: vi.fn(async (id: number) => tabs.find((t) => t.id === id)),
      create,
      update,
    },
  });
  return {
    repository,
    tabs,
    create,
    update,
    service: new ResourceService(repository),
  };
}
afterEach(() => vi.unstubAllGlobals());
describe('resource live-tab recovery', () => {
  it('serializes rapid opens so only one new tab is created', async () => {
    const s = setup();
    const m = await s.repository.get();
    await s.repository.authorResource('favorite', {
      workspaceId: m.activeWorkspaceId,
      title: 'Docs',
      url: 'https://example.com',
    });
    const id = (await s.repository.get()).favorites[0]!.id;
    await Promise.all(
      Array.from({ length: 8 }, () =>
        s.service.handle({ type: 'resource.open', kind: 'favorite', id }, 7),
      ),
    );
    expect(s.create).toHaveBeenCalledTimes(1);
    expect(s.update).toHaveBeenCalledTimes(7);
  });
  it('reopens closed pinned URLs without persisting browser tab IDs', async () => {
    const s = setup();
    const m = await s.repository.get();
    await s.repository.authorResource('pinned', {
      workspaceId: m.activeWorkspaceId,
      title: 'Pinned',
      url: 'https://example.com',
    });
    const id = (await s.repository.get()).pinnedEntries[0]!.id;
    await s.service.handle({ type: 'resource.open', kind: 'pinned', id }, 7);
    s.tabs.length = 0;
    await s.service.handle({ type: 'resource.open', kind: 'pinned', id }, 7);
    expect(s.create).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(await s.repository.get())).not.toMatch(
      /tabId|windowId/,
    );
  });
  it('rejects a dragged tab that moved to another window', async () => {
    const s = setup();
    s.tabs.push({ id: 8, windowId: 9, url: 'https://example.com' });
    await expect(
      s.service.handle(
        { type: 'resource.current', kind: 'pinned', tabId: 8 },
        7,
      ),
    ).rejects.toThrow('current window');
    expect((await s.repository.get()).pinnedEntries).toHaveLength(0);
  });
});
