import { describe, expect, it } from 'vitest';
import {
  MetadataRepository,
  METADATA_KEY,
  SessionRepository,
  type StorageArea,
} from '../lib/repository';
function memory(): StorageArea & { data: Record<string, unknown> } {
  return {
    data: {},
    async get(key) {
      return structuredClone({ [key]: this.data[key] });
    },
    async set(items) {
      Object.assign(this.data, structuredClone(items));
    },
  };
}
describe('repositories', () => {
  it('persists workspace email, favorites, pinned entries and nested folder metadata', async () => {
    const repo = new MetadataRepository(memory());
    const m = await repo.get();
    const workspace = {
      ...m.workspaces[0]!,
      preferredEmail: 'personal@example.test',
    };
    await repo.saveWorkspace(workspace);
    await repo.saveFolder({
      id: 'root',
      workspaceId: workspace.id,
      parentId: null,
      name: 'Reading',
      order: 0,
    });
    await repo.saveFolder({
      id: 'nested',
      workspaceId: workspace.id,
      parentId: 'root',
      name: 'Later',
      order: 0,
    });
    const favorite = {
      id: 'entry',
      workspaceId: workspace.id,
      title: 'Docs',
      url: 'https://example.test',
      order: 0,
    };
    await repo.saveFavorite(favorite);
    await repo.savePinnedEntry({ ...favorite, folderId: 'nested' });
    await repo.saveFavorite({ ...favorite, title: 'Updated docs' });
    const saved = await repo.get();
    expect(saved.workspaces[0]?.preferredEmail).toBe('personal@example.test');
    expect(saved.folders).toHaveLength(2);
    expect(saved.favorites).toEqual([{ ...favorite, title: 'Updated docs' }]);
    expect(saved.pinnedEntries[0]?.folderId).toBe('nested');
    await expect(
      repo.saveFolder({ ...saved.folders[0]!, parentId: 'nested' }),
    ).rejects.toThrow('Invalid workspace metadata');
    expect((await repo.get()).folders[0]?.parentId).toBeNull();
  });
  it('initializes once, survives repository recreation and selects an existing workspace', async () => {
    const area = memory();
    const repo = new MetadataRepository(area);
    const [a, b] = await Promise.all([repo.get(), repo.get()]);
    expect(a).toEqual(b);
    const fresh = new MetadataRepository(area);
    expect(await fresh.get()).toEqual(a);
    expect(
      (await fresh.selectWorkspace(a.activeWorkspaceId)).activeWorkspaceId,
    ).toBe(a.activeWorkspaceId);
    await expect(repo.selectWorkspace('missing')).rejects.toThrow(
      'no longer exists',
    );
  });
  it('serializes concurrent updates without losing fields', async () => {
    const repo = new MetadataRepository(memory());
    await Promise.all([
      repo.updatePreferences({ width: 390 }),
      repo.updatePreferences({ mode: 'pinned' }),
      repo.updatePreferences({ closeDelay: 900 }),
    ]);
    expect((await repo.get()).preferences).toEqual({
      width: 390,
      mode: 'pinned',
      closeDelay: 900,
      openDelay: 180,
    });
  });
  it('preserves unreadable metadata and recovers after a failed write', async () => {
    const area = memory();
    area.data[METADATA_KEY] = { version: 999 };
    const repo = new MetadataRepository(area);
    await expect(repo.get()).rejects.toThrow('preserved');
    expect(area.data[METADATA_KEY]).toEqual({ version: 999 });
    delete area.data[METADATA_KEY];
    const original = area.set.bind(area);
    area.set = async () => {
      throw new Error('quota');
    };
    await expect(repo.get()).rejects.toThrow('quota');
    area.set = original;
    expect((await repo.get()).workspaces).toHaveLength(1);
  });
  it('stores ephemeral browser handles separately from local metadata', async () => {
    const local = memory();
    const session = memory();
    await new MetadataRepository(local).get();
    const repo = new SessionRepository(session);
    expect(await repo.get()).toEqual({ memberships: [], groups: [] });
    const value = {
      memberships: [{ tabId: 42, workspaceId: 'w', windowId: 1 }],
      groups: [{ workspaceId: 'w', windowId: 1, groupId: 8 }],
    };
    await repo.save(value);
    expect(await repo.get()).toEqual(value);
    expect(JSON.stringify(local.data)).not.toContain('tabId');
  });
});
