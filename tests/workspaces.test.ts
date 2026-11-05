import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkspaceEngine } from '../lib/workspaces';
import { MetadataRepository, type StorageArea } from '../lib/repository';
import { WindowStateRepository } from '../lib/window-state';

function memory(): StorageArea {
  const data: Record<string, unknown> = {};
  return {
    get: async (k) => structuredClone({ [k]: data[k] }),
    set: async (v) => {
      Object.assign(data, structuredClone(v));
    },
  };
}
describe('logical workspace runtime', () => {
  let engine: WorkspaceEngine,
    repository: MetadataRepository,
    area: StorageArea,
    windows: WindowStateRepository;
  let tabs: chrome.tabs.Tab[], first: string, second: string;
  const api = {
    query: vi.fn(),
    get: vi.fn(),
    update: vi.fn(),
    create: vi.fn(),
    move: vi.fn(),
  };
  beforeEach(async () => {
    vi.clearAllMocks();
    area = memory();
    repository = new MetadataRepository(memory());
    windows = new WindowStateRepository(area);
    const m = await repository.get();
    first = m.activeWorkspaceId;
    await repository.authorWorkspace({
      name: 'Entertainment',
      color: '#abcdef',
      icon: 'E',
      theme: 'dark',
      preferredEmail: '',
    });
    second = (await repository.get()).workspaces[1]!.id;
    await repository.selectWorkspace(first);
    tabs = [1, 2, 3, 4].map(
      (id, index) =>
        ({
          id,
          windowId: 1,
          index,
          active: id === 1,
          url: `https://example.com/${id}`,
          title: `Tab ${id}`,
          pinned: false,
          groupId: -1,
        }) as chrome.tabs.Tab,
    );
    api.query.mockImplementation(async (q) =>
      tabs.filter((t) => !q.windowId || t.windowId === q.windowId),
    );
    api.get.mockImplementation(async (id) => {
      const t = tabs.find((t) => t.id === id);
      if (!t) throw Error('No tab');
      return t;
    });
    api.update.mockImplementation(async (id, patch) => {
      const tab = tabs.find((t) => t.id === id)!;
      if (patch.active)
        tabs.forEach((t) => {
          if (t.windowId === tab.windowId) t.active = t.id === id;
        });
      return Object.assign(tab, patch);
    });
    api.create.mockImplementation(async (options) => {
      const tab = {
        id: Math.max(...tabs.map((t) => t.id!)) + 1,
        index: tabs.length,
        active: true,
        ...options,
      } as chrome.tabs.Tab;
      tabs.push(tab);
      return tab;
    });
    engine = new WorkspaceEngine(repository, area, windows, api);
    await engine.reconcile();
  });
  it('partitions four live tabs, switches without reload/create, and moves only membership', async () => {
    await engine.move(3, 1, second);
    await engine.move(4, 1, second);
    expect((await engine.snapshot(1)).tabs.map((t) => t.id)).toEqual([1, 2]);
    await engine.select(1, second);
    expect((await engine.snapshot(1)).tabs.map((t) => t.id)).toEqual([3, 4]);
    for (let n = 0; n < 5; n++) {
      await engine.select(1, first);
      await engine.select(1, second);
    }
    await engine.select(1, first);
    await engine.move(1, 1, second);
    expect((await engine.snapshot(1)).tabs.map((t) => t.id)).toEqual([2]);
    await engine.select(1, second);
    expect((await engine.snapshot(1)).tabs.map((t) => t.id)).toEqual([1, 3, 4]);
    expect(tabs).toHaveLength(4);
    expect(api.create).not.toHaveBeenCalled();
    expect(
      api.update.mock.calls.every(
        ([, patch]) => Object.keys(patch).join() === 'active',
      ),
    ).toBe(true);
  });
  it('remembers last active tab, including after a worker restart', async () => {
    await api.update(2, { active: true });
    await engine.activated(2, 1);
    await engine.select(1, second);
    engine = new WorkspaceEngine(repository, area, windows, api);
    await engine.select(1, first);
    expect(api.update).toHaveBeenLastCalledWith(2, { active: true });
  });
  it('manual Chrome activation follows the assigned workspace', async () => {
    await engine.move(3, 1, second);
    await api.update(3, { active: true });
    await engine.activated(3, 1);
    expect((await engine.snapshot(1)).workspaceId).toBe(second);
  });
  it('keeps two windows independently selected', async () => {
    tabs.push({ ...tabs[0]!, id: 5, windowId: 2 });
    await engine.reconcile();
    await engine.select(1, second);
    expect((await engine.snapshot(2)).workspaceId).toBe(first);
    expect((await engine.snapshot(1)).workspaceId).toBe(second);
  });
  it('inherits the window selection for newly created tabs', async () => {
    await engine.select(1, second);
    await engine.create(1, 'https://new.example/');
    expect((await engine.snapshot(1)).tabs).toHaveLength(1);
  });
  it('cleans closed and replaced handles without dropping other memberships', async () => {
    await engine.move(3, 1, second);
    tabs = tabs.filter((t) => t.id !== 2);
    tabs.find((t) => t.id === 3)!.id = 30;
    await engine.replaced(30, 3);
    await engine.select(1, second);
    expect((await engine.snapshot(1)).tabs.map((t) => t.id)).toEqual([30]);
  });
  it('retains workspace on transfer to another window', async () => {
    await engine.move(3, 1, second);
    tabs.find((t) => t.id === 3)!.windowId = 2;
    await engine.reconcile();
    await engine.select(2, second);
    expect((await engine.snapshot(2)).tabs.map((t) => t.id)).toEqual([3]);
  });
  it('rejects spoofed cross-window moves and foreign source membership', async () => {
    await expect(engine.move(1, 99, second)).rejects.toThrow('another window');
    await engine.move(3, 1, second);
    await expect(engine.move(3, 1, first)).rejects.toThrow(
      'selected workspace',
    );
    await expect(engine.select(1, 'missing')).rejects.toThrow();
  });
  it('reconciles fresh IDs safely after browser session storage clears', async () => {
    await engine.move(3, 1, second);
    tabs = tabs.map((t) => ({ ...t, id: t.id! + 100 }));
    const fresh = memory();
    engine = new WorkspaceEngine(
      repository,
      fresh,
      new WindowStateRepository(fresh),
      api,
    );
    expect((await engine.snapshot(1)).tabs).toHaveLength(3);
    await engine.select(1, second);
    expect((await engine.snapshot(1)).tabs.map((t) => t.id)).toEqual([103]);
    expect((await engine.snapshot(1)).tabs.every((t) => t.id >= 101)).toBe(
      true,
    );
  });
  it('reuses a matching live tab and serializes concurrent opens', async () => {
    await Promise.all([
      engine.open(1, 'https://example.com/1', second),
      engine.open(1, 'https://example.com/1', second),
    ]);
    expect(api.create).not.toHaveBeenCalled();
    expect(tabs).toHaveLength(4);
    expect((await engine.snapshot(1)).tabs.map((t) => t.id)).toEqual([1]);
  });
  it('reorders with actual Chrome indices and rejects native pinned/group boundaries', async () => {
    await engine.reorder(1, 1, 3);
    expect(api.move).toHaveBeenCalledWith(1, { index: 3 });
    tabs[3]!.pinned = true;
    await expect(engine.reorder(1, 1, 3)).rejects.toThrow('native pinned');
    tabs[3]!.pinned = false;
    tabs[3]!.groupId = 9;
    await expect(engine.reorder(1, 1, 3)).rejects.toThrow('tab group');
  });
});
