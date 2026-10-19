import { describe, expect, it } from 'vitest';
import {
  MetadataRepository,
  METADATA_KEY,
  type StorageArea,
} from '../lib/repository';
import { createMetadata } from '../lib/models';
import { moveBefore } from '../lib/ordering';
import { dockWidth } from '../lib/docking';
import { resourceKey } from '../lib/resources';
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
  return { data, area, repo: new MetadataRepository(area) };
}
describe('workspace resource authoring', () => {
  it('serializes repeated favorite saves and preserves a stable ID', async () => {
    const { repo, area } = setup();
    const m = await repo.get();
    const input = {
      workspaceId: m.activeWorkspaceId,
      title: 'Docs',
      url: 'https://example.com',
    };
    await Promise.all(
      Array.from({ length: 8 }, () => repo.authorResource('favorite', input)),
    );
    let saved = await repo.get();
    expect(saved.favorites).toHaveLength(1);
    const id = saved.favorites[0]!.id;
    await repo.authorResource('favorite', { ...input, id, title: 'Renamed' });
    saved = await new MetadataRepository(area).get();
    expect(saved.favorites[0]).toMatchObject({
      id,
      title: 'Renamed',
      url: 'https://example.com/',
    });
  });
  it('keeps independent workspace favorites, moves entries, and validates reorder snapshots', async () => {
    const { repo } = setup();
    const m = await repo.get();
    await repo.authorWorkspace({
      name: 'Work',
      color: '#abcdef',
      icon: 'W',
      theme: 'light',
      preferredEmail: 'work@example.test',
    });
    const work = (await repo.get()).activeWorkspaceId;
    for (const url of ['https://a.example', 'https://b.example'])
      await repo.authorResource('favorite', {
        workspaceId: m.activeWorkspaceId,
        title: url,
        url,
      });
    let saved = await repo.get();
    const [a, b] = saved.favorites;
    await repo.reorder('favorite', m.activeWorkspaceId, [b!.id, a!.id], null);
    expect(
      (await repo.get()).favorites.find((e) => e.id === b!.id)?.order,
    ).toBe(0);
    await expect(
      repo.reorder('favorite', m.activeWorkspaceId, [a!.id], null),
    ).rejects.toThrow('list changed');
    await repo.moveResource('favorite', a!.id, work, null);
    saved = await repo.get();
    expect(saved.favorites.find((e) => e.id === a!.id)?.workspaceId).toBe(work);
    await expect(
      repo.authorResource('favorite', {
        id: b!.id,
        workspaceId: work,
        title: 'Collision',
        url: 'https://a.example',
      }),
    ).rejects.toThrow('already saved');
  });
  it('preserves nested pinned folders, prevents cross-workspace references and removes only empty folders', async () => {
    const { repo, area } = setup();
    const m = await repo.get();
    await repo.authorFolder({
      workspaceId: m.activeWorkspaceId,
      parentId: null,
      name: 'Root',
    });
    const root = (await repo.get()).folders[0]!;
    await repo.authorFolder({
      workspaceId: m.activeWorkspaceId,
      parentId: root.id,
      name: 'Child',
    });
    const child = (await repo.get()).folders[1]!;
    await repo.authorResource('pinned', {
      workspaceId: m.activeWorkspaceId,
      folderId: child.id,
      title: 'Pinned',
      url: 'https://example.com',
    });
    await expect(repo.removeFolder(root.id)).rejects.toThrow('Move');
    await expect(
      repo.authorFolder({ ...root, parentId: child.id }),
    ).rejects.toThrow('Invalid');
    await repo.authorFolder({ ...child, collapsed: true });
    let saved = await new MetadataRepository(area).get();
    expect(saved.folders[1]?.collapsed).toBe(true);
    const entry = saved.pinnedEntries[0]!;
    await repo.moveResource('pinned', entry.id, m.activeWorkspaceId, null);
    await repo.removeFolder(child.id);
    await repo.removeFolder(root.id);
    saved = await repo.get();
    expect(saved.folders).toEqual([]);
    expect(saved.pinnedEntries[0]?.folderId).toBeNull();
  });
  it('migrates legacy native-pinned display to custom docking once without changing entry IDs', async () => {
    const { repo, data, area } = setup();
    const m = createMetadata();
    delete m.layoutVersion;
    m.preferences.mode = 'pinned';
    m.preferences.width = 340;
    m.favorites = [
      {
        id: 'stable',
        workspaceId: m.activeWorkspaceId,
        title: 'Saved',
        url: 'https://example.com',
        order: 0,
      },
    ];
    data[METADATA_KEY] = m;
    const migrated = await repo.get();
    expect(migrated.preferences).toMatchObject({ mode: 'docked', width: 340 });
    expect(migrated.favorites[0]?.id).toBe('stable');
    expect(migrated.layoutVersion).toBe(2);
    await repo.updatePreferences({ mode: 'pinned' });
    expect((await new MetadataRepository(area).get()).preferences.mode).toBe(
      'pinned',
    );
  });
  it('stores workspace theme, icon and email without physical tab IDs', async () => {
    const { repo, area } = setup();
    const m = await repo.get();
    await repo.authorWorkspace({
      id: m.activeWorkspaceId,
      name: 'Research',
      icon: '✦',
      color: '#aabbcc',
      theme: 'system',
      preferredEmail: 'research@example.test',
    });
    const saved = await new MetadataRepository(area).get();
    expect(saved.activeWorkspaceId).toBe(m.activeWorkspaceId);
    expect(saved.workspaces[0]).toMatchObject({
      name: 'Research',
      icon: '✦',
      theme: 'system',
      preferredEmail: 'research@example.test',
    });
    expect(JSON.stringify(saved)).not.toMatch(/tabId|windowId/);
  });
  it('rejects unsafe addresses and invalid destinations without losing existing records', async () => {
    const { repo } = setup();
    const m = await repo.get();
    await expect(
      repo.authorResource('favorite', {
        workspaceId: m.activeWorkspaceId,
        title: 'Unsafe',
        url: 'javascript:alert(1)',
      }),
    ).rejects.toThrow();
    await expect(
      repo.authorResource('pinned', {
        workspaceId: m.activeWorkspaceId,
        title: 'Bad folder',
        url: 'https://example.com',
        folderId: 'missing',
      }),
    ).rejects.toThrow('Invalid');
    expect((await repo.get()).pinnedEntries).toEqual([]);
  });
});
describe('dock and ordering decisions', () => {
  it('matches Chrome internal addresses with and without their trailing slash', () => {
    expect(resourceKey('chrome://settings')).toBe(
      resourceKey('chrome://settings/'),
    );
  });
  it('refuses narrow layouts and clamps widths', () => {
    expect(dockWidth(320, 1280)).toBe(320);
    expect(dockWidth(320, 790)).toBeUndefined();
    expect(dockWidth(1000, 1280)).toBe(440);
  });
  it('reorders by stable IDs without duplication', () => {
    expect(moveBefore(['a', 'b', 'c'], 'c', 'a')).toEqual(['c', 'a', 'b']);
    expect(moveBefore(['a', 'b'], 'a', 'a')).toEqual(['a', 'b']);
  });
});
