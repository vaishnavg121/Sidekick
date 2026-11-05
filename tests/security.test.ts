import { describe, expect, it } from 'vitest';
import { createMetadata } from '../lib/models';
import {
  isMetadata,
  MetadataRepository,
  type StorageArea,
} from '../lib/repository';
import { isCommand } from '../lib/protocol';
import { moveFolder } from '../lib/resources';
import { exportBackup } from '../lib/backup';
const memory = (): StorageArea => {
  const d: Record<string, unknown> = {};
  return {
    get: async (k) => ({ [k]: structuredClone(d[k]) }),
    set: async (v) => {
      Object.assign(d, structuredClone(v));
    },
  };
};
describe('trusted payload and storage boundaries', () => {
  it('rejects forged AI confidence, tab handles, categories and groups before side effects', () => {
    expect(
      isCommand({
        type: 'ai.apply.classification',
        classifications: [
          { tabId: 1, category: 'Other', confidence: NaN, reasoning: '' },
        ],
      }),
    ).toBe(false);
    expect(
      isCommand({
        type: 'ai.apply.classification',
        classifications: [
          { tabId: -1, category: 'fake', confidence: 1, reasoning: '' },
        ],
      }),
    ).toBe(false);
    expect(
      isCommand({
        type: 'ai.apply.groups',
        groups: [{ tabs: [1, 'foreign'], topic: 'x', description: '' }],
      }),
    ).toBe(false);
    expect(
      isCommand({
        type: 'focus.update',
        goal: 'Work',
        mode: true,
        hiddenTabIds: ['unsafe'],
      }),
    ).toBe(false);
    expect(
      isCommand({
        type: 'ai.settings.update',
        patch: { connected: true, status: 'connected' },
      }),
    ).toBe(false);
  });
  it('rejects null and malformed persisted AI preferences instead of crashing the UI', () => {
    const m = createMetadata();
    for (const value of [
      null,
      {
        tabClassifications: null,
        rejectedRecommendations: {},
        focusPreferences: {},
      },
      {
        tabClassifications: {},
        rejectedRecommendations: {},
        focusPreferences: { x: { mode: 'true' } },
      },
    ])
      expect(isMetadata({ ...m, aiState: value })).toBe(false);
  });
  it('moves nested folder subtrees across workspaces with stable IDs and validates cycles', () => {
    const m = createMetadata(),
      source = m.activeWorkspaceId,
      target = 'target';
    m.workspaces.push({ ...m.workspaces[0]!, id: target });
    m.folders = [
      {
        id: 'parent',
        workspaceId: source,
        parentId: null,
        name: 'Projects',
        order: 0,
      },
      {
        id: 'child',
        workspaceId: source,
        parentId: 'parent',
        name: 'Docs',
        order: 0,
      },
    ];
    m.pinnedEntries = [
      {
        id: 'p',
        workspaceId: source,
        folderId: 'child',
        title: 'Docs',
        url: 'https://example.com/',
        order: 0,
      },
    ];
    const moved = moveFolder(m, 'parent', target, null);
    expect(isMetadata(moved)).toBe(true);
    expect(moved.folders.every((f) => f.workspaceId === target)).toBe(true);
    expect(moved.pinnedEntries[0]).toMatchObject({
      id: 'p',
      workspaceId: target,
      folderId: 'child',
    });
    expect(() => moveFolder(m, 'parent', source, 'child')).toThrow(
      'descendant',
    );
    expect(m.folders[0]!.workspaceId).toBe(source);
  });
  it('refuses a colliding folder move without losing either saved resource', () => {
    const m = createMetadata(),
      source = m.activeWorkspaceId,
      target = 'target';
    m.workspaces.push({ ...m.workspaces[0]!, id: target });
    m.folders = [
      {
        id: 'f',
        workspaceId: source,
        parentId: null,
        name: 'Folder',
        order: 0,
      },
    ];
    m.pinnedEntries = [
      {
        id: 'a',
        workspaceId: source,
        folderId: 'f',
        title: 'Source',
        url: 'https://example.com/',
        order: 0,
      },
      {
        id: 'b',
        workspaceId: target,
        folderId: null,
        title: 'Destination',
        url: 'https://example.com/',
        order: 0,
      },
    ];
    expect(() => moveFolder(m, 'f', target, null)).toThrow('already contains');
    expect(m.pinnedEntries).toHaveLength(2);
  });
  it('deletes only empty workspaces and preserves all data when deletion is refused', async () => {
    const repo = new MetadataRepository(memory()),
      m = await repo.get();
    await expect(repo.deleteWorkspace(m.activeWorkspaceId)).rejects.toThrow(
      'at least one',
    );
    await repo.authorWorkspace({
      name: 'Research',
      color: '#abcdef',
      icon: 'R',
      theme: 'dark',
      preferredEmail: '',
    });
    const id = (await repo.get()).workspaces[1]!.id;
    await repo.authorResource('favorite', {
      workspaceId: id,
      title: 'Docs',
      url: 'https://example.com/',
    });
    await expect(repo.deleteWorkspace(id)).rejects.toThrow('resources');
    expect((await repo.get()).favorites).toHaveLength(1);
    await repo.removeFavorite((await repo.get()).favorites[0]!.id);
    await repo.deleteWorkspace(id);
    expect((await repo.get()).workspaces).toHaveLength(1);
  });
  it('does not export legacy AI keys or accepted/rejected session handles', () => {
    const m = createMetadata();
    m.aiSettings = {
      status: 'connected',
      connected: true,
      gatewayKey: 'PRIVATE_TEST_KEY',
    };
    m.aiState = {
      tabClassifications: {},
      rejectedRecommendations: { 123: ['x'] },
      focusPreferences: {},
    };
    const json = JSON.stringify(exportBackup(m));
    expect(json).not.toMatch(
      /PRIVATE_TEST_KEY|tabClassifications|rejectedRecommendations/,
    );
  });
});
